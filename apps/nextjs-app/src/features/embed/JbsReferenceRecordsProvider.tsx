import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { FieldType } from '@teable/core';
import { getFields, getViewList } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import {
  JbsReferenceRecordsContext,
  JbsReferenceRecordsContextDefaultValue,
  isJbsReferenceDictFieldMeta,
  mapDictChoicesToSelectOptions,
  setJbsReferenceBridgeHandlers,
  useJbsReferenceRecords,
  type IJbsDrillFieldSaveParams,
  type IJbsDrillFieldSaveResult,
  type IJbsReferenceFieldMeta,
  type IJbsReferenceRecordsContextValue,
} from '@teable/sdk/context';
import {
  TablePermissionContext,
  TablePermissionContextDefaultValue,
} from '@teable/sdk/context/table-permission';
import { useFields, useTable, useTableId, useViews } from '@teable/sdk/hooks';
import type { Table } from '@teable/sdk/model/table/table';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import type { ReactNode } from 'react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { applyDrillMetaToFieldMetas } from './apply-drill-field-metas';
import type { IPreviewColumn } from './build-create-table-from-preview';
import { buildReferenceFieldMetas } from './build-reference-edit-data';
import { formatCellValueForMain } from './format-cell-value-for-main';
import {
  buildDictLookupsByFieldAlias,
  clearJbsDictCache,
  syncReferenceDictFieldOptions,
  type IJbsDictFieldLookup,
} from './jbs-dict-field';
import {
  fetchJbsRelatedInfo,
  fetchLltableKeywordDetail,
  requestJbsAuth,
  type IJbsKeywordDetail,
} from './jbs-main-api-client';
import {
  JBS_REFERENCE_DRILL_FIELD_EDIT_HINT,
  JBS_REFERENCE_FIELD_NOT_EDITABLE_MESSAGE,
} from './jbs-reference-messages';
import {
  buildJbsReferenceTableMetaForCreate,
  buildKeywordDetailRequestPath,
  parseJbsTableMeta,
  type IJbsReferenceTableMeta,
} from './jbs-table-meta';
import { JbsDrillFieldProvider } from './JbsDrillFieldProvider';
import { getRowValue } from './map-preview-row-utils';
import { mapPreviewRowsByColumnKeys } from './map-preview-rows-by-columns';
import { assertEditableReferenceContext, persistReferenceRow } from './persist-reference-row';
import {
  buildColumnsFingerprint,
  buildOrderedFieldsForRowMap,
  patchLocalReferenceRecord,
} from './reference-record-local-patch';
import { fetchReferenceTablePreview } from './reference-table-preview';
import { resolveJbsFieldAlias } from './resolve-jbs-field-alias';
import {
  buildDrillFieldCellUpdates,
  buildMainRowUpdatesFromDrillSelection,
} from './save-drill-field-selection';
import { syncReferenceTableFields } from './sync-reference-table-fields';
import {
  buildHiddenFieldIdsFromColumns,
  syncReferenceViewHiddenFields,
  syncReferenceViewHiddenFieldsForTable,
} from './sync-reference-view-hidden-fields';

type ILoadReferenceDataOptions = {
  /** 仅拉 preview 并重映射行，跳过字段/字典/视图结构同步 */
  dataOnly?: boolean;
};

type IJbsReferenceRecordsProviderProps = {
  children: ReactNode;
};

/** 引用表权限：只读时禁写；可编辑时放开 record 读写、禁删与字段结构变更 */
const JbsReferencePermissionOverride = ({ children }: { children: ReactNode }) => {
  const basePermission = useContext(TablePermissionContext);
  const { isReferenceTable, readonly } = useJbsReferenceRecords();

  const merged = useMemo(() => {
    if (!isReferenceTable) {
      return basePermission;
    }
    const record = basePermission?.record ?? TablePermissionContextDefaultValue.record;
    const field = basePermission?.field ?? TablePermissionContextDefaultValue.field;

    if (readonly) {
      return {
        ...basePermission,
        record: {
          ...record,
          'record|create': false,
          'record|update': false,
          'record|delete': false,
        },
        field: {
          ...field,
          'field|create': false,
          'field|update': false,
          'field|delete': false,
        },
      };
    }

    // 可编辑引用表：允许增改行，不允许删行/改表结构
    return {
      ...basePermission,
      record: {
        ...record,
        'record|create': true,
        'record|update': true,
        'record|delete': false,
      },
      field: {
        ...field,
        'field|create': false,
        'field|update': false,
        'field|delete': false,
      },
    };
  }, [basePermission, isReferenceTable, readonly]);

  return (
    <TablePermissionContext.Provider value={merged}>{children}</TablePermissionContext.Provider>
  );
};

/** 将 Teable 行字段合并回 preview 行（key 为 fieldAlias），保留行内全部列 */
const mergeRecordFieldsToPreviewRow = (
  rawRow: Record<string, unknown>,
  recordFields: Record<string, unknown>,
  fieldMetas: IJbsReferenceFieldMeta[],
  fieldTypeById: Record<string, FieldType | undefined>,
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>
): Record<string, unknown> => {
  const merged = { ...rawRow };
  for (const meta of fieldMetas) {
    const teableValue = recordFields[meta.fieldId];
    if (teableValue !== undefined) {
      merged[meta.fieldAlias] = formatCellValueForMain(
        teableValue,
        fieldTypeById[meta.fieldId],
        meta,
        dictLookupsByAlias
      );
    } else if (getRowValue(merged, meta.fieldAlias) === undefined) {
      merged[meta.fieldAlias] = '';
    }
  }
  return merged;
};

