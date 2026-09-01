import type { ITablePermissionVo } from '@teable/openapi';
import {
  TablePermissionContext,
  TablePermissionContextDefaultValue,
} from '@teable/sdk/context/table-permission';
import { useFields, useView } from '@teable/sdk/hooks';
import { map } from 'lodash';
import { useMemo } from 'react';

/**
 * 分享视图表级权限上下文，按 allowEdit 授予编辑与新增；useView 实时同步 shareMeta，主站关编辑后分享页立即生效
 * 26年4月17日修改分享视图权限
 */
export const ShareTablePermissionProvider = ({ children }: { children: React.ReactNode }) => {
  const fields = useFields({ withHidden: true, withDenied: true });
  const fieldIds = map(fields, 'id');
  // 通过 WebSocket 实时获取视图，shareMeta 变更即时同步
  const view = useView();
  const allowEdit = view?.shareMeta?.allowEdit;

  const value = useMemo(() => {
    return {
      ...TablePermissionContextDefaultValue,
      field: {
        'field|read': true,
      },
      // allowEdit 为真时授予 record|update 与 record|create
      ...(allowEdit
        ? {
            record: {
              'record|update': true,
              'record|create': true,
            },
          }
        : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fieldIds), allowEdit]) as ITablePermissionVo;

  return (
    <TablePermissionContext.Provider value={value}>{children}</TablePermissionContext.Provider>
  );
};
