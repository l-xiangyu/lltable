import type { IJbsReferenceFieldMeta } from '@teable/sdk/context';
import type { IPreviewColumn } from './build-create-table-from-preview';
import type { IJbsKeywordDetail } from './jbs-main-api-client';
import type { IJbsDrillFieldMeta } from './jbs-table-meta';
import { buildJbsFieldConfigByAliasMap, resolveJbsFieldSubmitKey } from './resolve-jbs-field-alias';

/** 下钻展示列可编辑权限：按 sourceFieldAlias 回溯主端配置 */
export const applyDrillMetaToFieldMetas = (params: {
  metas: IJbsReferenceFieldMeta[];
  drillFields: IJbsDrillFieldMeta[] | undefined;
  columns: IPreviewColumn[];
  keyword: IJbsKeywordDetail;
}): IJbsReferenceFieldMeta[] => {
  const { drillFields, columns, keyword } = params;
  if (!drillFields?.length) {
    return params.metas;
  }

  const columnKeys = columns.map((c) => c.fieldName);
  const configByAlias = buildJbsFieldConfigByAliasMap(keyword.fieldList);

  const updated = [...params.metas];
  for (const drill of drillFields) {
    const colIndex = columnKeys.indexOf(drill.sourceFieldAlias);
    if (colIndex < 0) {
      continue;
    }
    const meta = updated[colIndex];
    if (!meta) {
      continue;
    }
    const config = configByAlias.get(drill.sourceFieldAlias);
    if (!config) {
      continue;
    }
    updated[colIndex] = {
      ...meta,
      fieldName: resolveJbsFieldSubmitKey(config) || meta.fieldName,
      isEditable: config.isEditable === 'Y',
      isRequired: config.isRequiredField === 'Y',
    };
  }

  return updated;
};
