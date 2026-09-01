// This file is required by Next.js 15+ for Sentry integration
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
// 仅当构建时启用 Sentry 时才加载，避免生产未启用时拉取 require-in-the-middle 导致 PM2 下模块名冲突
const SENTRY_ENABLED =
  process.env.NEXT_BUILD_ENV_SENTRY_ENABLED === 'true' ||
  process.env.NEXT_BUILD_ENV_SENTRY_ENABLED === '1';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && SENTRY_ENABLED) {
    await import('./sentry.server.config');
  }

  // Edge Runtime config - create sentry.edge.config.ts if using Middleware or Edge API Routes
  // if (process.env.NEXT_RUNTIME === 'edge') {
  //   await import('./sentry.edge.config');
  // }
}

export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: Record<string, string>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
    serverComponentType?: string;
  }
) => {
  if (!SENTRY_ENABLED) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureException(err, {
    extra: {
      request,
      context,
    },
  });
};
