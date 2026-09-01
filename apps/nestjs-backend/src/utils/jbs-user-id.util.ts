/**
 * 从 OIDC providerId（租户schema:主端userId）解析主端用户 ID
 */
export const parseOidcProviderIdToJbsMainUserId = (
  providerId: string | undefined | null
): string | null => {
  if (!providerId) {
    return null;
  }
  const sep = providerId.indexOf(':');
  if (sep < 0) {
    return null;
  }
  const mainUserId = providerId.slice(sep + 1);
  return mainUserId || null;
};

/**
 * 主端用户 ID（玲珑表格 iframe 嵌入场景，非 Teable usr 前缀）
 */
export const isJbsMainUserId = (userId: string | undefined | null): boolean => {
  if (!userId || userId === 'me') {
    return false;
  }
  if (userId.startsWith('usr')) {
    return false;
  }
  if (userId.startsWith('dept_')) {
    return false;
  }
  return true;
};

/** OIDC 登录提供方标识（与主端 Teable SSO 一致） */
export const JBS_OIDC_PROVIDER = 'oidc';
