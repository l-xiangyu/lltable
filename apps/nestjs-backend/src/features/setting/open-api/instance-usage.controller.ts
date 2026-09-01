import { Controller, Get } from '@nestjs/common';
import {
  BillingProductLevel,
  type IUsageVo,
  UsageFeatureLimit,
} from '@teable/openapi';
import { Permissions } from '../../auth/decorators/permissions.decorator';

/**
 * Stub instance usage for open-source / EE builds when no billing service is present.
 * Returns a default Enterprise-like usage so admin setting page (Branding, etc.) can render.
 */
const DEFAULT_INSTANCE_USAGE: IUsageVo = {
  level: BillingProductLevel.Enterprise,
  limit: {
    [UsageFeatureLimit.MaxRows]: 500000,
    [UsageFeatureLimit.MaxSizeAttachments]: 2147483648,
    [UsageFeatureLimit.MaxNumDatabaseConnections]: 20,
    [UsageFeatureLimit.MaxRevisionHistoryDays]: 30,
    [UsageFeatureLimit.MaxAutomationHistoryDays]: 90,
    [UsageFeatureLimit.AutomationEnable]: true,
    [UsageFeatureLimit.AuditLogEnable]: true,
    [UsageFeatureLimit.AdminPanelEnable]: true,
    [UsageFeatureLimit.RowColoringEnable]: true,
    [UsageFeatureLimit.ButtonFieldEnable]: true,
    [UsageFeatureLimit.FieldAIEnable]: true,
    [UsageFeatureLimit.UserGroupEnable]: true,
    [UsageFeatureLimit.AdvancedExtensionsEnable]: true,
    [UsageFeatureLimit.AdvancedPermissionsEnable]: true,
    [UsageFeatureLimit.PasswordRestrictedSharesEnable]: true,
    [UsageFeatureLimit.AuthenticationEnable]: true,
    [UsageFeatureLimit.DomainVerificationEnable]: false,
    [UsageFeatureLimit.OrganizationEnable]: false,
    [UsageFeatureLimit.APIRateLimit]: 1000,
    [UsageFeatureLimit.ChatAIEnable]: true,
    [UsageFeatureLimit.AppEnable]: true,
    [UsageFeatureLimit.CustomDomainEnable]: false,
    [UsageFeatureLimit.MaxNumAutomationSendEmail]: 100,
  },
};

@Controller('api/instance')
export class InstanceUsageController {
  @Get('usage')
  @Permissions('instance|read')
  getInstanceUsage(): IUsageVo {
    return DEFAULT_INSTANCE_USAGE;
  }
}
