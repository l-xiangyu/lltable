import type { IPreviewColumn } from './build-create-table-from-preview';
import type { IJbsKeywordFieldItem, IJbsRelationParamItem } from './jbs-main-api-client';
import { getRowValue } from './map-preview-row-utils';
import { resolveJbsFieldAliasById } from './resolve-jbs-field-alias';

/** 从下钻参数 fieldId + label 回退解析 preview 列 key */
const resolveRelationParamAlias = (
  fieldList: IJbsKeywordFieldItem[] | undefined,
  fieldId?: string,
  labelFallback?: string
): string | undefined =>
  resolveJbsFieldAliasById(fieldList, fieldId) ||
  labelFallback?.trim() ||
  fieldId?.trim() ||
  undefined;

/**
 * 按主端下钻参数映射，从主表当前行组装下钻表 queryCriteria（与 front_pc initRelatedReport 一致）
 * 例：表C.id -> 表B.公司id，用于筛出表B中关联的多条数据
 */
export const buildDrillQueryCriteriaFromMainRow = (params: {
  relationParams: IJbsRelationParamItem[];
  mainRow: Record<string, unknown>;
  mainFieldList?: IJbsKeywordFieldItem[];
  drillFieldList?: IJbsKeywordFieldItem[];
}): Record<string, string> => {
  const { relationParams, mainRow, mainFieldList, drillFieldList } = params;
  const criteria: Record<string, string> = {};

  for (const param of relationParams) {
    const mainAlias = resolveRelationParamAlias(
      mainFieldList,
      param.mainKeyParam,
      param.mainKeyParamLabel
    );
    const subAlias = resolveRelationParamAlias(
      drillFieldList,
      param.subKeyParam,
      param.subKeyParamLabel
    );
    if (!mainAlias || !subAlias) {
      continue;
    }

    const raw = getRowValue(mainRow, mainAlias);
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }

    if (param.subQueryCriteria === 'select') {
      criteria[subAlias] = JSON.stringify([String(raw)]);
    } else {
      criteria[subAlias] = String(raw);
    }
  }

  return criteria;
};

/** 判断下钻行某一字段是否满足 queryCriteria 条件 */
const doesRowMatchCriterion = (
  row: Record<string, unknown>,
  field: string,
  queryValue: string
): boolean => {
  const fieldValue = getRowValue(row, field);
  if (fieldValue == null) {
    return false;
  }
  const text = String(fieldValue);

  if (!queryValue.startsWith('[')) {
    return text === queryValue;
  }

  try {
    const selected = JSON.parse(queryValue) as unknown[];
    return !selected.length || selected.map(String).includes(text);
  } catch {
    return text === queryValue;
  }
};

/** 客户端按 queryCriteria 过滤下钻表行（对齐主端 keyReport 精确/多选匹配） */
export const filterDrillRowsByQueryCriteria = (
  rows: Record<string, unknown>[],
  criteria: Record<string, string>
): Record<string, unknown>[] => {
  const entries = Object.entries(criteria).filter(
    ([, value]) => value && value !== '[]' && value !== 'null'
  );
  if (!entries.length) {
    return rows;
  }

  return rows.filter((row) =>
    entries.every(([field, queryValue]) => doesRowMatchCriterion(row, field, queryValue))
  );
};

/** 下钻表可见列（排除主端隐藏列） */
export const pickVisibleDrillColumns = (columns: IPreviewColumn[]): IPreviewColumn[] =>
  columns.filter((col) => col.isHiddenField !== 'Y');

/** 下钻行是否与主表当前行的参数字段一一对应 */
export const isDrillRowMatchingMainRowParams = (params: {
  drillRow: Record<string, unknown>;
  mainRow: Record<string, unknown>;
  relationParams: IJbsRelationParamItem[];
  mainFieldList?: IJbsKeywordFieldItem[];
  drillFieldList?: IJbsKeywordFieldItem[];
}): boolean => {
  const { drillRow, mainRow, relationParams, mainFieldList, drillFieldList } = params;
  let compared = 0;

  for (const param of relationParams) {
    const mainAlias = resolveRelationParamAlias(
      mainFieldList,
      param.mainKeyParam,
      param.mainKeyParamLabel
    );
    const subAlias = resolveRelationParamAlias(
      drillFieldList,
      param.subKeyParam,
      param.subKeyParamLabel
    );
    if (!mainAlias || !subAlias) {
      continue;
    }

    const mainValue = getRowValue(mainRow, mainAlias);
    if (mainValue === undefined || mainValue === null || mainValue === '') {
      continue;
    }

    compared += 1;
    const drillValue = getRowValue(drillRow, subAlias);
    if (String(drillValue ?? '') !== String(mainValue)) {
      return false;
    }
  }

  return compared > 0;
};

