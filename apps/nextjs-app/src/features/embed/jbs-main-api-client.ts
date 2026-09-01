import { JBS_REQUEST_AUTH, JBS_REQUEST_AUTH_RESULT } from './jbs-embed-messages';
import { isInLltableEmbed, postToLltableParent } from './lltable-parent-bridge';

/** 主端鉴权包（由父页面 postMessage 下发，不落 Teable 库） */
export type IJbsAuthBundle = {
  token: string;
  signKey?: string;
  apiBaseUrl: string;
  tenantCode?: string;
};

export type IJbsPreviewSqlPayload = {
  searchSql?: string;
  sqlScript?: string;
  paramStr?: string;
  dataType?: string;
  dataSourceId?: string;
  /** 指标主键，对应 SearchColumnDTO.id */
  id?: string;
  /** 指标编码，对应 SearchColumnDTO.keyCode */
  keyCode?: string;
};

let cachedAuth: IJbsAuthBundle | null = null;
let authFetchedAt = 0;
/** 鉴权缓存 5 分钟，打开表时会重新拉取 */
const AUTH_CACHE_MS = 5 * 60 * 1000;

const pendingAuth = new Map<
  string,
  { resolve: (v: IJbsAuthBundle) => void; reject: (e: Error) => void }
>();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as {
      type?: string;
      requestId?: string;
      success?: boolean;
      auth?: IJbsAuthBundle;
      error?: string;
    };
    if (!data || data.type !== JBS_REQUEST_AUTH_RESULT || !data.requestId) {
      return;
    }
    const pending = pendingAuth.get(data.requestId);
    if (!pending) {
      return;
    }
    pendingAuth.delete(data.requestId);
    if (data.success && data.auth?.token && data.auth?.apiBaseUrl) {
      cachedAuth = data.auth;
      authFetchedAt = Date.now();
      pending.resolve(data.auth);
    } else {
      pending.reject(new Error(data.error || '获取主端鉴权失败'));
    }
  });
}

/** 向主端请求 token / signKey / apiBaseUrl（直连主端 API 前调用） */
export const requestJbsAuth = (forceRefresh = false): Promise<IJbsAuthBundle> => {
  if (!isInLltableEmbed()) {
    return Promise.reject(new Error('当前不在主端嵌入环境'));
  }
  if (!forceRefresh && cachedAuth && Date.now() - authFetchedAt < AUTH_CACHE_MS) {
    return Promise.resolve(cachedAuth);
  }
  const requestId = `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingAuth.delete(requestId);
      reject(new Error('获取主端鉴权超时'));
    }, 15000);
    pendingAuth.set(requestId, {
      resolve: (auth) => {
        window.clearTimeout(timer);
        resolve(auth);
      },
      reject: (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    });
    postToLltableParent({ type: JBS_REQUEST_AUTH, requestId });
  });
};

const hmacSha256Base64 = async (payload: string, signKey: string): Promise<string> => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const normalizeApiBase = (base: string): string => {
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

/** 主端签名请求头（X-Sign / X-Timestamp / X-Nonce） */
const appendJbsSignHeaders = async (
  headers: Record<string, string>,
  bundle: IJbsAuthBundle,
  uri: string
): Promise<void> => {
  if (!bundle.signKey) {
    return;
  }
  const timestamp = Date.now().toString();
  const nonce = `${timestamp}_${Math.random().toString(36).slice(2, 15)}`;
  const signPayload = bundle.token + uri + timestamp + nonce;
  headers['X-Sign'] = await hmacSha256Base64(signPayload, bundle.signKey);
  headers['X-Timestamp'] = timestamp;
  headers['X-Nonce'] = nonce;
};

/** previewSqlResultToFieldAlias 返回体（data 列 key 已为 fieldAlias） */
export type IJbsPreviewSqlResult = {
  rows: Array<Record<string, unknown>>;
};

type IJbsAjaxResult<T> = {
  code?: number;
  data?: T;
  msg?: string;
};

type IJbsTableData<T> = {
  code?: number;
  rows?: T[];
  total?: number;
  msg?: string;
};

const PAGE_SIZE = 500;

const buildJbsGetHeaders = async (
  bundle: IJbsAuthBundle,
  uri: string
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${bundle.token}`,
    'J-Request-ID': `${String(Date.now()).slice(-4)}${Math.floor(Math.random() * 1000)}`,
  };
  if (bundle.tenantCode) {
    headers['tenantCode'] = bundle.tenantCode;
  }
  await appendJbsSignHeaders(headers, bundle, uri);
  return headers;
};

