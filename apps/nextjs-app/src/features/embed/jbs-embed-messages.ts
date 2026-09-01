/**
 * 玲珑表格 iframe 与主端 postMessage 协议（须与 front_pc/src/utils/lltableEmbedBridge.js 保持一致）
 */

/** 主端打开「发布菜单」弹窗：携带当前 base/table/view */
export const JBS_LLTABLE_EMBED_VIEW_CONTEXT = 'JBS_LLTABLE_EMBED_VIEW_CONTEXT' as const;

/** 子端请求主端下发鉴权（token、signKey、apiBaseUrl） */
export const JBS_REQUEST_AUTH = 'JBS_REQUEST_AUTH' as const;

/** 主端返回鉴权 */
export const JBS_REQUEST_AUTH_RESULT = 'JBS_REQUEST_AUTH_RESULT' as const;