/**
 * 按下钻表关联字段（subKeyParam）与基准行取值，找出应标记的全部行。
 * - 表 B→A（公司id=id）：下钻表 id 唯一 → 仅标记单击行
 * - 表 C→B（id=公司id）：下钻表公司id 可重复 → 标记公司id 相同的全部行
 */
export const findMarkedDrillRowIndicesByDrillRow = (params: {
  rows: Record<string, unknown>[];
  pivotRow: Record<string, unknown>;
  relationParams?: IJbsRelationParamItem[];
  drillFieldList?: IJbsKeywordFieldItem[];
}): number[] => {
  const { rows, pivotRow, relationParams, drillFieldList } = params;
  const pivotIndex = rows.indexOf(pivotRow);

  if (!relationParams?.length) {
    return pivotIndex >= 0 ? [pivotIndex] : [];
  }

  const groupEntries: Array<{ subAlias: string; value: string }> = [];
  for (const param of relationParams) {
    const subAlias = resolveRelationParamAlias(
      drillFieldList,
      param.subKeyParam,
      param.subKeyParamLabel
    );
    if (!subAlias) {
      continue;
    }
    const raw = getRowValue(pivotRow, subAlias);
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }
    groupEntries.push({ subAlias, value: String(raw) });
  }

  if (!groupEntries.length) {
    return pivotIndex >= 0 ? [pivotIndex] : [];
  }

  return rows.reduce<number[]>((indices, row, index) => {
    const matched = groupEntries.every(
      ({ subAlias, value }) => String(getRowValue(row, subAlias) ?? '') === value
    );
    if (matched) {
      indices.push(index);
    }
    return indices;
  }, []);
};

/** 查找与主表当前行下钻参数关联的全部下钻表行下标 */
export const findAssociatedDrillRowIndices = (params: {
  rows: Record<string, unknown>[];
  mainRow?: Record<string, unknown>;
  relationParams?: IJbsRelationParamItem[];
  mainFieldList?: IJbsKeywordFieldItem[];
  drillFieldList?: IJbsKeywordFieldItem[];
}): number[] => {
  const { rows, mainRow, relationParams, mainFieldList, drillFieldList } = params;
  if (!mainRow || !relationParams?.length) {
    return [];
  }

  return rows.reduce<number[]>((indices, row, index) => {
    if (
      isDrillRowMatchingMainRowParams({
        drillRow: row,
        mainRow,
        relationParams,
        mainFieldList,
        drillFieldList,
      })
    ) {
      indices.push(index);
    }
    return indices;
  }, []);
};

/** 定位当前确认行（编辑弹窗改选目标） */
export const findSelectedDrillRowIndex = (params: {
  rows: Record<string, unknown>[];
  columns?: IPreviewColumn[];
  sourceFieldAlias: string;
  displayValue?: string | null;
  mainRow?: Record<string, unknown>;
  relationParams?: IJbsRelationParamItem[];
  mainFieldList?: IJbsKeywordFieldItem[];
  drillFieldList?: IJbsKeywordFieldItem[];
}): number => {
  const {
    rows,
    columns,
    sourceFieldAlias,
    displayValue,
    mainRow,
    relationParams,
    mainFieldList,
    drillFieldList,
  } = params;

  const matchByParams = (row: Record<string, unknown>) =>
    Boolean(
      mainRow &&
        relationParams?.length &&
        isDrillRowMatchingMainRowParams({
          drillRow: row,
          mainRow,
          relationParams,
          mainFieldList,
          drillFieldList,
        })
    );

  const displayNeedle = displayValue?.trim().toLowerCase();
  if (displayNeedle) {
    const keysToTry = new Set<string>([sourceFieldAlias]);
    for (const col of columns ?? []) {
      keysToTry.add(col.fieldName);
      if (col.title) {
        keysToTry.add(col.title);
      }
    }

    const displayMatches = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        [...keysToTry].some(
          (key) =>
            String(getRowValue(row, key) ?? '')
              .trim()
              .toLowerCase() === displayNeedle
        )
      );

    if (displayMatches.length === 1) {
      return displayMatches[0].index;
    }
    if (displayMatches.length > 1) {
      const paramMatch = displayMatches.find(({ row }) => matchByParams(row));
      return paramMatch?.index ?? displayMatches[0].index;
    }
  }

  if (mainRow && relationParams?.length) {
    return rows.findIndex((row) => matchByParams(row));
  }

  return -1;
};
