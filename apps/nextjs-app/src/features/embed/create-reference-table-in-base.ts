import { ViewType } from '@teable/core';
import {
  BaseNodeResourceType,
  createBaseNode,
  getBaseNodeTree,
  getFields,
  updateField,
  updateTableName,
  type IBaseNodeVo,
} from '@teable/openapi';
import type { NextRouter } from 'next/router';
import type { TFunction } from 'next-i18next';
import { getNodeUrl } from '@/features/app/blocks/base/base-node/hooks';
import {
  buildReferenceTableRoFromPreview,
  type IPreviewColumn,
} from './build-create-table-from-preview';
import { buildDictLookupsByFieldAlias, syncReferenceDictFieldOptions } from './jbs-dict-field';
import { fetchLltableKeywordDetail, type IJbsKeywordDetail } from './jbs-main-api-client';
import {
  buildJbsReferenceTableMetaForCreate,
  buildKeywordDetailRequestPath,
  type IJbsDrillFieldMeta,
} from './jbs-table-meta';
import { resolvePreviewColumnsForKeyword } from './reference-table-preview';
import { syncReferenceViewHiddenFieldsForTable } from './sync-reference-view-hidden-fields';

export type ICreateReferenceTableParams = {
  base: {
    createTable: (ro: unknown) => Promise<{
      data: { id: string; defaultViewId?: string; fields: Array<{ id: string }> };
    }>;
  };
  tables: { name: string }[];
  router: NextRouter;
  baseId: string;
  tableName: string;
  columns: IPreviewColumn[];
  keyword: IJbsKeywordDetail;
  t: TFunction;
};

const hasDrillColumns = (columns: IPreviewColumn[]): boolean =>
  columns.some((col) => Boolean(col.relatedKeyId?.trim()));

/** 已创建的下钻引用表（key = relatedKeyId / 指标 id） */
type IDrillTargetInfo = {
  keyword: IJbsKeywordDetail;
  tableId: string;
  viewId: string;
  tableName: string;
};

/** 默认表格视图 i18n key（创建引用表时复用） */
const TABLE_VIEW_I18N_KEY = 'view.category.table';

const normalizeName = (name: string): string => name.trim().toLowerCase();

/** 从 Base 节点树收集文件夹名与根级表名（不同文件夹内允许同名表） */
const collectNodeNameSets = (nodes: IBaseNodeVo[]) => {
  const folderNames = new Set<string>();
  const rootTableNames = new Set<string>();

  for (const node of nodes) {
    const nodeName = node.resourceMeta?.name?.trim();
    if (!nodeName) {
      continue;
    }
    const normalized = normalizeName(nodeName);
    if (node.resourceType === BaseNodeResourceType.Folder) {
      folderNames.add(normalized);
    }
    if (node.resourceType === BaseNodeResourceType.Table && !node.parentId) {
      rootTableNames.add(normalized);
    }
  }

  return { folderNames, rootTableNames };
};

/**
 * 创建前校验名称：
 * - 无下钻字段：根级不可与已有根级表重名
 * - 有下钻字段：不可与已有文件夹重名（文件夹内表可与根级表同名）
 */
const assertReferenceTableNameAvailable = async (params: {
  baseId: string;
  tableName: string;
  hasDrill: boolean;
}): Promise<string> => {
  const trimmed = params.tableName.trim();
  if (!trimmed) {
    throw new Error('表名不能为空');
  }

  const tree = await getBaseNodeTree(params.baseId);
  const { folderNames, rootTableNames } = collectNodeNameSets(tree.data.nodes);
  const normalized = normalizeName(trimmed);

  if (params.hasDrill) {
    if (folderNames.has(normalized)) {
      throw new Error(`名称「${trimmed}」与已有文件夹重复，请更换表名`);
    }
    return trimmed;
  }

  if (rootTableNames.has(normalized)) {
    throw new Error(`名称「${trimmed}」与已有表格重复，请更换表名`);
  }
  return trimmed;
};