const appendQuery = (search: URLSearchParams, key: string, value: string | number | undefined) => {
  if (value === undefined || value === '') {
    return;
  }
  search.append(key, String(value));
};

/** 直连主端 GET（与 front_pc request 一致，仅用于嵌入场景） */
const jbsFetchGet = async <T extends { code?: number; msg?: string }>(
  uri: string,
  query: Record<string, string | number | string[] | undefined>,
  auth?: IJbsAuthBundle
): Promise<T> => {
  const bundle = auth ?? (await requestJbsAuth());
  const baseUrl = normalizeApiBase(bundle.apiBaseUrl);
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => appendQuery(search, key, item));
      return;
    }
    appendQuery(search, key, value);
  });
  const qs = search.toString();
  const path = `${baseUrl}${uri}${qs ? `?${qs}` : ''}`;
  const headers = await buildJbsGetHeaders(bundle, uri.split('?')[0]);

  const res = await fetch(path, { method: 'GET', headers, credentials: 'include' });
  const json = (await res.json()) as T;
  if (!res.ok || (json.code !== undefined && json.code !== 200)) {
    throw new Error(json.msg || `主端接口异常: ${res.status}`);
  }
  return json;
};

/** 直连主端 POST（嵌入场景） */
const jbsFetchPost = async <T extends { code?: number; msg?: string }>(
  uri: string,
  body: unknown,
  auth?: IJbsAuthBundle
): Promise<T> => {
  const bundle = auth ?? (await requestJbsAuth());
  const baseUrl = normalizeApiBase(bundle.apiBaseUrl);
  const path = `${baseUrl}${uri.startsWith('/') ? uri : `/${uri}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=utf-8',
    Authorization: `Bearer ${bundle.token}`,
    'J-Request-ID': `${String(Date.now()).slice(-4)}${Math.floor(Math.random() * 1000)}`,
  };
  if (bundle.tenantCode) {
    headers['tenantCode'] = bundle.tenantCode;
  }
  await appendJbsSignHeaders(headers, bundle, uri.split('?')[0]);

  const res = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });
  const json = (await res.json()) as T;
  if (!res.ok || (json.code !== undefined && json.code !== 200)) {
    throw new Error(json.msg || `主端接口异常: ${res.status}`);
  }
  return json;
};

/** 主端字典项（/system/dict/data/dictType/{dictType}） */
export type IJbsDictDataItem = {
  dictCode?: string;
  dictValue?: string;
  dictLabel?: string;
  dictType?: string;
  status?: string;
};

/**
 * 按字典类型拉取字典数据（与 front_pc getDicts 一致）
 */
export const fetchJbsDictDataByType = async (
  dictType: string,
  auth?: IJbsAuthBundle
): Promise<IJbsDictDataItem[]> => {
  const trimmed = dictType?.trim();
  if (!trimmed) {
    return [];
  }
  const uri = `/system/dict/data/dictType/${encodeURIComponent(trimmed)}`;
  const json = await jbsFetchGet<IJbsAjaxResult<IJbsDictDataItem[]>>(uri, {}, auth);
  return Array.isArray(json.data) ? json.data : [];
};

/**
 * 直连主端：预览 SQL 结果（列 key 已映射为 fieldAlias）
 */
