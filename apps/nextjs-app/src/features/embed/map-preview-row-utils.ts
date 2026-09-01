import type { IUserCellValue } from '@teable/core';
import { FieldType } from '@teable/core';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import type { IJbsDictFieldLookup } from './jbs-dict-field';
import { resolveDictDisplayLabel } from './jbs-dict-field';

dayjs.extend(customParseFormat);

const normalizeKey = (key: string): string => key.trim().toLowerCase();

/** 主端常见日期展示格式（setTableValue / RQ 字段多为 yyyy-MM-dd） */
const JBS_DATE_PARSE_FORMATS = ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD', 'YYYY/MM/DD'];

/** 判断字符串是否已是含时区的 ISO 格式 */
const isIsoWithTimezone = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T.+[zZ]|[+-]\d{2}:\d{2}$/.test(value);

/** 按已知格式或宽松解析日期字符串 */
const parseDateStringToIso = (trimmed: string): string | null => {
  if (isIsoWithTimezone(trimmed)) {
    const iso = dayjs(trimmed);
    return iso.isValid() ? iso.toISOString() : null;
  }
  for (const format of JBS_DATE_PARSE_FORMATS) {
    const parsed = dayjs(trimmed, format, true);
    if (parsed.isValid()) {
      return parsed.toISOString();
    }
  }
  const loose = dayjs(trimmed);
  return loose.isValid() ? loose.toISOString() : null;
};

/**
 * 主端日期值 -> Teable Date 字段要求的 ISO 字符串（含时区偏移）
 * 主端 preview 多为 yyyy-MM-dd 字符串，Teable 校验要求 datetime({ offset: true })
 */
export const formatJbsValueToDateIso = (value: unknown): string | null => {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return dayjs(value).isValid() ? value.toISOString() : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.toISOString() : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? parseDateStringToIso(trimmed) : null;
  }
  return null;
};

/** 主端金额字符串 -> Teable Number 字段数值 */
export const formatJbsValueToNumber = (value: unknown): number | null => {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) {
      return null;
    }
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

/** 文本类字段：统一转字符串 */
export const formatCellValueAsText = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === 'object') {
    if (value instanceof Date) {
      return formatJbsValueToDateIso(value);
    }
    return JSON.stringify(value);
  }
  return String(value);
};

/** 主端用户值 -> Teable User 单元格（preview 多为 userId，昵称由 JbsUserFieldProvider 补全） */
export const formatJbsValueToUserCellValue = (
  value: unknown
): IUserCellValue | IUserCellValue[] | null => {
  if (value == null || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    const items = value
      .map((item) => formatJbsValueToUserCellValue(item))
      .filter((item): item is IUserCellValue => item != null && !Array.isArray(item));
    return items.length ? items : null;
  }

  if (typeof value === 'object' && value !== null && 'id' in value) {
    const user = value as IUserCellValue;
    const id = String(user.id ?? '').trim();
    if (!id) {
      return null;
    }
    return {
      id,
      title: user.title?.trim() || id,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  return { id: text, title: text };
};

/** 按 Teable 字段类型格式化主端单元格值，避免 Date/Number/User 校验失败导致空白 */
export const formatCellValueForField = (
  value: unknown,
  fieldType?: FieldType,
  dictLookup?: IJbsDictFieldLookup
): unknown => {
  if (value == null) {
    return null;
  }
  switch (fieldType) {
    case FieldType.Date:
      return formatJbsValueToDateIso(value);
    case FieldType.Number:
    case FieldType.Rating:
      return formatJbsValueToNumber(value);
    case FieldType.SingleSelect: {
      const label = resolveDictDisplayLabel(value, dictLookup);
      return label ?? formatCellValueAsText(value);
    }
    case FieldType.User:
    case FieldType.CreatedBy:
    case FieldType.LastModifiedBy:
      return formatJbsValueToUserCellValue(value);
    default:
      return formatCellValueAsText(value);
  }
};

/** @deprecated 使用 formatCellValueForField */
export const formatCellValue = formatCellValueAsText;

/** 从主端行对象中按列 key 取值（忽略大小写） */
export const getRowValue = (row: Record<string, unknown>, key: string): unknown => {
  if (!key) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(row, key)) {
    return row[key];
  }
  const target = normalizeKey(key);
  for (const [k, v] of Object.entries(row)) {
    if (normalizeKey(k) === target) {
      return v;
    }
  }
  return undefined;
};

export const buildStableRecordId = (rowIndex: number): string => {
  const suffix = `jbs${String(rowIndex).padStart(13, '0')}`;
  return `rec${suffix.slice(0, 16)}`;
};