/** 从 prefilling 字段 map 构建 preview 行（可编辑列取用户输入，不可编辑列置空） */
const buildPreviewRowFromFieldMap = (
  fieldsById: Record<string, unknown>,
  fieldMetas: IJbsReferenceFieldMeta[],
  fieldTypeById: Record<string, FieldType | undefined>,
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>
): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const meta of fieldMetas) {
    const value = meta.isEditable ? fieldsById[meta.fieldId] : undefined;
    row[meta.fieldAlias] =
      value === undefined
        ? ''
        : formatCellValueForMain(value, fieldTypeById[meta.fieldId], meta, dictLookupsByAlias);
  }
  return row;
};

/** 从下钻配置解析源字段 id */
const resolveDrillSourceFieldId = (
  drillMeta: { sourceFieldId?: string; sourceFieldAlias: string },
  fieldList: IJbsKeywordDetail['fieldList']
): string | undefined => {
  if (drillMeta.sourceFieldId) {
    return drillMeta.sourceFieldId;
  }
  return fieldList?.find((f) => f.id && resolveJbsFieldAlias(f) === drillMeta.sourceFieldAlias)?.id;
};

/** 下钻保存：合并 preview 行与参数字段更新 */
const mergeDrillPreviewRow = (
  params: {
    recordId: string;
    recordFields: Record<string, unknown>;
    paramUpdates: Record<string, unknown>;
  },
  metas: IJbsReferenceFieldMeta[],
  fieldTypeById: Record<string, FieldType | undefined>,
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>,
  rawRowsByRecordId: Record<string, Record<string, unknown>>
): Record<string, unknown> => {
  const rawRow = rawRowsByRecordId[params.recordId];
  if (!rawRow) {
    return {
      ...buildPreviewRowFromFieldMap(params.recordFields, metas, fieldTypeById, dictLookupsByAlias),
      ...params.paramUpdates,
    };
  }
  return {
    ...mergeRecordFieldsToPreviewRow(
      rawRow,
      params.recordFields,
      metas,
      fieldTypeById,
      dictLookupsByAlias
    ),
    ...params.paramUpdates,
  };
};

type IReferenceFieldSnapshot = { id: string; name: string; type?: FieldType };

type IReferenceLoadSyncResult = {
  syncedFields: IReferenceFieldSnapshot[];
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>;
  fieldsForRowMap: IReferenceFieldSnapshot[];
  dictOptionsChanged: boolean;
  structureUnchanged: boolean;
};

/** 字典选项变更后刷新 fieldsForRowMap */
const resolveFieldsForRowMapAfterDictSync = async (
  columns: IPreviewColumn[],
  syncedFields: IReferenceFieldSnapshot[],
  tableId: string,
  dictOptionsChanged: boolean
): Promise<IReferenceFieldSnapshot[]> => {
  if (!dictOptionsChanged) {
    return syncedFields;
  }
  try {
    const { data: latestFields } = await getFields(tableId);
    const ordered = buildOrderedFieldsForRowMap(columns, syncedFields, latestFields);
    return ordered.length ? ordered : syncedFields;
  } catch {
    return syncedFields;
  }
};

/** 列结构未变：仅刷新字典 lookup 与 Teable 字段选项 */
const refreshDictForUnchangedColumns = async (params: {
  columns: IPreviewColumn[];
  keyword: IJbsKeywordDetail;
  rows: Record<string, unknown>[];
  syncedFields: IReferenceFieldSnapshot[];
  table: Table;
  tableId: string;
  queryClient: QueryClient;
  syncedDictChoiceHashes: Map<string, string>;
}): Promise<
  Pick<IReferenceLoadSyncResult, 'dictLookupsByAlias' | 'fieldsForRowMap' | 'dictOptionsChanged'>
> => {
  const {
    columns,
    keyword,
    rows,
    syncedFields,
    table,
    tableId,
    queryClient,
    syncedDictChoiceHashes,
  } = params;
  try {
    const dictLookupsByAlias = await buildDictLookupsByFieldAlias(columns, keyword.fieldList, rows);
    const dictOptionsChanged = await syncReferenceDictFieldOptions({
      columns,
      fieldList: keyword.fieldList,
      snapshots: syncedFields,
      dictLookupsByAlias,
      updateField: (fieldId, fieldRo) => table.updateField(fieldId, fieldRo),
      syncedChoiceHashes: syncedDictChoiceHashes,
    });
    if (dictOptionsChanged) {
      await queryClient.invalidateQueries({
        queryKey: ReactQueryKeys.fieldList(tableId),
      });
    }
    const fieldsForRowMap = await resolveFieldsForRowMapAfterDictSync(
      columns,
      syncedFields,
      tableId,
      dictOptionsChanged
    );
    return { dictLookupsByAlias, fieldsForRowMap, dictOptionsChanged };
  } catch (dictErr) {
    console.warn('同步引用表字典字段失败', dictErr);
    return {
      dictLookupsByAlias: {},
      fieldsForRowMap: syncedFields,
      dictOptionsChanged: false,
    };
  }
};

