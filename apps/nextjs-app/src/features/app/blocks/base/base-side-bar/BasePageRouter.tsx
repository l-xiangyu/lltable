import { Lock, MoreHorizontal, Settings, Trash2 } from '@teable/icons';
import { BillingProductLevel } from '@teable/openapi';
import { useBasePermission, useIsTemplate } from '@teable/sdk/hooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from '@teable/ui-lib/shadcn';
import { Button } from '@teable/ui-lib/shadcn/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { UpgradeWrapper } from '@/features/app/components/billing/UpgradeWrapper';
import { ShareBaseDialog } from '@/features/app/components/collaborator/share/ShareBaseDialog';
import { tableConfig } from '@/features/i18n/table.config';

/*
 * [已隐藏] MoreMenu - "更多"下拉菜单组件
 * 原本将"回收站"和"设计"两个按钮收在一个下拉菜单中。
 * 现改为直接平铺展示，不再需要下拉菜单。
 * 如需恢复下拉菜单形式，取消注释此组件，并在 BasePageRouter 中将平铺按钮替换为 <MoreMenu />。
 *
const MoreMenu = () => {
  const router = useRouter();
  const { baseId } = router.query;
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const basePermission = useBasePermission();

  const canUpdateBase = Boolean(basePermission?.['base|update']);
  if (!canUpdateBase) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className="my-[2px] w-full justify-start text-sm font-normal"
        >
          <MoreHorizontal className="size-4 shrink-0" />
          <p className="truncate">{t('common:actions.more')}</p>
          <div className="grow basis-0"></div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-[200px]">
        {basePermission?.['base|delete'] && (
          <DropdownMenuItem asChild>
            <Button
              variant="ghost"
              size="xs"
              asChild
              className="my-[2px] w-full justify-start text-sm"
            >
              <Link href={`/base/${baseId}/trash`} className="font-normal">
                <Trash2 className="size-4 shrink-0" />
                <p className="truncate">{t('common:noun.trash')}</p>
                <div className="grow basis-0"></div>
              </Link>
            </Button>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Button
            variant="ghost"
            size="xs"
            asChild
            className="my-[2px] w-full justify-start text-sm"
          >
            <Link href={`/base/${baseId}/design`} className="font-normal">
              <Settings className="size-4 shrink-0" />
              <p className="truncate">{t('common:noun.design')}</p>
              <div className="grow basis-0"></div>
            </Link>
          </Button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
*/

export const BasePageRouter = () => {
  const router = useRouter();
  const { baseId } = router.query;
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const basePermission = useBasePermission();
  const isTemplate = useIsTemplate();
  const canUpdateBase = Boolean(basePermission?.['base|update']);

  /*
   * [已隐藏] 权限矩阵(Authority Matrix) - 企业版功能
   * 侧边栏路由入口，跳转到 /base/[baseId]/authority-matrix 页面。
   * 当前开源版无实际实现（页面仅显示"需要升级"提示），故隐藏。
   * 如需启用，取消注释以下 pageRoutes 及对应的 JSX 渲染代码。
   *
  const pageRoutes: {
    href: string;
    label: string;
    Icon: React.FC<{ className?: string }>;
    billingLevel?: BillingProductLevel;
  }[] = useMemo(
    () =>
      [
        {
          href: `/base/${baseId}/authority-matrix`,
          label: t('common:noun.authorityMatrix'),
          Icon: Lock,
          hidden: !basePermission?.['base|authority_matrix_config'],
          billingLevel: BillingProductLevel.Business,
        },
      ].filter((item) => !item.hidden),
    [baseId, basePermission, t]
  );
  */

  if (isTemplate) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 px-3">
      <ul>
        {/*
         * [已隐藏] 权限矩阵路由列表渲染
         * 如需启用，取消注释以下代码块，并恢复上方 pageRoutes 定义。
         *
        {pageRoutes.map(({ href, label, Icon, billingLevel }) => {
          return (
            <UpgradeWrapper
              key={href}
              baseId={baseId as string}
              targetBillingLevel={billingLevel}
            >
              {({ badge }) => (
                <li key={href}>
                  <Button
                    variant="ghost"
                    size="xs"
                    asChild
                    className={cn(
                      'w-full justify-start text-sm my-[2px]',
                      router.asPath.startsWith(href) && 'bg-secondary'
                    )}
                  >
                    <Link href={href} className="font-normal">
                      <Icon className="size-4 shrink-0" />
                      <p className="truncate">{label}</p>
                      <div className="grow basis-0"></div>
                      {badge}
                    </Link>
                  </Button>
                </li>
              )}
            </UpgradeWrapper>
          );
        })}
        */}
        {/* 邀请按钮 - 数据库内坐上返回空间哪里的按钮 */}
        {/* <ShareBaseDialog /> */}

        {/* 回收站 & 设计 - 原本在 MoreMenu 下拉菜单中，现直接平铺展示 */}
        {canUpdateBase && basePermission?.['base|delete'] && (
          <li>
            <Button
              variant="ghost"
              size="xs"
              asChild
              className={cn(
                'w-full justify-start text-sm my-[2px]',
                router.asPath.startsWith(`/base/${baseId}/trash`) && 'bg-secondary'
              )}
            >
              <Link href={`/base/${baseId}/trash`} className="font-normal">
                <Trash2 className="size-4 shrink-0" />
                <p className="truncate">{t('common:noun.trash')}</p>
                <div className="grow basis-0"></div>
              </Link>
            </Button>
          </li>
        )}
        {canUpdateBase && (
          <li>
            <Button
              variant="ghost"
              size="xs"
              asChild
              className={cn(
                'w-full justify-start text-sm my-[2px]',
                router.asPath.startsWith(`/base/${baseId}/design`) && 'bg-secondary'
              )}
            >
              <Link href={`/base/${baseId}/design`} className="font-normal">
                <Settings className="size-4 shrink-0" />
                <p className="truncate">{t('common:noun.design')}</p>
                <div className="grow basis-0"></div>
              </Link>
            </Button>
          </li>
        )}
        {/* 如需恢复"更多"下拉菜单，取消上方 MoreMenu 组件注释，并用 <MoreMenu /> 替换上面的回收站和设计按钮 */}
      </ul>
    </div>
  );
};
