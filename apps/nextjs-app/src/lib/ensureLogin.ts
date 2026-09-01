import type { ParsedUrlQuery } from 'querystring';
import { HttpError, isAnonymous } from '@teable/core';
import type {
  GetServerSidePropsContext,
  GetServerSidePropsResult,
  PreviewData,
  GetServerSideProps as NextGetServerSideProps,
} from 'next';
import { getUserMe } from '@/backend/api/rest/get-user';
import { providersAll } from '@/features/auth/components/SocialAuth';

// 从 .env 读取允许首页登录的域名，多个用逗号分隔；当前请求 Host 匹配则允许首页登录，否则走 OIDC 逻辑
const ALLOW_HOME_LOGIN_HOSTS = (process.env.ALLOW_HOME_LOGIN_HOST ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function isAllowHomeLoginHost(req: GetServerSidePropsContext['req'] | undefined): boolean {
  if (!ALLOW_HOME_LOGIN_HOSTS.length) return false;
  const raw = req?.headers['x-forwarded-host'] ?? req?.headers?.host ?? '';
  const host = String(raw).toLowerCase().split(',')[0].trim();
  return ALLOW_HOME_LOGIN_HOSTS.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

/** OIDC 跳过首页直接登录 - 当仅启用 OIDC 且禁用密码登录时，返回直接跳转 OIDC 的地址，供嵌入主系统无感知登录使用 */
export function getOidcOnlyRedirectDestination(
  redirectPath: string,
  req?: GetServerSidePropsContext['req'] | undefined
): string | null {
  // 判断是否是可访问首页域名
  if (req && isAllowHomeLoginHost(req)) {
    return null;
  }
  // 非可访问首页域名继续走 OIDC 逻辑
  const envProviders = (process.env.SOCIAL_AUTH_PROVIDERS?.split(',') ?? []).map((p) => p.trim());
  const envPasswordLoginDisabled = process.env.PASSWORD_LOGIN_DISABLED === 'true';
  if (envPasswordLoginDisabled && envProviders.length === 1 && envProviders[0] === 'oidc') {
    const path = redirectPath || '/';
    const url = new URL(path, 'http://x');
    const visitId = url.searchParams.get('visitId');
    let dest = `/api/auth/oidc?redirect_uri=${encodeURIComponent(path)}`;
    if (visitId) {
      dest += `&visitId=${encodeURIComponent(visitId)}`;
    }
    return dest;
  }
  return null;
}

/**
从 URL 中移除指定的 query 参数，返回干净的 URL。
用于在强制重新登录时去掉 force_login 参数，防止 OIDC 回调后再次触发强制登录导致死循环。
*/
function removeQueryParam(url: string, param: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const path = url.slice(0, qIndex);
  const params = new URLSearchParams(url.slice(qIndex + 1));
  params.delete(param);
  const remaining = params.toString();
  return remaining ? `${path}?${remaining}` : path;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type GetServerSideProps<
  P extends { [key: string]: any } = { [key: string]: any },
  Q extends ParsedUrlQuery = ParsedUrlQuery,
  D extends PreviewData = PreviewData,
> = (context: GetServerSidePropsContext<Q, D>) => Promise<GetServerSidePropsResult<P>>;

export default function ensureLogin<P extends { [key: string]: any }>(
  handler: GetServerSideProps<P, ParsedUrlQuery, PreviewData>,
  isLoginPage?: boolean
): NextGetServerSideProps<P> {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  return async (context: GetServerSidePropsContext) => {
    const req = context.req;
    let props: { [key: string]: any } = {};
    try {
      const user = await getUserMe(req?.headers.cookie);
      props['user'] = user;

      // 强制重新登录：主系统切换用户后通过 iframe 带 ?force_login=1 打开 Teable， 即使当前已有 session 也强制走 OIDC 重新认证，确保与主系统当前用户一致。 不限制 isLoginPage，因为 ssoEntryUrl 可能指向登录页或普通页面。
      // !isAnonymous(user?.id) && !isLoginPage && context.query.force_login === '1'
      if (!isAnonymous(user?.id) && context.query.force_login === '1') {
        const cleanUrl = removeQueryParam(req?.url || '/', 'force_login');
        const oidcDest = getOidcOnlyRedirectDestination(cleanUrl, req);
        if (oidcDest) {
          return { redirect: { destination: oidcDest, permanent: false } };
        }
      }

      // User is logged in, redirect to home page if on login page
      if (!isAnonymous(user?.id) && isLoginPage) {
        const redirect = context.query.redirect;
        return {
          redirect: {
            destination: typeof redirect === 'string' ? redirect : '/space',
            permanent: false,
          },
        };
      }
      // User is not logged in, redirect to social auth if on login page
      if (isLoginPage) {
        const result = redirectSocialAuth(req);
        if (result) {
          return result;
        }
      }
    } catch (error) {
      if (error instanceof HttpError) {
        if (isLoginPage) {
          // User is not logged in, handle login page
          return redirectSocialAuth(req) || handler(context);
        }
        if (error.status < 500 && error.status >= 400) {
          // OIDC 跳过首页直接登录 - 未登录时优先跳 OIDC 而非登录页
          const oidcDest = getOidcOnlyRedirectDestination(req?.url || '', req);
          if (oidcDest) {
            return { redirect: { destination: oidcDest, permanent: false } };
          }
          const redirect = encodeURIComponent(req?.url || '');
          const query = redirect ? `redirect=${redirect}` : '';
          return {
            redirect: {
              destination: `/auth/login?${query}`,
              permanent: false,
            },
          };
        }
      }

      // Workaround for https://github.com/zeit/next.js/issues/8592
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      props['err'] = (error as any)?.message;
    }

    const res = await handler(context);
    if ('props' in res) {
      props = {
        ...(await res.props),
        ...props,
      };
    }

    return {
      ...res,
      props: props as P,
    };
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// 通用逻辑 - 当仅一个社交登录且禁用密码时，在登录页直接跳转该社交登录
function redirectSocialAuth(req: GetServerSidePropsContext['req']) {
  // 如果是允许首页/登录页的域名，则不要强制跳 OIDC，直接让登录页自己渲染
  // eslint-disable-next-line sonarjs/cognitive-complexity
  if (isAllowHomeLoginHost(req)) {
    return;
  }

  const redirect = new URLSearchParams(req?.url?.split('?')[1] ?? '').get('redirect');
  // 传递主端传递的UUID. 把这个uuid再带回去. 根据这个UUID获取用户的
  const visitId = new URLSearchParams(req?.url?.split('?')[1] ?? '').get('visitId');
  const envProviders = (process.env.SOCIAL_AUTH_PROVIDERS?.split(',') ?? []).map((p) => p.trim());
  const envPasswordLoginDisabled = process.env.PASSWORD_LOGIN_DISABLED === 'true';
  if (envPasswordLoginDisabled && envProviders.length === 1) {
    const provider = providersAll.find((provider) => provider.id === envProviders[0]);
    if (provider?.authUrl)
      return {
        redirect: {
          destination:
            provider?.authUrl +
            (redirect ? `?redirect_uri=${encodeURIComponent(redirect)}` : '') +
            (provider?.authUrl?.includes('?') || redirect ? '&' : '?') +
            `visitId=${visitId}`,
          permanent: false,
        },
      };
  }
}
