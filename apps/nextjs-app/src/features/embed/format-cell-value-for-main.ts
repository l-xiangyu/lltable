import { FieldType } from '@teable/core';
import type { IJbsReferenceFieldMeta } from '@teable/sdk/context';
import dayjs from 'dayjs';
import type { IJbsDictFieldLookup } from './jbs-dict-field';
import { resolveDictSaveValue } from './jbs-dict-field';
import { isJbsDictFieldType, isJbsUserFieldType } from './map-jbs-field-type';

/** 用户类字段：Teable 单元格 -> 主端 id 字符串 */
const formatUserTypeCellValueForMain = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => (item && typeof item === 'object' ? item.id : item)).join(',');
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return (value as { id: string }).id;
  }
  return value;
};

/**
 * Teable 单元格值 -> 主端脚本参数值（与 preview 原始类型尽量对齐）
 */
export const formatCellValueForMain = (
  value: unknown,
  fieldType?: FieldType,
  fieldMeta?: Pick<IJbsReferenceFieldMeta, 'jbsType' | 'fieldAlias' | 'dictType'>,
  dictLookupsByAlias?: Record<string, IJbsDictFieldLookup>
): unknown => {
  if (value == null || value === '') {
    return null;
  }

  // 字典字段：单元格为 dictLabel，提交主端时转 dictValue
  if (isJbsDictFieldType(fieldMeta?.jbsType)) {
    const lookup = fieldMeta?.fieldAlias ? dictLookupsByAlias?.[fieldMeta.fieldAlias] : undefined;
    return resolveDictSaveValue(value, lookup);
  }

  // 用户字段：提交主端 userId
  if (isJbsUserFieldType(fieldMeta?.jbsType)) {
    return formatUserTypeCellValueForMain(value);
  }

  switch (fieldType) {
    case FieldType.Date: {
      const parsed = dayjs(value as string | number | Date);
      return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value;
    }
    case FieldType.Number:
    case FieldType.Rating:
      return typeof value === 'number' ? value : Number(value);
    case FieldType.Checkbox:
      return value ? 'Y' : 'N';
    case FieldType.User:
    case FieldType.CreatedBy:
    case FieldType.LastModifiedBy:
      return formatUserTypeCellValueForMain(value);
    default:
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
  }
};