/** 根据列上的 relatedKeyId 组装 drillFields（指向已创建的下钻引用表） */
const buildDrillFieldsForColumns = (
  columns: IPreviewColumn[],
  drillTargets: Map<string, IDrillTargetInfo>
): IJbsDrillFieldMeta[] => {
  const drillFields: IJbsDrillFieldMeta[] = [];

  for (const col of columns) {
    const relatedKeyId = col.relatedKeyId?.trim();
    const target = relatedKeyId ? drillTargets.get(relatedKeyId) : undefined;
    if (!relatedKeyId || !target) {
      continue;
    }
    drillFields.push({
      mode: 'jbsParamDrill',
      sourceFieldAlias: col.fieldName,
      sourceFieldId: col.jbsFieldId,
      relatedKeyId,
      targetTableId: target.tableId,
      targetViewId: target.viewId,
    });
  }

  return drillFields;
};

/** 在当前 Base 下创建单张引用表 */
const createSingleReferenceTable = async (params: {
  baseId: string;
  parentId?: string;
  tableName: string;
  columns: IPreviewColumn[];
  keywordId: string;
  drillFields?: IJbsDrillFieldMeta[];
  t: TFunction;
}) => {
  const tableViewName = params.t(TABLE_VIEW_I18N_KEY);
  const tableRo = buildReferenceTableRoFromPreview({
    tableName: params.tableName,
    columns: params.columns,
    viewName: tableViewName,
    meta: buildJbsReferenceTableMetaForCreate(params.keywordId, params.drillFields),
  });

  const node = await createBaseNode(params.baseId, {
    resourceType: BaseNodeResourceType.Table,
    parentId: params.parentId ?? null,
    name: params.tableName,
    description: tableRo.description,
    fields: tableRo.fields,
    views: tableRo.views ?? [{ name: tableViewName, type: ViewType.Grid }],
    records: [],
  });

  const tableId = node.data.resourceId;
  const viewId = node.data.resourceMeta?.defaultViewId;
  if (!viewId) {
    throw new Error('默认视图为空，无法创建引用表');
  }

  // 后端建表会全局去重加后缀；文件夹内/外允许与已有表同名时，创建后改回目标名
  const createdName = node.data.resourceMeta?.name?.trim();
  if (createdName && createdName !== params.tableName) {
    await updateTableName(params.baseId, tableId, { name: params.tableName });
  }

  const fieldsRes = await getFields(tableId);
  const syncedFields = fieldsRes.data.map((f) => ({
    id: f.id,
    name: f.name,
    isPrimary: f.isPrimary,
  }));
  await syncReferenceViewHiddenFieldsForTable(tableId, params.columns, syncedFields);

  // 字典列：建表后同步 SingleSelect 选项（列元数据已含 jbsType / dictType）
  try {
    const dictLookupsByAlias = await buildDictLookupsByFieldAlias(params.columns, undefined, []);
    await syncReferenceDictFieldOptions({
      columns: params.columns,
      snapshots: syncedFields,
      dictLookupsByAlias,
      updateField: (fieldId, fieldRo) => updateField(tableId, fieldId, fieldRo),
    });
  } catch (dictErr) {
    console.warn('建表后同步字典字段选项失败', dictErr);
  }

  return { tableId, viewId, tableName: params.tableName, nodeId: node.data.id };
};

/**
 * 递归创建下钻引用表：若下钻指标自身仍有下钻字段，先创建更深层表。
 * 同一 relatedKeyId 只创建一次（drillTargets 去重）。
 */