/** 列结构变化：同步字段、字典、视图隐藏列 */
const syncReferenceColumnsStructure = async (params: {
  columns: IPreviewColumn[];
  keyword: IJbsKeywordDetail;
  rows: Record<string, unknown>[];
  currentFields: Array<{
    id: string;
    name: string;
    type: FieldType;
    isPrimary?: boolean;
    notNull?: boolean;
  }>;
  table: Table;
  tableId: string;
  queryClient: QueryClient;
  syncedDictChoiceHashes: Map<string, string>;
  isStale: () => boolean;
}): Promise<
  Pick<
    IReferenceLoadSyncResult,
    'syncedFields' | 'dictLookupsByAlias' | 'fieldsForRowMap' | 'dictOptionsChanged'
  > & { aborted: boolean; syncedHiddenViewIds: string[] }
> => {
  const {
    columns,
    keyword,
    rows,
    currentFields,
    table,
    tableId,
    queryClient,
    syncedDictChoiceHashes,
    isStale,
  } = params;

  const syncedFields = await syncReferenceTableFields(table, currentFields, columns);
  let dictLookupsByAlias: Record<string, IJbsDictFieldLookup> = {};
  let fieldsForRowMap: IReferenceFieldSnapshot[] = syncedFields;
  let dictOptionsChanged = false;

  try {
    dictLookupsByAlias = await buildDictLookupsByFieldAlias(columns, keyword.fieldList, rows);
    dictOptionsChanged = await syncReferenceDictFieldOptions({
      columns,
      fieldList: keyword.fieldList,
      snapshots: syncedFields,
      dictLookupsByAlias,
      updateField: (fieldId, fieldRo) => table.updateField(fieldId, fieldRo),
      syncedChoiceHashes: syncedDictChoiceHashes,
    });
    if (dictOptionsChanged) {
      await queryClient.invalidateQueries({
        queryKey: ReactQueryKeys.fieldList(tableId),
      });
      fieldsForRowMap = await resolveFieldsForRowMapAfterDictSync(
        columns,
        syncedFields,
        tableId,
        true
      );
    }
  } catch (dictErr) {
    console.warn('同步引用表字典字段失败', dictErr);
  }

  let syncedHiddenViewIds: string[] = [];
  try {
    await syncReferenceViewHiddenFieldsForTable(tableId, columns, syncedFields);
    const { data: viewList } = await getViewList(tableId);
    syncedHiddenViewIds = viewList.map((view) => view.id);
  } catch (syncErr) {
    console.warn('同步引用表视图隐藏列失败', syncErr);
  }

  return {
    syncedFields,
    dictLookupsByAlias,
    fieldsForRowMap,
    dictOptionsChanged,
    aborted: isStale(),
    syncedHiddenViewIds,
  };
};

/** 解析 loadData 同步阶段：结构未变 / 全量同步 */
const resolveReferenceLoadSync = async (params: {
  structureUnchanged: boolean;
  columns: IPreviewColumn[];
  keyword: IJbsKeywordDetail;
  rows: Record<string, unknown>[];
  syncedFields: IReferenceFieldSnapshot[];
  currentFields: Array<{
    id: string;
    name: string;
    type: FieldType;
    isPrimary?: boolean;
    notNull?: boolean;
  }>;
  table: Table;
  tableId: string;
  queryClient: QueryClient;
  syncedDictChoiceHashes: Map<string, string>;
  isStale: () => boolean;
}): Promise<
  (IReferenceLoadSyncResult & { aborted: boolean; syncedHiddenViewIds: string[] }) | null
> => {
  const {
    structureUnchanged,
    columns,
    keyword,
    rows,
    syncedFields,
    currentFields,
    table,
    tableId,
    queryClient,
    syncedDictChoiceHashes,
    isStale,
  } = params;

  if (structureUnchanged) {
    const dictResult = await refreshDictForUnchangedColumns({
      columns,
      keyword,
      rows,
      syncedFields,
      table,
      tableId,
      queryClient,
      syncedDictChoiceHashes,
    });
    return {
      syncedFields,
      ...dictResult,
      structureUnchanged: true,
      aborted: false,
      syncedHiddenViewIds: [],
    };
  }

  const structureResult = await syncReferenceColumnsStructure({
    columns,
    keyword,
    rows,
    currentFields,
    table,
    tableId,
    queryClient,
    syncedDictChoiceHashes,
    isStale,
  });
  if (structureResult.aborted) {
    return null;
  }

  await queryClient.invalidateQueries({
    queryKey: ReactQueryKeys.fieldList(tableId),
  });
  await queryClient.invalidateQueries({
    queryKey: ReactQueryKeys.viewList(tableId),
  });

  return {
    syncedFields: structureResult.syncedFields,
    dictLookupsByAlias: structureResult.dictLookupsByAlias,
    fieldsForRowMap: structureResult.fieldsForRowMap,
    dictOptionsChanged: structureResult.dictOptionsChanged,
    structureUnchanged: false,
    aborted: false,
    syncedHiddenViewIds: structureResult.syncedHiddenViewIds,
  };
};

