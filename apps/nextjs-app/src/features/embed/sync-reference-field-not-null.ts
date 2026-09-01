import { FieldType } from '@teable/core';
import type { Table } from '@teable/sdk/model/table/table';
import type { IPreviewColumn } from './build-create-table-from-preview';

type IReferenceFieldForNotNullSync = {
  id: string;
  name: string;
  type?: FieldType;
  notNull?: boolean;
};

/** 按主端 isRequiredField 同步引用表字段必填标记 */
export const syncReferenceFieldNotNull = async (
  columns: IPreviewColumn[],
  fields: IReferenceFieldForNotNullSync[],
  table: Table
) => {
  for (let index = 0; index < columns.length; index++) {
    const col = columns[index];
    const field = fields[index];
    if (!field) {
      continue;
    }

    const required = col.isRequiredField === 'Y';
    if (Boolean(field.notNull) === required) {
      continue;
    }

    await table.convertField(field.id, {
      name: field.name,
      type: field.type ?? col.fieldType ?? FieldType.SingleLineText,
      notNull: required,
    });
    field.notNull = required;
  }
};
