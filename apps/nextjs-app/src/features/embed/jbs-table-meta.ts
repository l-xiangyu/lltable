/** 存在 lltable 表 description 字段中的元数据前缀 */
export const JBS_TABLE_META_PREFIX = 'JBS_META:';

/** 引用表（数据走主端接口，不落 lltable 业务库） */
export const JBS_TABLE_TYPE_REFERENCE = 'reference' as const;

/** 创建引用表时入库的指标详情 GET 路径前缀（实际请求 {keywordDetailApi}/{keywordId}） */
export const JBS_KEYWORD_DETAIL_API = '/word/wordOnlineKeyWord';

/** 创建引用表时入库的预览 SQL POST 路径 */
export const JBS_PREVIEW_SQL_API = '/base/searchSqlBase/previewSqlResultToFieldAlias';

/**
 * 主表下钻字段元数据：编辑下钻列时实际改主端参数字段，不存外表 recordId
 */
export type IJbsDrillFieldMeta = {
  mode: 'jbsParamDrill';
  /** 下钻展示列 fieldAlias（与主端 preview 列 key 一致） */
  sourceFieldAlias: string;
  sourceFieldId?: string;
  /** 下钻目标指标 id */
  relatedKeyId: string;
  /** 下钻引用表 tableId */
  targetTableId: string;
  targetViewId?: string;
};

/**
 * 引用表 description 元数据：仅持久化请求参数 id + 固定请求接口路径。
 * sqlScript、fieldList、paramStr 等打开表时通过上述接口实时获取，不入库。
 */
export type IJbsReferenceTableMeta = {
  jbsTableType: typeof JBS_TABLE_TYPE_REFERENCE;
  readonly: true;
  keywordId: string;
  keywordDetailApi: string;
  previewSqlApi: string;
  /** 主表下钻字段配置（仅主引用表有） */
  drillFields?: IJbsDrillFieldMeta[];
};

const ensureLeadingSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

/** 创建引用表时写入 description */
export const buildJbsReferenceTableMetaForCreate = (
  keywordId: string,
  drillFields?: IJbsDrillFieldMeta[]
): IJbsReferenceTableMeta => ({
  jbsTableType: JBS_TABLE_TYPE_REFERENCE,
  readonly: true,
  keywordId,
  keywordDetailApi: JBS_KEYWORD_DETAIL_API,
  previewSqlApi: JBS_PREVIEW_SQL_API,
  ...(drillFields?.length ? { drillFields } : {}),
});

const isJbsReferenceTableMeta = (value: unknown): value is IJbsReferenceTableMeta => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const meta = value as IJbsReferenceTableMeta;
  return (
    meta.jbsTableType === JBS_TABLE_TYPE_REFERENCE &&
    meta.readonly === true &&
    typeof meta.keywordId === 'string' &&
    meta.keywordId.trim().length > 0 &&
    typeof meta.keywordDetailApi === 'string' &&
    meta.keywordDetailApi.trim().length > 0 &&
    typeof meta.previewSqlApi === 'string' &&
    meta.previewSqlApi.trim().length > 0
  );
};

export const stringifyJbsTableMeta = (meta: IJbsReferenceTableMeta): string => {
  return JBS_TABLE_META_PREFIX + JSON.stringify(meta);
};

/** 解析失败或结构不符合新版本约定时返回 null（不兼容旧 description） */
export const parseJbsTableMeta = (description?: string | null): IJbsReferenceTableMeta | null => {
  if (!description || !description.startsWith(JBS_TABLE_META_PREFIX)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(description.slice(JBS_TABLE_META_PREFIX.length));
    if (!isJbsReferenceTableMeta(parsed)) {
      return null;
    }
    return {
      jbsTableType: JBS_TABLE_TYPE_REFERENCE,
      readonly: true,
      keywordId: parsed.keywordId.trim(),
      keywordDetailApi: ensureLeadingSlash(parsed.keywordDetailApi.trim()),
      previewSqlApi: ensureLeadingSlash(parsed.previewSqlApi.trim()),
      drillFields: Array.isArray(parsed.drillFields) ? parsed.drillFields : undefined,
    };
  } catch {
    return null;
  }
};

/** 拼接指标详情 GET 路径 */
export const buildKeywordDetailRequestPath = (meta: IJbsReferenceTableMeta): string => {
  const base = meta.keywordDetailApi.replace(/\/$/, '');
  return `${base}/${meta.keywordId}`;
};
