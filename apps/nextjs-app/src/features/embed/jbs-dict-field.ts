import type { ISelectFieldChoice, IUpdateFieldRo } from '@teable/core';
import { Colors } from '@teable/core';
import type { IPreviewColumn } from './build-create-table-from-preview';
import {
  fetchJbsDictDataByType,
  type IJbsDictDataItem,
  type IJbsKeywordFieldItem,
} from './jbs-main-api-client';
import { isJbsDictFieldType } from './map-jbs-field-type';
import { getRowValue } from './map-preview-row-utils';
import { buildJbsFieldConfigByAliasMap } from './resolve-jbs-field-alias';

/** 字典缓存 TTL（字典会动态变化，不宜过长） */
const DICT_CACHE_TTL_MS = 3 * 60 * 1000;

const DICT_COLOR_CYCLE = [
  Colors.Blue,
  Colors.Cyan,
  Colors.Green,
  Colors.Orange,
  Colors.Purple,
  Colors.Teal,
  Colors.Yellow,
  Colors.Pink,
];

type IDictCacheEntry = {
  items: IJbsDictDataItem[];
  fetchedAt: number;
};

const dictCache = new Map<string, IDictCacheEntry>();

/** 字典列查找表：value/label 互转 + Teable 选项 */
export type IJbsDictFieldLookup = {
  dictType: string;
  valueToLabel: Map<string, string>;
  labelToValue: Map<string, string>;
  /** 主端字典 API 返回的可选项（编辑下拉仅展示此项） */
  apiChoices: ISelectFieldChoice[];
  /** apiChoices + 行内未命中值（展示/校验用） */
  choices: ISelectFieldChoice[];
};

const normalizeDictKey = (value: unknown): string => {
  if (value == null) {
    return '';
  }
  return String(value).trim();
};

/** 拉取字典（带短缓存） */
export const loadJbsDictItems = async (dictType: string): Promise<IJbsDictDataItem[]> => {
  const key = dictType.trim();
  if (!key) {
    return [];
  }
  const cached = dictCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < DICT_CACHE_TTL_MS) {
    return cached.items;
  }
  const items = await fetchJbsDictDataByType(key);
  dictCache.set(key, { items, fetchedAt: Date.now() });
  return items;
};

/** 清空字典缓存（表切换或强制刷新时） */
export const clearJbsDictCache = (): void => {
  dictCache.clear();
};

const buildOrphanChoiceId = (label: string): string => `__orphan__${label}`;

/** 从主端字典项构建 Teable SingleSelect choices */
export const buildDictChoicesFromItems = (items: IJbsDictDataItem[]): ISelectFieldChoice[] => {
  const choices: ISelectFieldChoice[] = [];
  const usedNames = new Set<string>();

  items.forEach((item, index) => {
    const name = normalizeDictKey(item.dictLabel);
    const id = normalizeDictKey(item.dictValue) || name;
    if (!name || !id || usedNames.has(name)) {
      return;
    }
    usedNames.add(name);
    choices.push({
      id,
      name,
      color: DICT_COLOR_CYCLE[index % DICT_COLOR_CYCLE.length],
    });
  });

  return choices;
};

/** 构建 value/label 互转表 */
export const buildDictLookupFromItems = (
  dictType: string,
  items: IJbsDictDataItem[]
): IJbsDictFieldLookup => {
  const valueToLabel = new Map<string, string>();
  const labelToValue = new Map<string, string>();

  for (const item of items) {
    const value = normalizeDictKey(item.dictValue);
    const label = normalizeDictKey(item.dictLabel);
    if (!value || !label) {
      continue;
    }
    valueToLabel.set(value, label);
    labelToValue.set(label, value);
  }

  const apiChoices = buildDictChoicesFromItems(items);
  return {
    dictType,
    valueToLabel,
    labelToValue,
    apiChoices,
    choices: apiChoices,
  };
};

/** 将预览原始值解析为展示用 dictLabel；未命中字典则原样返回 */
export const resolveDictDisplayLabel = (
  raw: unknown,
  lookup: IJbsDictFieldLookup | undefined
): string | null => {
  const text = normalizeDictKey(raw);
  if (!text) {
    return null;
  }
  if (!lookup) {
    return text;
  }
  if (lookup.labelToValue.has(text)) {
    return text;
  }
  const fromValue = lookup.valueToLabel.get(text);
  if (fromValue) {
    return fromValue;
  }
  return text;
};

