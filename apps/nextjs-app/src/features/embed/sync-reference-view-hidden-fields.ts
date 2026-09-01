import { ViewType } from '@teable/core';
import { getViewList, updateViewColumnMeta } from '@teable/openapi';
import type { IPreviewColumn } from './build-create-table-from-preview';
import { resolveColumnFieldKey } from './sync-reference-table-fields';

type IReferenceFieldForHiddenSync = {
  id: string;
  name: string;
};

/** 按 fieldAlias（Teable 列名）匹配同步后的字段 */
const resolveFieldForColumn = (
  col: IPreviewColumn,
  index: number,
  fields: IReferenceFieldForHiddenSync[]
): IReferenceFieldForHiddenSync | undefined => {
  const key = resolveColumnFieldKey(col, index);
  if (!key) {
    return undefined;
  }
  return fields.find((field) => field.name === key);
};

/** 按视图类型生成列隐藏元数据（Grid 用 hidden，其余富文本视图用 visible） */
const buildHiddenColumnMeta = (viewType: ViewType, isHidden: boolean): Record<string, boolean> => {
  switch (viewType) {
    case ViewType.Grid:
    case ViewType.Plugin:
      return { hidden: isHidden };
    case ViewType.Gallery:
    case ViewType.Kanban:
    case ViewType.Calendar:
    case ViewType.Form:
      return { visible: !isHidden };
    default:
      return { hidden: isHidden };
  }
};

const buildColumnMetaRo = (
  viewType: ViewType,
  columns: IPreviewColumn[],
  fields: IReferenceFieldForHiddenSync[]
) => {
  const items: Array<{ fieldId: string; columnMeta: Record<string, boolean | number> }> = [];

  for (let index = 0; index < columns.length; index++) {
    const col = columns[index];
    const field = resolveFieldForColumn(col, index, fields);
    if (!field) {
      continue;
    }

    const isHidden = col.isHiddenField === 'Y';

    items.push({
      fieldId: field.id,
      columnMeta: {
        // 列顺序与主端 fieldList / preview 列顺序一致
        order: index,
        ...buildHiddenColumnMeta(viewType, isHidden),
      },
    });
  }

  return items;
};

/** 主端 isHiddenField=Y 对应 Teable 字段 id 集合 */
export const buildHiddenFieldIdsFromColumns = (
  columns: IPreviewColumn[],
  fields: IReferenceFieldForHiddenSync[]
): Set<string> => {
  const hiddenIds = new Set<string>();
  for (let index = 0; index < columns.length; index++) {
    const col = columns[index];
    if (col.isHiddenField !== 'Y') {
      continue;
    }
    const field = resolveFieldForColumn(col, index, fields);
    if (field) {
      hiddenIds.add(field.id);
    }
  }
  return hiddenIds;
};

/** 按主端 isHiddenField 同步单个视图的列显隐 */
export const syncReferenceViewHiddenFields = async (
  tableId: string,
  viewId: string | undefined,
  viewType: ViewType,
  columns: IPreviewColumn[],
  fields: IReferenceFieldForHiddenSync[]
) => {
  if (!viewId || !columns.length || !fields.length) {
    return;
  }

  const columnMetaRo = buildColumnMetaRo(viewType, columns, fields);
  if (columnMetaRo.length) {
    await updateViewColumnMeta(tableId, viewId, columnMetaRo);
  }
};

/** 同步表内全部视图（引用表加载/建表时调用） */
export const syncReferenceViewHiddenFieldsForTable = async (
  tableId: string,
  columns: IPreviewColumn[],
  fields: IReferenceFieldForHiddenSync[]
) => {
  if (!columns.length || !fields.length) {
    return;
  }

  const { data: views } = await getViewList(tableId);
  for (const view of views) {
    await syncReferenceViewHiddenFields(tableId, view.id, view.type, columns, fields);
  }
};
