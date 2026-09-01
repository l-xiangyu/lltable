import type { FieldType, IRecord } from '@teable/core';
import type { IPreviewColumn } from './build-create-table-from-preview';

/** 列结构指纹：未变化时可跳过字段/字典/视图结构同步 */
export const buildColumnsFingerprint = (columns: IPreviewColumn[]): string =>
  columns
    .map(
      (col) =>
        `${col.fieldName}|${col.jbsType ?? ''}|${col.isHiddenField ?? ''}|${col.dictType ?? ''}|${col.fieldType ?? ''}`
    )
    .join('\n');

/** 按 columns 顺序对齐最新字段（字典 options 同步后需重新拉取） */
export const buildOrderedFieldsForRowMap = (
  columns: Array<{ fieldName: string }>,
  snapshots: Array<{ id: string; name: string; type?: FieldType }>,
  latestFields: Array<{ id: string; name: string; type: FieldType }>
): Array<{ id: string; name: string; type: FieldType }> => {
  const snapByName = new Map(snapshots.map((item) => [item.name, item]));
  const latestById = new Map(latestFields.map((item) => [item.id, item]));

  const ordered: Array<{ id: string; name: string; type: FieldType }> = [];
  for (const col of columns) {
    const columnKey = col.fieldName?.trim();
    if (!columnKey) {
      continue;
    }
    const snap = snapByName.get(columnKey);
    const latest = snap ? latestById.get(snap.id) : undefined;
    if (latest?.id) {
      ordered.push({ id: latest.id, name: latest.name, type: latest.type });
    }
  }
  return ordered;
};

/** 保存成功后局部更新引用表行，避免全量 loadData */
export const patchLocalReferenceRecord = (
  records: IRecord[],
  recordId: string,
  recordFields: Record<string, unknown>
): IRecord[] => {
  return records.map((record) => {
    if (record.id !== recordId) {
      return record;
    }
    return {
      ...record,
      fields: {
        ...record.fields,
        ...recordFields,
      },
    };
  });
};
