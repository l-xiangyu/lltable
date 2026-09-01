import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '@teable/core';
import { MoreHorizontal } from '@teable/icons';
import { deleteSpace, permanentDeleteSpace, type IGetSpaceVo } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import { useSession } from '@teable/sdk/hooks';
import { useRouter } from 'next/router';
import React, { useMemo } from 'react';
import { SpaceActionTrigger } from '@/features/app/blocks/space/component/SpaceActionTrigger';

interface ISpaceOperationProps {
  className?: string;
  space: IGetSpaceVo;
  onRename?: () => void;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  onImportBase?: () => void;
}

export const SpaceOperation = (props: ISpaceOperationProps) => {
  const { space, className, onRename, open, setOpen, onImportBase } = props;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useSession();
  const currentSpaceId = router.query.spaceId as string;
  const menuPermission = useMemo(() => {
    return {
      spaceUpdate: hasPermission(space.role, 'space|update'),
      // /* 空间删除空间 - 仅超级管理员 isAdmin 可见空间删除按钮
      // spaceDelete: hasPermission(space.role, 'space|delete'),
      // }, [space.role]);
      spaceDelete: Boolean(user?.isAdmin),
      // 仅超级管理员可重命名空间
      spaceRename: Boolean(user?.isAdmin),
    };
    // }, [space.role]);
  }, [space.role, user?.isAdmin]);

  const { mutate: deleteSpaceMutator } = useMutation({
    mutationFn: deleteSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ReactQueryKeys.spaceList() });
      if (currentSpaceId === space.id) {
        router.push({
          pathname: '/space',
        });
      }
    },
  });

  const { mutate: permanentDeleteSpaceMutator } = useMutation({
    mutationFn: permanentDeleteSpace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ReactQueryKeys.spaceList() });
      if (currentSpaceId === space.id) {
        router.push({
          pathname: '/space',
        });
      }
    },
  });

  if (!Object.values(menuPermission).some(Boolean)) {
    return null;
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
    <div
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      <SpaceActionTrigger
        space={space}
        showRename={menuPermission.spaceUpdate}
        showDelete={menuPermission.spaceDelete}
        showImportBase={menuPermission.spaceUpdate}
        onDelete={() => deleteSpaceMutator(space.id)}
        onPermanentDelete={() => permanentDeleteSpaceMutator(space.id)}
        onRename={onRename}
        open={open}
        setOpen={setOpen}
        onImportBase={onImportBase}
      >
        <div>
          <MoreHorizontal className={className} />
        </div>
      </SpaceActionTrigger>
    </div>
  );
};
