import type { FC } from 'react';

// 页脚组件，已移除原项目GitHub链接 2026-02-28 23:00:00
export const MainFooter: FC = () => {
  return (
    <div>
      <div className={'bgImage'}></div>
      <div className={'content'}>
        <span className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} 北京安信立融科技股份有限公司
        </span>
      </div>
    </div>
  );
};
