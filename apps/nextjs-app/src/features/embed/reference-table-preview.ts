import type { IPreviewColumn } from './build-create-table-from-preview';
import { resolveJbsFieldDisplayName } from './build-reference-edit-data';
import {
  fetchLltableKeywordDetail,
  fetchPreviewSqlResultToFieldAlias,
  type IJbsKeywordDetail,
  type IJbsKeywordFieldItem,
  type IJbsPreviewSqlPayload,
  type IJbsPreviewSqlResult,
} from './jbs-main-api-client';
import {
  buildJbsReferenceTableMetaForCreate,
  buildKeywordDetailRequestPath,
  type IJbsReferenceTableMeta,
} from './jbs-table-meta';
import { mapJbsFieldTypeToTeable, isJbsDictFieldType } from './map-jbs-field-type';
import { buildJbsFieldConfigByAliasMap, resolveJbsFieldAlias } from './resolve-jbs-field-alias';
import { extractColumnKeysFromPreview } from './sync-reference-table-fields';

/** 从指标 fieldList 构建 fieldAlias -> type 映射（与 preview 列 key 对齐） */
const buildFieldTypeByAliasMap = (
  fieldList: IJbsKeywordFieldItem[] | undefined
): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const [alias, field] of buildJbsFieldConfigByAliasMap(fieldList)) {
    if (field.type) {
      map[alias] = field.type;
    }
  }
  return map;
};

/** 从指标字段配置生成建表列（表头优先 fieldAlias，其次 showAlias / label） */
export const buildColumnsFromFieldList = (
  fieldList: IJbsKeywordFieldItem[] | undefined
): IPreviewColumn[] => {
  if (!fieldList?.length) {
    return [];
  }
  return fieldList.map((field) => {
    const fieldName = resolveJbsFieldDisplayName(field);
    const title = resolveJbsFieldAlias(field) || fieldName;
    return {
      fieldName,
      title,
      jbsFieldId: field.id,
      relatedKeyId: field.relatedKeyId?.trim() || undefined,
      jbsType: field.type,
      fieldType: mapJbsFieldTypeToTeable(field.type),
      dictType: isJbsDictFieldType(field.type) ? field.format?.trim() : undefined,
      isHiddenField: field.isHiddenField,
      isRequiredField: field.isRequiredField,
    };
  });
};

/**
 * 从预览行 + 指标 fieldList 组装列元数据（类型取自 fieldList.type）
 * 列顺序以主端 fieldList 配置为准（调换字段位置后 preview 行 key 顺序可能不变）
 */
export const extractColumnMetasForReference = (
  keyword: IJbsKeywordDetail,
  preview: Pick<IJbsPreviewSqlResult, 'rows'>
): IPreviewColumn[] => {
  const fromFieldList = buildColumnsFromFieldList(keyword.fieldList);
  if (fromFieldList.length > 0) {
    return fromFieldList;
  }

  const typeByAlias = buildFieldTypeByAliasMap(keyword.fieldList);
  const configByAlias = buildJbsFieldConfigByAliasMap(keyword.fieldList);
  const fromRows = extractColumnKeysFromPreview(preview.rows);
  if (fromRows.length > 0) {
    return fromRows.map((key) => {
      const jbsType = typeByAlias[key];
      const config = configByAlias.get(key);
      return {
        fieldName: key,
        title: key,
        jbsFieldId: config?.id,
        relatedKeyId: config?.relatedKeyId?.trim() || undefined,
        jbsType,
        fieldType: mapJbsFieldTypeToTeable(jbsType),
        dictType: isJbsDictFieldType(jbsType) ? config?.format?.trim() : undefined,
        isHiddenField: config?.isHiddenField,
        isRequiredField: config?.isRequiredField,
      };
    });
  }

  return fromFieldList;
};

/** SQL 是否含 {参数} 占位（与主端预览弹窗一致：有参数时不自动 preview） */
export const sqlHasDynamicParams = (sqlScript?: string): boolean => {
  if (!sqlScript) {
    return false;
  }
  return /\{[^}]+\}/.test(sqlScript);
};

/**
 * 组装预览请求体（与 front_pc wordOnlineKeyWordParamsForm 提交 form 一致）
 */
export const buildPreviewPayloadFromKeyword = (
  detail: IJbsKeywordDetail,
  paramStr = ''
): IJbsPreviewSqlPayload => {
  const sqlScript = detail.sqlScript ?? '';
  return {
    id: detail.id,
    keyCode: detail.code,
    sqlScript,
    searchSql: sqlScript,
    dataType: detail.dataType,
    dataSourceId: detail.dataSourceId,
    paramStr,
  };
};

/** @deprecated 使用 extractColumnMetasForReference */
export const extractColumnKeysForReference = (
  keyword: IJbsKeywordDetail,
  rows: Array<Record<string, unknown>>
): string[] => {
  return extractColumnMetasForReference(keyword, { rows }).map((col) => col.fieldName);
};

export type IReferenceTablePreviewResult = IJbsPreviewSqlResult & {
  keyword: IJbsKeywordDetail;
  columns: IPreviewColumn[];
};

/**
 * 引用表拉数：按 description 入库的接口路径请求详情与预览
 */
export const fetchReferenceTablePreview = async (
  meta: IJbsReferenceTableMeta,
  paramStr = ''
): Promise<IReferenceTablePreviewResult> => {
  const keyword = await fetchLltableKeywordDetail(buildKeywordDetailRequestPath(meta));
  const sqlScript = keyword.sqlScript ?? '';

  if (!sqlScript) {
    return { rows: [], keyword, columns: buildColumnsFromFieldList(keyword.fieldList) };
  }

  const hasParams =
    (keyword.paramsList && keyword.paramsList.length > 0) || sqlHasDynamicParams(sqlScript);
  if (hasParams && !paramStr) {
    return { rows: [], keyword, columns: buildColumnsFromFieldList(keyword.fieldList) };
  }

  const preview = await fetchPreviewSqlResultToFieldAlias(
    buildPreviewPayloadFromKeyword(keyword, paramStr),
    meta.previewSqlApi
  );
  const columns = extractColumnMetasForReference(keyword, preview);
  return { ...preview, keyword, columns };
};

/** 建表时推断列：同样先拉指标详情再 preview */
export const resolvePreviewColumnsForKeyword = async (
  detailOrId: IJbsKeywordDetail | string
): Promise<IPreviewColumn[]> => {
  const detail =
    typeof detailOrId === 'string'
      ? await fetchLltableKeywordDetail(
          buildKeywordDetailRequestPath(buildJbsReferenceTableMetaForCreate(detailOrId))
        )
      : detailOrId;

  const fromFields = buildColumnsFromFieldList(detail.fieldList);
  if (fromFields.length > 0 && !detail.sqlScript) {
    return fromFields;
  }

  const { columns } = await fetchReferenceTablePreview(
    buildJbsReferenceTableMetaForCreate(detail.id),
    ''
  );
  if (!columns.length) {
    throw new Error('预览 SQL 未返回数据，无法推断列信息，请维护指标字段列表');
  }

  return columns;
};
