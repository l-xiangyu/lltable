import type { IJbsKeywordFieldItem } from './jbs-main-api-client';

/** 主端指标字段：解析 preview 列 key（fieldAlias），与 fieldList 展示规则一致 */
export const resolveJbsFieldAlias = (
  field: Pick<IJbsKeywordFieldItem, 'fieldAlias' | 'showAlias' | 'label' | 'fieldName'>
): string | undefined => {
  const alias = (
    field.fieldAlias ||
    field.showAlias ||
    field.label ||
    field.fieldName ||
    ''
  ).trim();
  return alias || undefined;
};

/** 按 fieldId 从 fieldList 解析 preview 列 key */
export const resolveJbsFieldAliasById = (
  fieldList: IJbsKeywordFieldItem[] | undefined,
  fieldId?: string
): string | undefined => {
  if (!fieldId) {
    return undefined;
  }
  const field = fieldList?.find((item) => item.id === fieldId);
  return field ? resolveJbsFieldAlias(field) : undefined;
};

/** 主端编辑脚本 data 提交 key（fieldList.label） */
export const resolveJbsFieldSubmitKey = (
  field: Pick<IJbsKeywordFieldItem, 'label'>
): string | undefined => {
  const key = field.label?.trim();
  return key || undefined;
};

/** 从 fieldList 构建 alias -> 字段配置 Map */
export const buildJbsFieldConfigByAliasMap = (
  fieldList: IJbsKeywordFieldItem[] | undefined
): Map<string, IJbsKeywordFieldItem> => {
  const map = new Map<string, IJbsKeywordFieldItem>();
  for (const field of fieldList ?? []) {
    const alias = resolveJbsFieldAlias(field);
    if (alias) {
      map.set(alias, field);
    }
  }
  return map;
};
