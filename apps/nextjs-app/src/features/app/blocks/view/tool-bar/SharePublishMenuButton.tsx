import { useBaseId, useTableId, useViewId } from '@teable/sdk/hooks';
import { Button } from '@teable/ui-lib';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';
import { JBS_LLTABLE_EMBED_VIEW_CONTEXT } from '@/features/embed/jbs-embed-messages';
import { isInLltableEmbed, postToLltableParent } from '@/features/embed/lltable-parent-bridge';
import { tableConfig } from '@/features/i18n/table.config';

/** 嵌入 iframe 时在工具栏展示，向父页面 postMessage：baseId / tableId / viewId（不依赖分享是否开启），26年4月22日 */
export const SharePublishMenuButton: React.FC<{
  /** 折叠菜单里可占满一行 */
  className?: string;
}> = (props) => {
  const { className } = props;
  const baseId = useBaseId();
  const tableId = useTableId();
  const viewId = useViewId();
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const router = useRouter();
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    setInIframe(isInLltableEmbed());
  }, []);

  // 与侧栏一致：?isExternal=true 表示外链嵌入，不展示「发布菜单」，26年4月22日
  const isExternal =
    router.query.isExternal === 'true' ||
    (Array.isArray(router.query.isExternal) && router.query.isExternal[0] === 'true');
  if (isExternal || !inIframe) {
    return null;
  }

  const handleClick = () => {
    if (typeof window === 'undefined' || window.parent === window) {
      return;
    }
    if (!baseId || !tableId || !viewId) {
      return;
    }
    postToLltableParent({ type: JBS_LLTABLE_EMBED_VIEW_CONTEXT, baseId, tableId, viewId });
  };

  return (
    <Button type="button" variant="secondary" size="xs" className={className} onClick={handleClick}>
      {t('toolbar.others.share.publishMenu', { ns: 'table', defaultValue: '发布菜单' })}
    </Button>
  );
};
