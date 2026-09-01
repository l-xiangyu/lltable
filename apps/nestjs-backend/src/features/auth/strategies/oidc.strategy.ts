import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Profile } from 'passport-openidconnect';
import { Strategy } from 'passport-openidconnect';
import { AuthConfig } from '../../../configs/auth.config';
import type { authConfig } from '../../../configs/auth.config';
import { UserService } from '../../user/user.service';
import { OauthStoreService } from '../oauth/oauth.store';
import { pickUserMe } from '../utils';

@Injectable()
export class OIDCStrategy extends PassportStrategy(Strategy, 'openidconnect') {
  private readonly logger = new Logger(OIDCStrategy.name);

  constructor(
    @AuthConfig() readonly config: ConfigType<typeof authConfig>,
    private usersService: UserService,
    oauthStoreService: OauthStoreService
  ) {
    const { other, ...rest } = config.oidc;
    super({
      ...rest,
      state: true,
      store: oauthStoreService,
      ...other,
    });
  }

  // 重写该方法. 把自定义参数带回主端
  authorizationParams(options: Record<string, any>): Record<string, string> {
    return options?.authorizationParams ?? {};
  }

  /**
   * passport-openidconnect 0.1.2 没有 tokenParams 钩子，
   * 这里在 callback 阶段临时 patch _oauth2.getOAuthAccessToken，
   * 把 OauthStoreService.verify 阶段挂到 req._oidcVisitId 上的 visitId 注入到 token 请求参数中。
   * 2026年02月28日15:16:53
   */
  authenticate(req: any, options: any) {
    if (req.query?.code) {
      const oauth2 = (this as any)._oauth2;
      const originalGetToken = oauth2.getOAuthAccessToken.bind(oauth2);

      // ---------------------- start ------------------------------
      /**
       *  修改说明:
       *  saas端的Authorization 名字和当前系统的名字冲突了. 都叫这个. 顶着这个header到saas端. 会导致获取不到用户报错
       *  实际上这个请求是在请求 ("/teable/oidc/userinfo").permitAll() 的.  他不需要token. 但是叫这个名字又带不过去.
       *  所以这里改一下token的名字. 让saas后台能收到
       **/
      const originalExecute = oauth2._executeRequest.bind(oauth2);
      oauth2._executeRequest = function (...args: any[]) {
        const options = args[1]; // 这里可能是 options 对象
        if (options?.headers) {
          const headers = options.headers;
          if (headers['Authorization']) {
            headers['AuthorizationTeable'] = headers['Authorization'];
            delete headers['Authorization'];
          }
        }
        return originalExecute(...args);
      };
      // ---------------------- end ------------------------------

      // 请求后端 -> teable//oidc/userinfo -> 在node_modules strategy.js 的 self._oauth2.get 请求中
      oauth2.getOAuthAccessToken = (
        code: string,
        params: Record<string, string>,
        callback: (...args: any[]) => void
      ) => {
        if (req._oidcVisitId) {
          params.visitId = req._oidcVisitId;
          this.logger.debug(`Injecting visitId=${req._oidcVisitId} into token request`);
        }
        originalGetToken(code, params, (...args: any[]) => {
          oauth2.getOAuthAccessToken = originalGetToken;
          callback(...args);
        });
      };
    }

    return (Strategy.prototype as any).authenticate.call(this, req, options);
  }

  async validate(_issuer: string, profile: Profile) {
    try {
      this.logger.debug(`OIDC验证已调用发卡机构: ${_issuer}`);
      this.logger.debug(
        `OIDC 个人资料: ${JSON.stringify({ id: profile.id, emails: profile.emails, displayName: profile.displayName })}`
      );

      const { id, emails, displayName, photos } = profile;

      if (!id) {
        this.logger.error('OIDC配置文件缺少id字段');
        throw new UnauthorizedException('OIDC配置文件缺少必需的id字段');
      }

      const email = emails?.[0]?.value;
      if (!email) {
        this.logger.error(`OIDC配置文件缺少电子邮件。剖面结构: ${JSON.stringify(profile)}`);
        throw new UnauthorizedException(
          'OIDC用户信息未提供电子邮件。请确保您的OIDC提供商在用户信息回复中返回电子邮件。'
        );
      }

      this.logger.debug(`使用电子邮件创建/查找用户: ${email}, providerId: ${id}`);

      const user = await this.usersService.findOrCreateUser({
        name: displayName,
        email,
        provider: 'oidc',
        providerId: id,
        type: 'oauth',
        avatarUrl: photos?.[0]?.value,
      });

      if (!user) {
        this.logger.error(`创建电子邮件用户失败: ${email}`);
        throw new UnauthorizedException('无法从OIDC配置文件创建用户');
      }

      if (user.deactivatedTime) {
        this.logger.warn(`已停用的用户尝试登录: ${email}`);
        throw new BadRequestException('您的帐户已被管理员停用');
      }

      await this.usersService.refreshLastSignTime(user.id);
      this.logger.debug(`用户OIDC登录成功: ${email}`);
      return pickUserMe(user);
    } catch (error) {
      this.logger.error(`OIDC验证错误:`, error);
      throw error;
    }
  }
}