/** 更新 fieldMetas 并将 preview 行映射为 Teable 记录 */
const buildReferenceRecordsFromPreview = (params: {
  rows: Record<string, unknown>[];
  columns: IPreviewColumn[];
  keyword: IJbsKeywordDetail;
  meta: IJbsReferenceTableMeta;
  syncedFields: IReferenceFieldSnapshot[];
  fieldsForRowMap: IReferenceFieldSnapshot[];
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>;
  fieldMetasRef: { current: IJbsReferenceFieldMeta[] };
  dataOnly: boolean;
  dictOptionsChanged: boolean;
  structureUnchanged: boolean;
  setFieldMetas: (metas: IJbsReferenceFieldMeta[]) => void;
  setDictOptionsVersion: React.Dispatch<React.SetStateAction<number>>;
}): {
  mapped: IJbsReferenceRecordsContextValue['records'];
  rawMap: Record<string, Record<string, unknown>>;
} => {
  const {
    rows,
    columns,
    keyword,
    meta,
    syncedFields,
    fieldsForRowMap,
    dictLookupsByAlias,
    fieldMetasRef,
    dataOnly,
    dictOptionsChanged,
    structureUnchanged,
    setFieldMetas,
    setDictOptionsVersion,
  } = params;

  if (!dataOnly) {
    let metas = buildReferenceFieldMetas(keyword.fieldList, syncedFields);
    metas = applyDrillMetaToFieldMetas({
      metas,
      drillFields: meta.drillFields,
      columns,
      keyword,
    });
    setFieldMetas(metas);
    fieldMetasRef.current = metas;
    if (dictOptionsChanged || !structureUnchanged) {
      setDictOptionsVersion((version) => version + 1);
    }
  }

  const metasForMap = fieldMetasRef.current;
  const isEditable = keyword.llTableEditable === 'Y';
  const fieldPermissions = isEditable
    ? metasForMap.map((m) => ({ fieldId: m.fieldId, canUpdate: m.isEditable }))
    : undefined;
  const columnKeys = columns.map((col) => col.fieldName);
  const mapped = mapPreviewRowsByColumnKeys(
    rows,
    fieldsForRowMap,
    columnKeys,
    fieldPermissions,
    dictLookupsByAlias
  );

  const rawMap: Record<string, Record<string, unknown>> = {};
  mapped.forEach((rec, rowIndex) => {
    const raw = rows[rowIndex] && typeof rows[rowIndex] === 'object' ? rows[rowIndex] : {};
    rawMap[rec.id] = { ...raw };
  });

  return { mapped, rawMap };
};

/** loadData 同步阶段：更新 refs 并返回行映射所需状态 */
const applyReferenceLoadSyncPhase = async (params: {
  dataOnly: boolean;
  columns: IPreviewColumn[];
  columnsFingerprint: string;
  keyword: IJbsKeywordDetail;
  rows: Record<string, unknown>[];
  table: Table;
  tableId: string;
  queryClient: QueryClient;
  currentFields: Array<{
    id: string;
    name: string;
    type: FieldType;
    isPrimary?: boolean;
    notNull?: boolean;
  }>;
  syncedFieldsRef: { current: IReferenceFieldSnapshot[] };
  dictLookupsByAliasRef: { current: Record<string, IJbsDictFieldLookup> };
  columnsFingerprintRef: { current: string };
  columnsRef: { current: IPreviewColumn[] };
  syncedHiddenViewIdsRef: { current: Set<string> };
  syncedDictChoiceHashesRef: { current: Map<string, string> };
  setHiddenFieldIds: (ids: ReadonlySet<string>) => void;
  isStale: () => boolean;
}): Promise<{
  syncedFields: IReferenceFieldSnapshot[];
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>;
  fieldsForRowMap: IReferenceFieldSnapshot[];
  dictOptionsChanged: boolean;
  structureUnchanged: boolean;
  aborted: boolean;
} | null> => {
  const {
    dataOnly,
    columns,
    columnsFingerprint,
    keyword,
    rows,
    table,
    tableId,
    queryClient,
    currentFields,
    syncedFieldsRef,
    dictLookupsByAliasRef,
    columnsFingerprintRef,
    columnsRef,
    syncedHiddenViewIdsRef,
    syncedDictChoiceHashesRef,
    setHiddenFieldIds,
    isStale,
  } = params;

  const structureUnchanged =
    !dataOnly &&
    columnsFingerprint === columnsFingerprintRef.current &&
    syncedFieldsRef.current.length > 0;

  if (dataOnly) {
    return {
      syncedFields: syncedFieldsRef.current,
      dictLookupsByAlias: dictLookupsByAliasRef.current,
      fieldsForRowMap: syncedFieldsRef.current,
      dictOptionsChanged: false,
      structureUnchanged: true,
      aborted: false,
    };
  }

  const syncResult = await resolveReferenceLoadSync({
    structureUnchanged,
    columns,
    keyword,
    rows,
    syncedFields: syncedFieldsRef.current,
    currentFields,
    table,
    tableId,
    queryClient,
    syncedDictChoiceHashes: syncedDictChoiceHashesRef.current,
    isStale,
  });

  if (!syncResult || syncResult.aborted) {
    return null;
  }

  dictLookupsByAliasRef.current = syncResult.dictLookupsByAlias;

  if (structureUnchanged) {
    return {
      syncedFields: syncResult.syncedFields,
      dictLookupsByAlias: syncResult.dictLookupsByAlias,
      fieldsForRowMap: syncResult.fieldsForRowMap,
      dictOptionsChanged: syncResult.dictOptionsChanged,
      structureUnchanged: true,
      aborted: false,
    };
  }

  syncedFieldsRef.current = syncResult.syncedFields;
  columnsFingerprintRef.current = columnsFingerprint;
  columnsRef.current = columns;
  setHiddenFieldIds(buildHiddenFieldIdsFromColumns(columns, syncResult.syncedFields));
  syncedHiddenViewIdsRef.current = new Set(syncResult.syncedHiddenViewIds);

  return {
    syncedFields: syncResult.syncedFields,
    dictLookupsByAlias: syncResult.dictLookupsByAlias,
    fieldsForRowMap: syncResult.fieldsForRowMap,
    dictOptionsChanged: syncResult.dictOptionsChanged,
    structureUnchanged: false,
    aborted: false,
  };
};

