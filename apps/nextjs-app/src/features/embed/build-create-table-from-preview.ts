import type { IFieldRo } from '@teable/core';
import { FieldType, getUniqName, ViewType } from '@teable/core';
import type { ICreateTableRo } from '@teable/openapi';
import type { IJbsReferenceTableMeta } from './jbs-table-meta';
import { stringifyJbsTableMeta } from './jbs-table-meta';

export type IPreviewColumn = {
  /** 列 key（fieldAlias，与 previewSqlResultToFieldAlias 一致） */
  fieldName: string;
  title?: string;
  /** 主端字段 id */
  jbsFieldId?: string;
  /** 下钻目标指标 id */
  relatedKeyId?: string;
  /** 主端字段类型码 WB / JE / RQ / BL / ZD 等 */
  jbsType?: string;
  /** Teable 字段类型 */
  fieldType?: FieldType;
  /** 字典字段：主端 format 存的 dictType */
  dictType?: string;
  /** 主端字段配置：是否隐藏（Y/N） */
  isHiddenField?: string;
  /** 主端字段配置：是否必填（Y/N） */
  isRequiredField?: string;
};

const buildFieldsFromColumns = (columns: IPreviewColumn[]): IFieldRo[] => {
  const usedFieldNames: string[] = [];
  return columns.map((col) => {
    const rawName = (col.title || col.fieldName || '字段').trim() || '字段';
    const name = getUniqName(rawName, usedFieldNames);
    usedFieldNames.push(name);
    return {
      name,
      type: col.fieldType ?? FieldType.SingleLineText,
    };
  });
};

/** 创建引用表：仅字段 + description 元数据，不写业务行数据 */
export const buildReferenceTableRoFromPreview = (params: {
  tableName: string;
  columns: IPreviewColumn[];
  viewName: string;
  meta: IJbsReferenceTableMeta;
}): ICreateTableRo => {
  const fieldRos = buildFieldsFromColumns(params.columns);
  const meta = params.meta;

  return {
    name: params.tableName,
    description: stringifyJbsTableMeta(meta),
    views: [{ name: params.viewName, type: ViewType.Grid }],
    fields: fieldRos,
    records: [],
    // 展示走引用表视图直连主端拉数，避免生成默认空记录影响字段必填约束
  };
};
