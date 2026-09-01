import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { ZodValidationPipe } from '../../../zod.validation.pipe';
import { AdminOpenApiService } from './admin-open-api.service';
import type { GetUserByProviderRo, GetUserVo } from './user-open-api.schema';
import { getUserByProviderRoSchema } from './user-open-api.schema';

@Controller('api/admin')
@Permissions('instance|update')
export class AdminOpenApiController {
  constructor(private readonly adminService: AdminOpenApiService) {}

  @Patch('/plugin/:pluginId/publish')
  async publishPlugin(@Param('pluginId') pluginId: string): Promise<void> {
    await this.adminService.publishPlugin(pluginId);
  }

  @Patch('/plugin/:pluginId/unpublish')
  async unpublishPlugin(@Param('pluginId') pluginId: string): Promise<void> {
    await this.adminService.unpublishPlugin(pluginId);
  }

  @Post('/attachment/repair-table-thumbnail')
  async repairTableAttachmentThumbnail(): Promise<void> {
    await this.adminService.repairTableAttachmentThumbnail();
  }

  @Get('/debug/heap-snapshot')
  async getHeapSnapshot(@Res() res: Response): Promise<void> {
    await this.adminService.getHeapSnapshot(res);
  }

  @Get('performance-cache-stats')
  async getPerformanceCache() {
    return await this.adminService.getPerformanceCache();
  }

  @Delete('performance-cache')
  async deletePerformanceCache(@Query('key') key?: string) {
    return await this.adminService.deletePerformanceCache(key);
  }

  // 前端使用的企业许可证状态端点。在这里，我们总是报告一个未过期的许可证，以完全解锁EE功能。
  @Get('/enterprise-license/status')
  async getEnterpriseLicenseStatus() {
    return {
      expiredTime: null,
    };
  }

  // 按 (provider, providerId) 查找或创建用户，同时关联 account
  // 与 OIDC 登录的 findOrCreateUser 使用相同的 account 匹配逻辑，多租户安全
  @Post('/users/byProvider')
  async getOrCreateUserByProvider(
    @Body(new ZodValidationPipe(getUserByProviderRoSchema)) body: GetUserByProviderRo
  ): Promise<GetUserVo> {
    return this.adminService.getOrCreateUserByProvider(
      body.provider,
      body.providerId,
      body.email,
      body.name
    );
  }
}