/**
 * 引用表：打开时先 word/wordOnlineKeyWord 再 previewSqlResultToFieldAlias，并动态同步表头
 * 可编辑时保存走主端 executeEditScripts
 */
export const JbsReferenceRecordsProvider = ({ children }: IJbsReferenceRecordsProviderProps) => {
  const tableId = useTableId() as string;
  const table = useTable();
  const views = useViews();
  const fields = useFields({ withHidden: true, withJbsLockedHidden: true });
  const queryClient = useQueryClient();
  const description = table?.description ?? '';

  const meta = useMemo(() => parseJbsTableMeta(description), [description]);

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const fieldsReady = useMemo(() => {
    if (!tableId) {
      return false;
    }
    if (fields.length === 0) {
      return true;
    }
    return fields.every((f) => f.tableId === tableId);
  }, [fields, tableId]);

  const [records, setRecords] = useState<IJbsReferenceRecordsContextValue['records']>([]);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const [loading, setLoading] = useState(false);
  const [keywordDetail, setKeywordDetail] = useState<IJbsKeywordDetail | null>(null);
  const [fieldMetas, setFieldMetas] = useState<IJbsReferenceFieldMeta[]>([]);
  const [hiddenFieldIds, setHiddenFieldIds] = useState<ReadonlySet<string>>(() => new Set());
  /** 主端字典拉取完成后递增，驱动编辑器刷新可选项 */
  const [dictOptionsVersion, setDictOptionsVersion] = useState(0);
  const requestSeqRef = useRef(0);

  /** preview 列配置（同步视图隐藏列用） */
  const columnsRef = useRef<IPreviewColumn[]>([]);
  /** 已完成隐藏列同步的视图 id */
  const syncedHiddenViewIdsRef = useRef(new Set<string>());

  /** preview 原始行（fieldAlias key），按 recordId 索引 */
  const rawRowsByRecordIdRef = useRef<Record<string, Record<string, unknown>>>({});
  const fieldMetasRef = useRef(fieldMetas);
  fieldMetasRef.current = fieldMetas;
  const keywordDetailRef = useRef(keywordDetail);
  keywordDetailRef.current = keywordDetail;
  const syncedFieldsRef = useRef<Array<{ id: string; name: string; type?: FieldType }>>([]);
  /** 字典列 lookup（fieldAlias -> 选项与 value/label 映射） */
  const dictLookupsByAliasRef = useRef<Record<string, IJbsDictFieldLookup>>({});
  /** 列结构指纹：未变化时跳过 syncReferenceTableFields 等 */
  const columnsFingerprintRef = useRef('');
  /** 已写入 Teable 的字典 choices 指纹（fieldId -> hash） */
  const syncedDictChoiceHashesRef = useRef(new Map<string, string>());

  useEffect(() => {
    requestSeqRef.current += 1;
    setRecords([]);
    setLoading(false);
    setKeywordDetail(null);
    setFieldMetas([]);
    setHiddenFieldIds(new Set());
    columnsRef.current = [];
    columnsFingerprintRef.current = '';
    syncedHiddenViewIdsRef.current = new Set();
    syncedDictChoiceHashesRef.current = new Map();
    dictLookupsByAliasRef.current = {};
    setDictOptionsVersion(0);
    clearJbsDictCache();
    rawRowsByRecordIdRef.current = {};
  }, [tableId]);

  /** 保存成功后局部更新行，避免全量 loadData */
  const patchLocalRecord = useCallback(
    (
      recordId: string,
      previewRow: Record<string, unknown>,
      recordFields: Record<string, unknown>
    ) => {
      rawRowsByRecordIdRef.current = {
        ...rawRowsByRecordIdRef.current,
        [recordId]: { ...previewRow },
      };
      setRecords((prev) => patchLocalReferenceRecord(prev, recordId, recordFields));
    },
    []
  );

  const loadData = useCallback(
    async (options?: ILoadReferenceDataOptions) => {
      if (!meta || !fieldsReady || !table) {
        return;
      }
      const seq = ++requestSeqRef.current;
      setLoading(true);
      try {
        await requestJbsAuth();
        const { rows, columns, keyword } = await fetchReferenceTablePreview(meta, '');

        if (seq !== requestSeqRef.current) {
          return;
        }

        setKeywordDetail(keyword);

        const dataOnly = Boolean(options?.dataOnly);
        const columnsFingerprint = buildColumnsFingerprint(columns);
        const currentFields = fieldsRef.current
          .filter((f) => f.tableId === tableId)
          .map((f) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            isPrimary: f.isPrimary,
            notNull: f.notNull,
          }));

        const syncPhase = await applyReferenceLoadSyncPhase({
          dataOnly,
          columns,
          columnsFingerprint,
          keyword,
          rows,
          table,
          tableId,
          queryClient,
          currentFields,
          syncedFieldsRef,
          dictLookupsByAliasRef,
          columnsFingerprintRef,
          columnsRef,
          syncedHiddenViewIdsRef,
          syncedDictChoiceHashesRef,
          setHiddenFieldIds,
          isStale: () => seq !== requestSeqRef.current,
        });

        if (!syncPhase || syncPhase.aborted || seq !== requestSeqRef.current) {
          return;
        }

        columnsRef.current = columns;

        const { mapped, rawMap } = buildReferenceRecordsFromPreview({
          rows,
          columns,
          keyword,
          meta,
          syncedFields: syncPhase.syncedFields,
          fieldsForRowMap: syncPhase.fieldsForRowMap,
          dictLookupsByAlias: syncPhase.dictLookupsByAlias,
          fieldMetasRef,
          dataOnly,
          dictOptionsChanged: syncPhase.dictOptionsChanged,
          structureUnchanged: syncPhase.structureUnchanged,
          setFieldMetas,
          setDictOptionsVersion,
        });

        rawRowsByRecordIdRef.current = rawMap;
        setRecords(mapped);
      } catch (e) {
        if (seq !== requestSeqRef.current) {
          return;
        }
        const msg = e instanceof Error ? e.message : '加载引用表数据失败';
        toast.error(msg);
        setRecords([]);
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [meta, fieldsReady, table, tableId, queryClient]
  );

  const fetchKey = meta
    ? `${tableId}|${meta.keywordId}|${meta.keywordDetailApi}|${meta.previewSqlApi}`
    : '';

  useEffect(() => {
    if (!meta || !fieldsReady || !table) {
      return;
    }
    void loadData();
  }, [fetchKey, fieldsReady, loadData, meta, table]);

  useEffect(() => {
    if (!meta || !columnsRef.current.length || !syncedFieldsRef.current.length || !views?.length) {
      return;
    }

    const pendingViews = views.filter((view) => !syncedHiddenViewIdsRef.current.has(view.id));
    if (!pendingViews.length) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        for (const view of pendingViews) {
          if (cancelled) {
            return;
          }
          await syncReferenceViewHiddenFields(
            tableId,
            view.id,
            view.type,
            columnsRef.current,
            syncedFieldsRef.current
          );
          syncedHiddenViewIdsRef.current.add(view.id);
        }
        await queryClient.invalidateQueries({
          queryKey: ReactQueryKeys.viewList(tableId),
        });
      } catch (syncErr) {
        console.warn('同步引用表新视图隐藏列失败', syncErr);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meta, views, tableId, queryClient]);

  const buildFieldTypeById = useCallback(() => {
    const map: Record<string, FieldType | undefined> = {};
    for (const f of syncedFieldsRef.current) {
      map[f.id] = f.type;
    }
    return map;
  }, []);

  /** 下钻展示列 fieldAlias：不参与 executeEditScripts 直写 */
  const buildDrillDisplayAliasSet = useCallback((): Set<string> => {
    return new Set((meta?.drillFields ?? []).map((item) => item.sourceFieldAlias));
  }, [meta?.drillFields]);

  const saveCellUpdate = useCallback(
    async (params: {
      recordId: string;
      fieldId: string;
      cellValue: unknown;
      recordFields: Record<string, unknown>;
    }) => {
      const detail = assertEditableReferenceContext(meta, keywordDetailRef.current);
      const metas = fieldMetasRef.current;
      const excludeAliases = buildDrillDisplayAliasSet();

      const fieldMeta = metas.find((m) => m.fieldId === params.fieldId);
      if (!fieldMeta?.isEditable) {
        throw new Error(JBS_REFERENCE_FIELD_NOT_EDITABLE_MESSAGE);
      }
      if (excludeAliases.has(fieldMeta.fieldAlias)) {
        throw new Error(JBS_REFERENCE_DRILL_FIELD_EDIT_HINT);
      }

      const rawRow = rawRowsByRecordIdRef.current[params.recordId];
      if (!rawRow) {
        throw new Error('未找到原始行数据');
      }

      const fieldTypeById = buildFieldTypeById();
      const previewRow = mergeRecordFieldsToPreviewRow(
        rawRow,
        params.recordFields,
        metas,
        fieldTypeById,
        dictLookupsByAliasRef.current
      );

      await persistReferenceRow({
        keywordDetail: detail,
        previewRow,
        fieldMetas: metas,
        excludeFieldAliases: excludeAliases,
        operation: 'edit',
        onSuccess: async () => {
          toast.success('保存成功');
          patchLocalRecord(params.recordId, previewRow, params.recordFields);
        },
      });
    },
    [meta, buildFieldTypeById, buildDrillDisplayAliasSet, patchLocalRecord]
  );

  /** 下钻字段选择：写回主端参数字段（非下钻展示列本身） */
  const saveDrillFieldSelection = useCallback(
    async (params: IJbsDrillFieldSaveParams) => {
      const detail = assertEditableReferenceContext(meta, keywordDetailRef.current);
      const metas = fieldMetasRef.current;
      const excludeAliases = buildDrillDisplayAliasSet();

      const fieldMeta = metas.find((m) => m.fieldId === params.drillFieldId);
      const drillMeta = meta!.drillFields?.find(
        (item) => item.sourceFieldAlias === fieldMeta?.fieldAlias
      );
      if (!fieldMeta || !drillMeta) {
        throw new Error('未找到下钻字段配置');
      }
      if (!fieldMeta.isEditable) {
        throw new Error(JBS_REFERENCE_FIELD_NOT_EDITABLE_MESSAGE);
      }

      const sourceFieldId = resolveDrillSourceFieldId(drillMeta, detail.fieldList);
      if (!sourceFieldId) {
        throw new Error('未找到下钻源字段 id');
      }

      const relationParams = await fetchJbsRelatedInfo(sourceFieldId, drillMeta.relatedKeyId);
      const drillKeyword = await fetchLltableKeywordDetail(
        buildKeywordDetailRequestPath(buildJbsReferenceTableMetaForCreate(drillMeta.relatedKeyId))
      );
      const paramUpdates = buildMainRowUpdatesFromDrillSelection({
        selectedDrillRow: params.selectedDrillRow,
        relationParams,
        mainFieldList: detail.fieldList,
        drillFieldList: drillKeyword.fieldList,
      });
      if (!Object.keys(paramUpdates).length) {
        throw new Error('未能从下钻行解析参数字段');
      }

      const fieldTypeById = buildFieldTypeById();
      const fieldUpdates = buildDrillFieldCellUpdates({
        paramUpdates,
        fieldMetas: metas,
        fieldTypeById,
        drillFieldId: params.drillFieldId,
        selectedDrillRow: params.selectedDrillRow,
        sourceFieldAlias: drillMeta.sourceFieldAlias,
      });
      if (!Object.keys(fieldUpdates).length) {
        throw new Error('未能生成可写入的字段更新');
      }

      // 新建行（prefilling）：record.id 为空，仅本地更新，等确认新建时再 add
      const isDraftRow = !params.recordId?.trim();
      if (isDraftRow) {
        return { mode: 'local', fieldUpdates } satisfies IJbsDrillFieldSaveResult;
      }

      const rawRow = rawRowsByRecordIdRef.current[params.recordId];
      const isNewRow = !rawRow;
      const previewRow = mergeDrillPreviewRow(
        {
          recordId: params.recordId,
          recordFields: params.recordFields,
          paramUpdates,
        },
        metas,
        fieldTypeById,
        dictLookupsByAliasRef.current,
        rawRowsByRecordIdRef.current
      );

      await persistReferenceRow({
        keywordDetail: detail,
        previewRow,
        fieldMetas: metas,
        excludeFieldAliases: excludeAliases,
        operation: isNewRow ? 'add' : 'edit',
        requireNonEmptyData: true,
        onSuccess: async () => {
          toast.success('保存成功');
          const newRecordFields = { ...params.recordFields, ...fieldUpdates };
          patchLocalRecord(params.recordId, previewRow, newRecordFields);
        },
      });
      return { mode: 'persisted' } satisfies IJbsDrillFieldSaveResult;
    },
    [meta, buildFieldTypeById, buildDrillDisplayAliasSet, patchLocalRecord]
  );

  /** 多字段更新（图册/看板/日历拖拽等） */
  const updateRecordFields = useCallback(
    async (params: { recordId: string; fields: Record<string, unknown> }) => {
      const detail = assertEditableReferenceContext(meta, keywordDetailRef.current);
      const metas = fieldMetasRef.current;
      const excludeAliases = buildDrillDisplayAliasSet();

      const rawRow = rawRowsByRecordIdRef.current[params.recordId];
      if (!rawRow) {
        throw new Error('未找到原始行数据');
      }

      const currentRecord = recordsRef.current.find((item) => item.id === params.recordId);
      const recordFields: Record<string, unknown> = {};
      for (const fieldMeta of metas) {
        if (Object.prototype.hasOwnProperty.call(params.fields, fieldMeta.fieldId)) {
          recordFields[fieldMeta.fieldId] = params.fields[fieldMeta.fieldId];
        } else {
          recordFields[fieldMeta.fieldId] = currentRecord?.fields?.[fieldMeta.fieldId];
        }
      }

      const fieldTypeById = buildFieldTypeById();
      const previewRow = mergeRecordFieldsToPreviewRow(
        rawRow,
        recordFields,
        metas,
        fieldTypeById,
        dictLookupsByAliasRef.current
      );

      await persistReferenceRow({
        keywordDetail: detail,
        previewRow,
        fieldMetas: metas,
        excludeFieldAliases: excludeAliases,
        operation: 'edit',
        onSuccess: async () => {
          patchLocalRecord(params.recordId, previewRow, recordFields);
        },
      });
    },
    [meta, buildFieldTypeById, buildDrillDisplayAliasSet, patchLocalRecord]
  );

  const createRecord = useCallback(
    async (params: { fields: Record<string, unknown> }) => {
      const detail = assertEditableReferenceContext(meta, keywordDetailRef.current);
      const metas = fieldMetasRef.current;
      const excludeAliases = buildDrillDisplayAliasSet();

      for (const fieldMeta of metas) {
        if (fieldMeta.isEditable) {
          continue;
        }
        const value = params.fields[fieldMeta.fieldId];
        if (value != null && value !== '') {
          throw new Error(JBS_REFERENCE_FIELD_NOT_EDITABLE_MESSAGE);
        }
      }

      const fieldTypeById = buildFieldTypeById();
      const previewRow = buildPreviewRowFromFieldMap(
        params.fields,
        metas,
        fieldTypeById,
        dictLookupsByAliasRef.current
      );

      await persistReferenceRow({
        keywordDetail: detail,
        previewRow,
        fieldMetas: metas,
        excludeFieldAliases: excludeAliases,
        operation: 'add',
        onSuccess: async () => {
          toast.success('新增成功');
          await loadData({ dataOnly: true });
        },
      });
    },
    [meta, buildFieldTypeById, buildDrillDisplayAliasSet, loadData]
  );

  // 注册桥接：供 Record.updateCell 调用
  useEffect(() => {
    const isEditable = keywordDetail?.llTableEditable === 'Y';
    if (!meta || !isEditable) {
      setJbsReferenceBridgeHandlers(null);
      return () => setJbsReferenceBridgeHandlers(null);
    }
    setJbsReferenceBridgeHandlers({
      saveCellUpdate,
      createRecord,
    });
    return () => setJbsReferenceBridgeHandlers(null);
  }, [meta, keywordDetail?.llTableEditable, saveCellUpdate, createRecord]);

  const readonly = keywordDetail?.llTableEditable !== 'Y';

  const getRecordRawRow = useCallback(
    (recordId: string) => rawRowsByRecordIdRef.current[recordId],
    []
  );

  const isDictField = useCallback((fieldId: string) => {
    const meta = fieldMetasRef.current.find((item) => item.fieldId === fieldId);
    return isJbsReferenceDictFieldMeta(meta);
  }, []);

  const getDictSelectOptions = useCallback(
    (fieldId: string) => {
      const meta = fieldMetasRef.current.find((item) => item.fieldId === fieldId);
      if (!isJbsReferenceDictFieldMeta(meta) || !meta) {
        return undefined;
      }
      const lookup = dictLookupsByAliasRef.current[meta.fieldAlias];
      if (!lookup) {
        return undefined;
      }
      // 编辑下拉仅展示主端字典项；无 dictType 时降级为行内已有值
      const choices = lookup.apiChoices.length ? lookup.apiChoices : lookup.choices;
      return mapDictChoicesToSelectOptions(choices);
    },
    [dictOptionsVersion]
  );

  const getDictDisplayChoices = useCallback(
    (fieldId: string) => {
      const meta = fieldMetasRef.current.find((item) => item.fieldId === fieldId);
      if (!isJbsReferenceDictFieldMeta(meta) || !meta) {
        return undefined;
      }
      return dictLookupsByAliasRef.current[meta.fieldAlias]?.choices;
    },
    [dictOptionsVersion]
  );

  const value = useMemo<IJbsReferenceRecordsContextValue>(() => {
    if (!meta) {
      return JbsReferenceRecordsContextDefaultValue;
    }
    const isEditable = keywordDetail?.llTableEditable === 'Y';
    return {
      isReferenceTable: true,
      readonly,
      records,
      loading,
      refresh: loadData,
      keywordId: keywordDetail?.id,
      dataPrimaryKey: keywordDetail?.dataPrimaryKey,
      fieldMetas,
      mainKeywordFieldList: keywordDetail?.fieldList,
      getRecordRawRow,
      saveCellUpdate: isEditable ? saveCellUpdate : undefined,
      createRecord: isEditable ? createRecord : undefined,
      updateRecordFields: isEditable ? updateRecordFields : undefined,
      hiddenFieldIds,
      dictOptionsVersion,
      isDictField,
      getDictSelectOptions,
      getDictDisplayChoices,
    };
  }, [
    meta,
    readonly,
    records,
    loading,
    loadData,
    keywordDetail,
    fieldMetas,
    getRecordRawRow,
    saveCellUpdate,
    createRecord,
    updateRecordFields,
    hiddenFieldIds,
    dictOptionsVersion,
    isDictField,
    getDictSelectOptions,
    getDictDisplayChoices,
  ]);

  if (!meta) {
    return <>{children}</>;
  }

  return (
    <JbsReferenceRecordsContext.Provider value={value}>
      <JbsReferencePermissionOverride>
        <JbsDrillFieldProvider
          saveDrillFieldSelection={
            keywordDetail?.llTableEditable === 'Y' ? saveDrillFieldSelection : undefined
          }
        >
          {children}
        </JbsDrillFieldProvider>
      </JbsReferencePermissionOverride>
    </JbsReferenceRecordsContext.Provider>
  );
};