export const fetchPreviewSqlResultToFieldAlias = async (
  payload: IJbsPreviewSqlPayload,
  previewSqlApi: string,
  auth?: IJbsAuthBundle
): Promise<IJbsPreviewSqlResult> => {
  const uri = previewSqlApi.startsWith('/') ? previewSqlApi : `/${previewSqlApi}`;
  const json = await jbsFetchPost<IJbsAjaxResult<unknown>>(
    uri,
    {
      searchSql: payload.searchSql ?? payload.sqlScript,
      paramStr: payload.paramStr ?? '',
      dataType: payload.dataType,
      dataSourceId: payload.dataSourceId,
      id: payload.id,
      keyCode: payload.keyCode,
    },
    auth
  );
  const rows = json.data;
  if (!Array.isArray(rows)) {
    return { rows: [] };
  }
  return { rows: rows as Array<Record<string, unknown>> };
};

/** 打开引用表前刷新鉴权 */
export const invalidateJbsAuthCache = (): void => {
  cachedAuth = null;
  authFetchedAt = 0;
};

/** 指标库列表项（findList 行） */
export type IJbsKeywordListItem = {
  id: string;
  keyWord?: string;
  code?: string;
  type?: string;
  usageScope?: string[] | string;
};

/** 指标字段子表 */
export type IJbsKeywordFieldItem = {
  id?: string;
  showAlias?: string;
  fieldAlias?: string;
  fieldName?: string;
  label?: string;
  /** 主端字段类型码 WB / JE / RQ / BL / ZD / YH 等 */
  type?: string;
  /** 字典类型字段：format 存 dictType（如 sys_yes_no） */
  format?: string;
  /** 下钻目标指标 id */
  relatedKeyId?: string;
  /** 玲珑表格可编辑（Y/N） */
  isEditable?: string;
  /** 玲珑表格必填（Y/N） */
  isRequiredField?: string;
  /** 玲珑表格隐藏（Y/N） */
  isHiddenField?: string;
};

/** 主端下钻参数映射（wordOnlineKeyRelationParam/getRelatedInfo） */
export type IJbsRelationParamItem = {
  fieldId?: string;
  keyId?: string;
  mainKeyParam?: string;
  mainKeyParamLabel?: string;
  subKeyParam?: string;
  subKeyParamLabel?: string;
  subQueryCriteria?: string;
  paramStatus?: string;
};

/** 指标详情（getById） */
export type IJbsKeywordDetail = IJbsKeywordListItem & {
  sqlScript?: string;
  dataType?: string;
  dataSourceId?: string;
  fieldList?: IJbsKeywordFieldItem[];
  paramsList?: unknown[];
  /** 玲珑表格是否可编辑（Y/N） */
  llTableEditable?: string;
  /** 数据主键（fieldList.label） */
  dataPrimaryKey?: string;
};

/** 玲珑表格编辑脚本执行请求 */
export type IJbsExecuteEditScriptsPayload = {
  keywordId: string;
  operation: 'edit' | 'add';
  data: Record<string, unknown>;
};

/** 解析 usageScope 是否包含玲珑表格（LLTable） */
export const keywordSupportsLltable = (usageScope: IJbsKeywordListItem['usageScope']): boolean => {
  if (!usageScope) {
    return false;
  }
  if (Array.isArray(usageScope)) {
    return usageScope.includes('LLTable');
  }
  if (typeof usageScope === 'string') {
    try {
      const parsed = JSON.parse(usageScope) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.includes('LLTable');
      }
    } catch {
      return usageScope.includes('LLTable');
    }
  }
  return false;
};

/**
 * 拉取可用于玲珑表格新建的指标库列表（usageScope 含 LLTable，排除文件夹）
 */