/** 编辑保存：单元格 label -> 主端 dictValue；无映射则原样提交 */
export const resolveDictSaveValue = (
  cellLabel: unknown,
  lookup: IJbsDictFieldLookup | undefined
): unknown => {
  const text = normalizeDictKey(cellLabel);
  if (!text) {
    return '';
  }
  if (!lookup) {
    return text;
  }
  const value = lookup.labelToValue.get(text);
  return value ?? text;
};

/** 合并字典选项与行内未命中字典的展示值（保证 SingleSelect 可显示） */
export const mergeDictChoicesWithOrphanLabels = (
  baseChoices: ISelectFieldChoice[],
  orphanLabels: Iterable<string>
): ISelectFieldChoice[] => {
  const choices = [...baseChoices];
  const existingNames = new Set(choices.map((c) => c.name));
  let colorIndex = choices.length;

  for (const label of orphanLabels) {
    const name = normalizeDictKey(label);
    if (!name || existingNames.has(name)) {
      continue;
    }
    existingNames.add(name);
    choices.push({
      id: buildOrphanChoiceId(name),
      name,
      color: DICT_COLOR_CYCLE[colorIndex % DICT_COLOR_CYCLE.length],
    });
    colorIndex += 1;
  }

  return choices;
};

const resolveColumnDictTypeWithMap = (
  col: IPreviewColumn,
  configByAlias: Map<string, IJbsKeywordFieldItem>
): string | undefined => {
  if (col.dictType?.trim()) {
    return col.dictType.trim();
  }
  const alias = col.fieldName?.trim() || col.title?.trim();
  if (!alias) {
    return undefined;
  }
  const config = configByAlias.get(alias);
  if (!config || !isJbsDictFieldType(config.type)) {
    return undefined;
  }
  return config.format?.trim() || undefined;
};

const isDictPreviewColumnWithMap = (
  col: IPreviewColumn,
  configByAlias: Map<string, IJbsKeywordFieldItem>
): boolean => {
  if (isJbsDictFieldType(col.jbsType)) {
    return true;
  }
  const alias = col.fieldName?.trim() || col.title?.trim();
  if (!alias) {
    return false;
  }
  return isJbsDictFieldType(configByAlias.get(alias)?.type);
};

/** 从列配置 + fieldList 解析 dictType */
export const resolveColumnDictType = (
  col: IPreviewColumn,
  fieldList?: IJbsKeywordFieldItem[]
): string | undefined =>
  resolveColumnDictTypeWithMap(col, buildJbsFieldConfigByAliasMap(fieldList));

/** 判断列是否字典字段 */
export const isDictPreviewColumn = (
  col: IPreviewColumn,
  fieldList?: IJbsKeywordFieldItem[]
): boolean => isDictPreviewColumnWithMap(col, buildJbsFieldConfigByAliasMap(fieldList));

/** 按列收集 preview 行中的去重原始值（单次遍历，避免每列扫全表） */
const collectDistinctColumnValues = (
  columnKeys: string[],
  previewRows: Array<Record<string, unknown>>
): Map<string, Set<string>> => {
  const valuesByColumn = new Map<string, Set<string>>();
  for (const key of columnKeys) {
    valuesByColumn.set(key, new Set());
  }

  for (const row of previewRows) {
    for (const key of columnKeys) {
      const rawStr = normalizeDictKey(getRowValue(row, key));
      if (rawStr) {
        valuesByColumn.get(key)!.add(rawStr);
      }
    }
  }

  return valuesByColumn;
};

/** 将去重后的原始值并入字典 lookup 的 choices */
const enrichDictLookupFromDistinctValues = (
  lookup: IJbsDictFieldLookup,
  rawValues: Set<string>
): void => {
  const orphanLabels: string[] = [];
  for (const rawStr of rawValues) {
    const displayLabel = resolveDictDisplayLabel(rawStr, lookup);
    if (displayLabel) {
      orphanLabels.push(displayLabel);
    }
    if (displayLabel && rawStr !== displayLabel) {
      orphanLabels.push(rawStr);
    }
  }
  lookup.choices = mergeDictChoicesWithOrphanLabels(lookup.choices, orphanLabels);
};

/**
 * 为引用表所有字典列构建 lookup（按 fieldAlias）
 * - dictType 并行拉取
 * - preview 行单次遍历收集去重值
 */
