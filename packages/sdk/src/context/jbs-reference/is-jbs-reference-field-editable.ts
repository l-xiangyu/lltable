import type { IJbsReferenceRecordsContextValue } from './JbsReferenceRecordsContext';

/** 引用表：按主端 fieldList.isEditable 判断字段是否允许编辑（含新增场景） */
export const isJbsReferenceFieldEditable = (
  jbsReference: Pick<IJbsReferenceRecordsContextValue, 'isReferenceTable' | 'fieldMetas'>,
  fieldId: string
): boolean => {
  if (!jbsReference.isReferenceTable) {
    return true;
  }
  const meta = jbsReference.fieldMetas?.find((item) => item.fieldId === fieldId);
  // 元数据未就绪时保持只读，避免新增行短暂可编辑
  if (!meta) {
    return false;
  }
  return meta.isEditable;
};
