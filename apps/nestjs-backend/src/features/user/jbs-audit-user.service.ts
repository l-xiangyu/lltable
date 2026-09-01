import { Injectable } from '@nestjs/common';
import type { IUserCellValue } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import {
  JBS_OIDC_PROVIDER,
  parseOidcProviderIdToJbsMainUserId,
} from '../../utils/jbs-user-id.util';
import { UserFieldDto } from '../field/model/field-dto/user-field.dto';

/**
 * 嵌入主端场景：将 Teable 登录用户解析为审计字段（创建人/最近修改人）使用的主端 userId
 */
@Injectable()
export class JbsAuditUserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  /**
   * 按 Teable 用户 ID 查 OIDC account，解析主端 userId；无映射则回退 Teable ID
   */
  async resolveAuditUserId(teableUserId: string): Promise<string> {
    const account = await this.prismaService.txClient().account.findFirst({
      where: {
        userId: teableUserId,
        provider: JBS_OIDC_PROVIDER,
      },
      select: { providerId: true },
    });
    const jbsUserId = parseOidcProviderIdToJbsMainUserId(account?.providerId);
    return jbsUserId ?? teableUserId;
  }

  /** 当前请求上下文的审计用户 ID 与单元格值 */
  async getAuditContext(): Promise<{
    auditUserId: string;
    auditUserValue: IUserCellValue | null;
  }> {
    const user = this.cls.get('user');
    if (!user?.id) {
      return { auditUserId: '', auditUserValue: null };
    }
    const auditUserId = await this.resolveAuditUserId(user.id);
    const auditUserValue = UserFieldDto.fullAvatarUrl({
      id: auditUserId,
      title: user.name,
      email: user.email,
    });
    return { auditUserId, auditUserValue };
  }

  /** 持久化审计 JSON 时去掉 avatarUrl（与原有逻辑一致） */
  sanitizeAuditUserValue(value: IUserCellValue | null): IUserCellValue | null {
    if (!value) {
      return null;
    }
    const cloned = { ...value };
    if ('avatarUrl' in cloned) {
      delete cloned.avatarUrl;
    }
    return cloned;
  }
}
