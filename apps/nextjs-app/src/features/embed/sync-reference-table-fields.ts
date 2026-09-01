import type { IFieldRo, IFieldVo } from '@teable/core';
import { FieldType, getUniqName } from '@teable/core';
import type { Table } from '@teable/sdk/model/table/table';
import type { IPreviewColumn } from './build-create-table-from-preview';
import { syncReferenceFieldNotNull } from './sync-reference-field-not-null';

export type IReferenceFieldSnapshot = {
  id: string;
  name: string;
  type: FieldType;
  isPrimary?: boolean;
  notNull?: boolean;
};

type ICurrentField = {
  id: string;
  name: string;
  type: FieldType;
  isPrimary?: boolean;
  notNull?: boolean;
};

type IColumnSyncPlan = {
  col: IPreviewColumn;
  desiredName: string;
  desiredType: FieldType;
  field?: ICurrentField;
};

/** 从预览结果推断列顺序（列 key 为 fieldAlias） */
export const extractColumnKeysFromPreview = (rows: Array<Record<string, unknown>>): string[] => {
  if (rows.length > 0 && rows[0] && typeof rows[0] === 'object') {
    return Object.keys(rows[0]);
  }
  return [];
};

const pickFieldVo = (res: { data: IFieldVo }): IFieldVo => res.data;

const resolveColumnFieldType = (col: IPreviewColumn): FieldType => {
  return col.fieldType ?? FieldType.SingleLineText;
};

/** 主端列 key（fieldAlias），与 Teable 字段 name 对齐 */
export const resolveColumnFieldKey = (col: IPreviewColumn, index: number): string => {
  return col.fieldName?.trim() || col.title?.trim() || `字段${index + 1}`;
};

const buildColumnSyncPlans = (
  columns: IPreviewColumn[],
  currentFields: ICurrentField[]
): IColumnSyncPlan[] => {
  const fieldByName = new Map(currentFields.map((field) => [field.name, field]));
  const matchedFieldIds = new Set<string>();
  const usedNames: string[] = [];
  const plans: IColumnSyncPlan[] = [];

  for (let index = 0; index < columns.length; index++) {
    const col = columns[index];
    const rawKey = resolveColumnFieldKey(col, index);
    const desiredName = getUniqName(rawKey, usedNames);
    usedNames.push(desiredName);
    const desiredType = resolveColumnFieldType(col);

    // 按 fieldAlias 匹配已有列，不按物理下标（避免主端调换顺序时触发重名冲突）
    const existing = fieldByName.get(rawKey);
    if (existing && !matchedFieldIds.has(existing.id)) {
      matchedFieldIds.add(existing.id);
      plans.push({ col, desiredName, desiredType, field: { ...existing } });
      continue;
    }

    plans.push({ col, desiredName, desiredType });
  }

  return plans;
};

/** 字段别名变更时两阶段重命名，避免「目标名已被占用」 */
const applyFieldRenames = async (
  table: Table,
  plans: IColumnSyncPlan[],
  currentFields: ICurrentField[]
): Promise<void> => {
  const renamePlans = plans.filter((plan) => plan.field && plan.field.name !== plan.desiredName);
  if (!renamePlans.length) {
    return;
  }

  const needsTempPhase = renamePlans.some((plan) => {
    const field = plan.field!;
    return currentFields.some((item) => item.name === plan.desiredName && item.id !== field.id);
  });

  if (needsTempPhase) {
    for (const plan of renamePlans) {
      const field = plan.field!;
      const tempName = `__jbs_reloc_${field.id}__`;
      await table.updateField(field.id, { name: tempName });
      plan.field = { ...field, name: tempName };
    }
  }

  for (const plan of renamePlans) {
    const field = plan.field!;
    await table.updateField(field.id, { name: plan.desiredName });
    plan.field = { ...field, name: plan.desiredName };
  }
};

const syncPlannedFieldType = async (
  table: Table,
  plan: IColumnSyncPlan
): Promise<ICurrentField> => {
  const field = plan.field!;
  if (!field.isPrimary && field.type !== plan.desiredType) {
    await table.convertField(field.id, { name: plan.desiredName, type: plan.desiredType });
    return { ...field, name: plan.desiredName, type: plan.desiredType };
  }
  return field;
};

/**
 * 按主端 fieldList / preview 列顺序同步 Teable 字段：
 * - 按 fieldAlias 匹配已有列（调换顺序不重命名）
 * - 增删列、类型 convert（主字段除外）
 * - 按主端 isRequiredField 同步 notNull
 * 列展示顺序由 sync-reference-view-hidden-fields 写入 view.columnMeta.order
 */
export const syncReferenceTableFields = async (
  table: Table,
  currentFields: ICurrentField[],
  columns: IPreviewColumn[]
): Promise<IReferenceFieldSnapshot[]> => {
  const plans = buildColumnSyncPlans(columns, currentFields);
  const matchedFieldIds = new Set<string>(
    plans.filter((plan) => plan.field).map((plan) => plan.field!.id)
  );

  await applyFieldRenames(table, plans, currentFields);

  const snapshots: IReferenceFieldSnapshot[] = [];

  for (const plan of plans) {
    if (plan.field) {
      const syncedField = await syncPlannedFieldType(table, plan);
      snapshots.push({
        id: syncedField.id,
        name: syncedField.name,
        type: syncedField.type,
        notNull: syncedField.notNull,
        isPrimary: syncedField.isPrimary,
      });
      continue;
    }

    const fieldRo: IFieldRo = { name: plan.desiredName, type: plan.desiredType };
    const created = pickFieldVo(await table.createField(fieldRo));
    matchedFieldIds.add(created.id);
    snapshots.push({
      id: created.id,
      name: created.name,
      type: plan.desiredType,
      notNull: created.notNull,
      isPrimary: created.isPrimary,
    });
  }

  await syncReferenceFieldNotNull(columns, snapshots, table);

  // 主端已移除的列：删除对应 Teable 字段（保留主字段）
  for (const field of currentFields) {
    if (matchedFieldIds.has(field.id) || field.isPrimary) {
      continue;
    }
    await table.deleteField(field.id);
  }

  return snapshots;
};