export const buildDictLookupsByFieldAlias = async (
  columns: IPreviewColumn[],
  fieldList: IJbsKeywordFieldItem[] | undefined,
  previewRows: Array<Record<string, unknown>>
): Promise<Record<string, IJbsDictFieldLookup>> => {
  const configByAlias = buildJbsFieldConfigByAliasMap(fieldList);
  const dictColumnDefs: Array<{ columnKey: string; dictType?: string }> = [];

  for (const col of columns) {
    if (!isDictPreviewColumnWithMap(col, configByAlias)) {
      continue;
    }
    const columnKey = col.fieldName?.trim() || col.title?.trim();
    if (!columnKey) {
      continue;
    }
    dictColumnDefs.push({
      columnKey,
      dictType: resolveColumnDictTypeWithMap(col, configByAlias),
    });
  }

  if (!dictColumnDefs.length) {
    return {};
  }

  const columnKeys = dictColumnDefs.map((item) => item.columnKey);
  const distinctValuesByColumn = collectDistinctColumnValues(columnKeys, previewRows);

  const dictTypes = [
    ...new Set(dictColumnDefs.map((item) => item.dictType).filter(Boolean)),
  ] as string[];
  const itemsByType = new Map<string, IJbsDictDataItem[]>();
  await Promise.all(
    dictTypes.map(async (dictType) => {
      itemsByType.set(dictType, await loadJbsDictItems(dictType));
    })
  );

  const lookups: Record<string, IJbsDictFieldLookup> = {};

  for (const { columnKey, dictType } of dictColumnDefs) {
    const rawValues = distinctValuesByColumn.get(columnKey) ?? new Set<string>();

    if (!dictType) {
      const fallback: IJbsDictFieldLookup = {
        dictType: '',
        valueToLabel: new Map(),
        labelToValue: new Map(),
        apiChoices: [],
        choices: [],
      };
      enrichDictLookupFromDistinctValues(fallback, rawValues);
      if (fallback.choices.length) {
        lookups[columnKey] = fallback;
      }
      continue;
    }

    const lookup = buildDictLookupFromItems(dictType, itemsByType.get(dictType) ?? []);
    enrichDictLookupFromDistinctValues(lookup, rawValues);
    lookups[columnKey] = lookup;
  }

  return lookups;
};

export type IUpdateReferenceFieldFn = (
  fieldId: string,
  fieldRo: { options: { choices: ISelectFieldChoice[]; preventAutoNewOptions: boolean } }
) => Promise<unknown>;

const hashDictChoices = (choices: ISelectFieldChoice[]): string =>
  choices.map((choice) => `${choice.id}\0${choice.name}`).join('\n');

/**
 * 将字典列 options 写入 Teable 字段；choices 未变化时跳过 updateField
 * @returns 是否有字段被更新
 */
export const syncReferenceDictFieldOptions = async (params: {
  columns: IPreviewColumn[];
  fieldList?: IJbsKeywordFieldItem[];
  snapshots: Array<{ id: string; name: string }>;
  dictLookupsByAlias: Record<string, IJbsDictFieldLookup>;
  updateField: IUpdateReferenceFieldFn;
  /** fieldId -> 上次已同步的 choices 指纹 */
  syncedChoiceHashes?: Map<string, string>;
}): Promise<boolean> => {
  const { columns, fieldList, snapshots, dictLookupsByAlias, updateField, syncedChoiceHashes } =
    params;
  const configByAlias = buildJbsFieldConfigByAliasMap(fieldList);
  let updated = false;

  for (const col of columns) {
    if (!isDictPreviewColumnWithMap(col, configByAlias)) {
      continue;
    }
    const columnKey = col.fieldName?.trim() || col.title?.trim();
    const lookup = columnKey ? dictLookupsByAlias[columnKey] : undefined;
    const snapshot = columnKey ? snapshots.find((item) => item.name === columnKey) : undefined;
    if (!snapshot?.id || !lookup?.choices.length) {
      continue;
    }

    const fingerprint = hashDictChoices(lookup.choices);
    if (syncedChoiceHashes?.get(snapshot.id) === fingerprint) {
      continue;
    }

    await updateField(snapshot.id, {
      options: {
        choices: lookup.choices,
        preventAutoNewOptions: true,
      },
    });
    syncedChoiceHashes?.set(snapshot.id, fingerprint);
    updated = true;
  }

  return updated;
};

/** 从 fieldList 项解析 dictType */
export const resolveFieldDictType = (field?: IJbsKeywordFieldItem): string | undefined => {
  if (!field || !isJbsDictFieldType(field.type)) {
    return undefined;
  }
  return field.format?.trim() || undefined;
};
