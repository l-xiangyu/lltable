import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/** 从 redirect_uri 或 query 中解析出需要带回 IdP（如 Java）的参数，例如 visitId */
function getOidcForwardParams(request: Request): Record<string, string> {
  const params: Record<string, string> = {};
  let visitId = (request.query?.visitId as string) ?? '';

  if (!visitId && typeof request.query?.redirect_uri === 'string') {
    try {
      const decoded = decodeURIComponent(request.query.redirect_uri);
      const q = decoded.indexOf('?');
      if (q !== -1) {
        const search = new URLSearchParams(decoded.slice(q + 1));
        visitId = search.get('visitId') ?? '';
      }
    } catch {
      // ignore
    }
  }

  if (visitId) {
    params.visitId = visitId;
  }
  return params;
}

@Injectable()
export class OIDCGuard extends AuthGuard('openidconnect') {
  private readonly logger = new Logger(OIDCGuard.name);

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorizationParams = getOidcForwardParams(request);
    if (Object.keys(authorizationParams).length > 0) {
      return { authorizationParams };
    }
    return undefined;
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    if (err) {
      this.logger.error(`OIDC authentication error: ${err.message}`, err.stack);
      this.logger.error(`Request URL: ${request.url}`);
      this.logger.error(`Request query: ${JSON.stringify(request.query)}`);
      // 打印底层原因（如网络错误、IdP 返回的 error/error_description）
      const inner = (err as any).oauthError ?? (err as any).cause ?? (err as any).inner;
      if (inner) {
        this.logger.error(`OIDC 潜在错误: ${inner.message ?? String(inner)}`);
        if (inner.data) this.logger.error(`IdP 响应体: ${inner.data}`);
        if (inner.statusCode) this.logger.error(`IdP 状态: ${inner.statusCode}`);
      }
      throw err;
    }
    
    if (info) {
      this.logger.warn(`OIDC authentication info: ${JSON.stringify(info)}`);
      this.logger.warn(`Request URL: ${request.url}`);
      this.logger.warn(`Request query: ${JSON.stringify(request.query)}`);
    }
    
    if (!user) {
      this.logger.error('OIDC authentication failed: No user returned');
      this.logger.error(`Request URL: ${request.url}`);
      this.logger.error(`Request query: ${JSON.stringify(request.query)}`);
      if (info) {
        throw new UnauthorizedException(`OIDC authentication failed: ${info.message || JSON.stringify(info)}`);
      }
      throw new UnauthorizedException('OIDC authentication failed: No user found');
    }
    
    return user;
  }
}