export const fetchLltableKeywordList = async (
  auth?: IJbsAuthBundle
): Promise<IJbsKeywordListItem[]> => {
  const bundle = auth ?? (await requestJbsAuth());
  const allRows: IJbsKeywordListItem[] = [];
  let pageNum = 1;
  let total = 0;

  while (pageNum <= 200) {
    const json = await jbsFetchGet<IJbsTableData<IJbsKeywordListItem>>(
      '/word/wordOnlineKeyWord/findList',
      {
        typeFlag: '1',
        usageScope: ['LLTable'],
        pageNum,
        pageSize: PAGE_SIZE,
      },
      bundle
    );
    const rows = json.rows ?? [];
    total = json.total != null ? json.total : rows.length;
    allRows.push(...rows);
    if (allRows.length >= total || rows.length < PAGE_SIZE) {
      break;
    }
    pageNum += 1;
  }

  return allRows.filter((row) => row.type !== 'folder' && keywordSupportsLltable(row.usageScope));
};

/** 指标详情（含 fieldList、sqlScript）；requestPath 为完整 GET 路径（含 keywordId） */
export const fetchLltableKeywordDetail = async (
  requestPath: string,
  auth?: IJbsAuthBundle
): Promise<IJbsKeywordDetail> => {
  const path = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  const json = await jbsFetchGet<IJbsAjaxResult<IJbsKeywordDetail>>(path, {}, auth);
  if (!json.data) {
    throw new Error('未获取到指标详情');
  }
  return json.data;
};

/** 主端 TreeSelect 节点（/system/user/treeData） */
export type IJbsTreeSelectNode = {
  id: string;
  label: string;
  deptOrUser?: 'dept' | 'user';
  choose?: boolean;
  disabled?: boolean;
  open?: boolean;
  children?: IJbsTreeSelectNode[];
};

/** 主端用户简要信息 */
export type IJbsSysUserItem = {
  userId?: string;
  id?: string;
  nickName?: string;
  userName?: string;
  email?: string;
  avatar?: string;
  status?: string;
};

/** 主端用户树（与 UserSelect 一致） */
export const fetchJbsUserTree = async (
  status = '0',
  auth?: IJbsAuthBundle
): Promise<IJbsTreeSelectNode[]> => {
  const json = await jbsFetchGet<IJbsAjaxResult<IJbsTreeSelectNode[]>>(
    '/system/user/treeData',
    { status },
    auth
  );
  return json.data ?? [];
};

/** 按 userId 列表批量查用户 */
export const fetchJbsUsersByIds = async (
  userIds: string[],
  auth?: IJbsAuthBundle
): Promise<IJbsSysUserItem[]> => {
  if (!userIds.length) {
    return [];
  }
  const json = await jbsFetchPost<IJbsTableData<IJbsSysUserItem>>(
    '/system/user/findInUser',
    userIds,
    auth
  );
  return json.rows ?? [];
};

/** 当前登录主端用户 */
export const fetchJbsLoginUser = async (auth?: IJbsAuthBundle): Promise<IJbsSysUserItem | null> => {
  const json = await jbsFetchGet<IJbsAjaxResult<IJbsSysUserItem>>(
    '/system/user/getLoginUser',
    {},
    auth
  );
  return json.data ?? null;
};

/** 获取指标字段的下钻参数映射 */
export const fetchJbsRelatedInfo = async (
  fieldId: string,
  keyId: string,
  auth?: IJbsAuthBundle
): Promise<IJbsRelationParamItem[]> => {
  const path = `/word/wordOnlineKeyRelationParam/getRelatedInfo/${fieldId}/${keyId}`;
  const json = await jbsFetchGet<IJbsAjaxResult<IJbsRelationParamItem[]>>(path, {}, auth);
  return Array.isArray(json.data) ? json.data : [];
};

/**
 * 玲珑表格：执行指标编辑/新增脚本（data key 为 fieldList.label）
 */
export const fetchExecuteEditScripts = async (
  payload: IJbsExecuteEditScriptsPayload,
  auth?: IJbsAuthBundle
): Promise<void> => {
  await jbsFetchPost<IJbsAjaxResult<unknown>>(
    '/word/wordOnlineKeyWord/executeEditScripts',
    payload,
    auth
  );
};