const ensureDrillTargetsCreated = async (params: {
  baseId: string;
  parentId: string;
  columns: IPreviewColumn[];
  drillTargets: Map<string, IDrillTargetInfo>;
  t: TFunction;
}): Promise<void> => {
  const { baseId, parentId, columns, drillTargets, t } = params;

  for (const col of columns) {
    const relatedKeyId = col.relatedKeyId?.trim();
    if (!relatedKeyId || drillTargets.has(relatedKeyId)) {
      continue;
    }

    const targetKeyword = await fetchLltableKeywordDetail(
      buildKeywordDetailRequestPath(buildJbsReferenceTableMetaForCreate(relatedKeyId))
    );
    const drillColumns = await resolvePreviewColumnsForKeyword(targetKeyword);

    // 深度优先：先建更深层下钻表
    await ensureDrillTargetsCreated({
      baseId,
      parentId,
      columns: drillColumns,
      drillTargets,
      t,
    });

    const nestedDrillFields = buildDrillFieldsForColumns(drillColumns, drillTargets);
    const drillTableName =
      targetKeyword.keyWord?.trim() || targetKeyword.code?.trim() || `下钻_${relatedKeyId}`;

    const created = await createSingleReferenceTable({
      baseId,
      parentId,
      tableName: drillTableName,
      columns: drillColumns,
      keywordId: relatedKeyId,
      drillFields: nestedDrillFields.length ? nestedDrillFields : undefined,
      t,
    });

    drillTargets.set(relatedKeyId, {
      keyword: targetKeyword,
      tableId: created.tableId,
      viewId: created.viewId,
      tableName: created.tableName,
    });
  }
};

/** 有下钻指标时：文件夹 + 下钻引用表（可递归） + 主引用表 */
const createDrillReferenceTablesInBase = async (
  params: ICreateReferenceTableParams
): Promise<{ tableId: string; viewId: string; tableName: string }> => {
  const { baseId, columns, keyword, tableName, t, router } = params;

  const folderName = await assertReferenceTableNameAvailable({
    baseId,
    tableName,
    hasDrill: true,
  });

  const folderNode = await createBaseNode(baseId, {
    resourceType: BaseNodeResourceType.Folder,
    name: folderName,
  });
  const parentId = folderNode.data.id;

  const drillTargets = new Map<string, IDrillTargetInfo>();
  await ensureDrillTargetsCreated({
    baseId,
    parentId,
    columns,
    drillTargets,
    t,
  });

  const drillFields = buildDrillFieldsForColumns(columns, drillTargets);

  const mainCreated = await createSingleReferenceTable({
    baseId,
    parentId,
    tableName: folderName,
    columns,
    keywordId: keyword.id,
    drillFields,
    t,
  });

  const url = getNodeUrl({
    baseId,
    resourceType: BaseNodeResourceType.Table,
    resourceId: mainCreated.tableId,
    viewId: mainCreated.viewId,
  });
  if (url) {
    router.push(url, undefined, { shallow: true });
  }

  return {
    tableId: mainCreated.tableId,
    viewId: mainCreated.viewId,
    tableName: mainCreated.tableName,
  };
};

/** 在当前 Base 下创建引用表并跳转 */
export const createReferenceTableInBase = async (
  params: ICreateReferenceTableParams
): Promise<{
  tableId: string;
  viewId: string;
  tableName: string;
}> => {
  const { router, baseId, tableName, columns, keyword, t } = params;
  if (!columns.length) {
    throw new Error('列信息为空，无法创建表格');
  }

  if (hasDrillColumns(columns)) {
    return createDrillReferenceTablesInBase(params);
  }

  const resolvedTableName = await assertReferenceTableNameAvailable({
    baseId,
    tableName,
    hasDrill: false,
  });

  const created = await createSingleReferenceTable({
    baseId,
    tableName: resolvedTableName,
    columns,
    keywordId: keyword.id,
    t,
  });

  const url = getNodeUrl({
    baseId,
    resourceType: BaseNodeResourceType.Table,
    resourceId: created.tableId,
    viewId: created.viewId,
  });
  if (url) {
    router.push(url, undefined, { shallow: true });
  }

  return {
    tableId: created.tableId,
    viewId: created.viewId,
    tableName: created.tableName,
  };
};
