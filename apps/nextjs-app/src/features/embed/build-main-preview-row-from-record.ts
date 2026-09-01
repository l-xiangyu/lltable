import type { IJbsReferenceFieldMeta } from '@teable/sdk/context';

/** 从 Teable 行单元格组装主表 preview 行（fieldAlias key），用于下钻参数过滤 */
export const buildMainPreviewRowFromRecord = (
  getCellValue: (fieldId: string) => unknown,
  fieldMetas?: IJbsReferenceFieldMeta[]
): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  for (const meta of fieldMetas ?? []) {
    const value = getCellValue(meta.fieldId);
    if (value !== undefined && value !== null) {
      row[meta.fieldAlias] = value;
    }
  }
  return row;
};
