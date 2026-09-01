import { useJbsReferenceRecords } from '@teable/sdk/context';
import { useMemo } from 'react';
import { buildMainPreviewRowFromRecord } from './build-main-preview-row-from-record';

/** 解析主表当前行 preview 数据，供下钻过滤使用 */
export const useMainRowForDrill = (record: {
  id: string;
  getCellValue: (fieldId: string) => unknown;
}): Record<string, unknown> => {
  const jbsReference = useJbsReferenceRecords();

  return useMemo(() => {
    const fromRaw = jbsReference.getRecordRawRow?.(record.id);
    if (fromRaw && Object.keys(fromRaw).length > 0) {
      return fromRaw;
    }
    return buildMainPreviewRowFromRecord(
      (fieldId) => record.getCellValue(fieldId),
      jbsReference.fieldMetas
    );
  }, [record, jbsReference.getRecordRawRow, jbsReference.fieldMetas]);
};
