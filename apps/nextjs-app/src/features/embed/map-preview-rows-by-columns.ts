import type { FieldType, IRecord } from '@teable/core';
import type { IJbsDictFieldLookup } from './jbs-dict-field';
import { buildStableRecordId, formatCellValueForField, getRowValue } from './map-preview-row-utils';

type IFieldLike = { id: string; name: string; type?: FieldType };

type IFieldPermission = {
  fieldId: string;
  canUpdate: boolean;
};

/**
 * 按接口列顺序与当前表字段下标映射行数据（表头动态，不依赖 description 中缓存的 columns）
 * fieldPermissions：引用表可编辑时按字段控制 update 权限
 */
export const mapPreviewRowsByColumnKeys = (
  rows: Array<Record<string, unknown>>,
  fields: IFieldLike[],
  columnKeys: string[],
  fieldPermissions?: IFieldPermission[],
  dictLookupsByAlias?: Record<string, IJbsDictFieldLookup>
): IRecord[] => {
  const now = new Date().toISOString();
  const permByFieldId = new Map(fieldPermissions?.map((p) => [p.fieldId, p.canUpdate]) ?? []);

  return rows.map((row, rowIndex) => {
    const recordFields: Record<string, unknown> = {};
    const rowObject = row && typeof row === 'object' ? row : {};

    columnKeys.forEach((key, colIndex) => {
      const fieldId = fields[colIndex]?.id;
      if (!fieldId || !key) {
        return;
      }
      const raw = getRowValue(rowObject, key);
      if (raw !== undefined) {
        const fieldType = fields[colIndex]?.type;
        const dictLookup = key ? dictLookupsByAlias?.[key] : undefined;
        recordFields[fieldId] = formatCellValueForField(raw, fieldType, dictLookup);
      }
    });

    const readPerm: Record<string, boolean> = {};
    const updatePerm: Record<string, boolean> = {};
    fields.forEach((f) => {
      readPerm[f.id] = true;
      updatePerm[f.id] = permByFieldId.has(f.id) ? permByFieldId.get(f.id) ?? false : false;
    });

    return {
      id: buildStableRecordId(rowIndex),
      fields: recordFields,
      createdTime: now,
      permissions: fieldPermissions?.length ? { read: readPerm, update: updatePerm } : undefined,
    };
  });
};
