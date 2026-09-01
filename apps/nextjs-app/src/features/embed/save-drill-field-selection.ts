import type { FieldType } from '@teable/core';
import type { IJbsKeywordFieldItem, IJbsRelationParamItem } from './jbs-main-api-client';
import { formatCellValueForField, getRowValue } from './map-preview-row-utils';
import { resolveJbsFieldAliasById } from './resolve-jbs-field-alias';

/** 下钻写回时需要的列元数据（fieldId <-> fieldAlias） */
export type IJbsDrillFieldMetaForUpdate = {
  fieldId: string;
  fieldAlias: string;
};

/**
 * 从下钻表选中行生成主表 preview 行更新（key 为 fieldAlias）。
 * 例：表A.公司id = 选中行.表B.id
 */
export const buildMainRowUpdatesFromDrillSelection = (params: {
  selectedDrillRow: Record<string, unknown>;
  relationParams: IJbsRelationParamItem[];
  mainFieldList: IJbsKeywordFieldItem[] | undefined;
  drillFieldList: IJbsKeywordFieldItem[] | undefined;
}): Record<string, unknown> => {
  const { selectedDrillRow, relationParams, mainFieldList, drillFieldList } = params;
  const updates: Record<string, unknown> = {};

  for (const param of relationParams) {
    const subAlias =
      resolveJbsFieldAliasById(drillFieldList, param.subKeyParam) ||
      param.subKeyParamLabel?.trim() ||
      param.subKeyParam?.trim();
    const mainAlias =
      resolveJbsFieldAliasById(mainFieldList, param.mainKeyParam) ||
      param.mainKeyParamLabel?.trim() ||
      param.mainKeyParam?.trim();
    if (!subAlias || !mainAlias) {
      continue;
    }
    const raw = getRowValue(selectedDrillRow, subAlias);
    if (raw !== undefined && raw !== null && raw !== '') {
      updates[mainAlias] = raw;
    }
  }

  return updates;
};

/**
 * 将下钻选中结果转为 Teable 单元格更新（fieldId -> cellValue）。
 * 含主表参数字段 + 下钻展示列本地展示值。
 */
export const buildDrillFieldCellUpdates = (params: {
  paramUpdates: Record<string, unknown>;
  fieldMetas: IJbsDrillFieldMetaForUpdate[];
  fieldTypeById: Record<string, FieldType | undefined>;
  drillFieldId: string;
  selectedDrillRow: Record<string, unknown>;
  sourceFieldAlias: string;
}): Record<string, unknown> => {
  const {
    paramUpdates,
    fieldMetas,
    fieldTypeById,
    drillFieldId,
    selectedDrillRow,
    sourceFieldAlias,
  } = params;
  const fieldUpdates: Record<string, unknown> = {};

  // 主表参数字段（如 公司id）
  for (const meta of fieldMetas) {
    if (!Object.prototype.hasOwnProperty.call(paramUpdates, meta.fieldAlias)) {
      continue;
    }
    fieldUpdates[meta.fieldId] = formatCellValueForField(
      paramUpdates[meta.fieldAlias],
      fieldTypeById[meta.fieldId]
    );
  }

  // 下钻展示列：用选中行同名字段做本地展示
  const displayRaw = getRowValue(selectedDrillRow, sourceFieldAlias);
  if (displayRaw !== undefined && displayRaw !== null && displayRaw !== '') {
    fieldUpdates[drillFieldId] = formatCellValueForField(displayRaw, fieldTypeById[drillFieldId]);
  }

  return fieldUpdates;
};
