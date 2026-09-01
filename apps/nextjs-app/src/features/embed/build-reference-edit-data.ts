import type { IJbsReferenceFieldMeta } from '@teable/sdk/context';
import type { IJbsKeywordFieldItem } from './jbs-main-api-client';
import { isJbsDictFieldType } from './map-jbs-field-type';
import { getRowValue } from './map-preview-row-utils';
import {
  buildJbsFieldConfigByAliasMap,
  resolveJbsFieldAlias,
  resolveJbsFieldSubmitKey,
} from './resolve-jbs-field-alias';

/** 从指标 fieldList + 已同步 Teable 列构建字段映射 */
export const buildReferenceFieldMetas = (
  fieldList: IJbsKeywordFieldItem[] | undefined,
  syncedFields: Array<{ id: string; name: string }>
): IJbsReferenceFieldMeta[] => {
  const aliasToConfig = buildJbsFieldConfigByAliasMap(fieldList);

  return syncedFields.map((sf) => {
    const config = aliasToConfig.get(sf.name);
    // 提交主端 executeEditScripts 时使用 label 作为 data key
    const fieldName = (config && resolveJbsFieldSubmitKey(config)) || sf.name;
    return {
      fieldId: sf.id,
      fieldAlias: sf.name,
      fieldName,
      isEditable: config?.isEditable === 'Y',
      isRequired: config?.isRequiredField === 'Y',
      jbsType: config?.type,
      dictType: isJbsDictFieldType(config?.type) ? config?.format?.trim() : undefined,
    };
  });
};

/**
 * 组装 executeEditScripts 的 data：key 为 fieldList.label，提交行内全部业务字段
 * row 的 key 为 fieldAlias（preview 列）
 */
export const buildReferenceEditData = (
  row: Record<string, unknown>,
  fieldMetas: IJbsReferenceFieldMeta[],
  _dataPrimaryKey?: string,
  /** 下钻展示列：可编辑权限用于打开选择器，但不直接提交主端 */
  excludeFieldAliases?: Set<string>
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  for (const meta of fieldMetas) {
    const { fieldName, fieldAlias } = meta;
    if (!fieldName) {
      continue;
    }
    if (excludeFieldAliases?.has(fieldAlias)) {
      continue;
    }
    const raw = getRowValue(row, fieldAlias);
    // 主端要求整行提交：缺失值用空字符串占位
    data[fieldName] = raw !== undefined && raw !== null ? raw : '';
  }

  return data;
};

/** 保存前校验必填（可编辑且 isRequiredField=Y 的列） */
export const validateReferenceRequiredFields = (
  row: Record<string, unknown>,
  fieldMetas: IJbsReferenceFieldMeta[]
): string | null => {
  for (const meta of fieldMetas) {
    if (!meta.isEditable || !meta.isRequired) {
      continue;
    }
    const raw = getRowValue(row, meta.fieldAlias);
    if (raw == null || raw === '') {
      return `${meta.fieldAlias} 为必填项`;
    }
  }
  return null;
};

/** 从指标字段配置生成默认列名（表头优先 fieldAlias，其次 showAlias / label） */
export const resolveJbsFieldDisplayName = (
  field: IJbsKeywordFieldItem,
  fallback = '字段'
): string => resolveJbsFieldAlias(field) || fallback;
