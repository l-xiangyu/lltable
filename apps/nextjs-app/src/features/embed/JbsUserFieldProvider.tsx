'use client';

import { useQuery } from '@tanstack/react-query';
import type { IUserCellValue } from '@teable/core';
import {
  JbsUserFieldContext,
  JbsUserFieldContextDefaultValue,
  type IJbsTreeSelectNode,
  type IUserEditorMainProps,
  type IUserEditorRef,
} from '@teable/sdk/context';
import { needsJbsUserDisplayResolve } from '@teable/sdk/context';
import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJbsLoginUser, fetchJbsUserTree, fetchJbsUsersByIds } from './jbs-main-api-client';
import { flattenJbsUserTree } from './jbs-user-tree-utils';
import { JbsUserTreeEditor } from './JbsUserTreeEditor';
import { isInLltableEmbed } from './lltable-parent-bridge';

const JBS_USER_TREE_QUERY_KEY = ['jbs', 'user-tree'] as const;

type IJbsUserFieldProviderProps = {
  children: ReactNode;
};

type IJbsUserEditorBridgeProps = IUserEditorMainProps & {
  treeData: IJbsTreeSelectNode[];
  isLoading: boolean;
  onTreeSearch: (value: string) => void;
};

/** 桥接主端用户树到 SDK UserEditorMain */
const JbsUserEditorBridge = forwardRef<IUserEditorRef, IJbsUserEditorBridgeProps>(
  ({ treeData, isLoading, onTreeSearch, ...props }, ref) => (
    <JbsUserTreeEditor
      {...props}
      ref={ref}
      treeData={treeData}
      isLoading={isLoading}
      onSearch={onTreeSearch}
    />
  )
);
JbsUserEditorBridge.displayName = 'JbsUserEditorBridge';

/**
 * 玲珑表格 iframe 嵌入：用户字段选人/展示走主端 /system/user/treeData
 */
export const JbsUserFieldProvider = ({ children }: IJbsUserFieldProviderProps) => {
  const embedActive = isInLltableEmbed();
  const [, setSearch] = useState('');
  const displayCacheRef = useRef<Map<string, IUserCellValue>>(new Map());
  const pendingFetchRef = useRef<Set<string>>(new Set());
  const flushScheduledRef = useRef(false);
  const [displayCacheVersion, setDisplayCacheVersion] = useState(0);

  const putUserInDisplayCache = useCallback((id: string, user: IUserCellValue) => {
    displayCacheRef.current.set(id, user);
    setDisplayCacheVersion((v) => v + 1);
  }, []);

  const { data: treeData = [], isLoading } = useQuery({
    queryKey: JBS_USER_TREE_QUERY_KEY,
    queryFn: () => fetchJbsUserTree('0'),
    enabled: embedActive,
    staleTime: 5 * 60 * 1000,
  });

  const { data: loginUser } = useQuery({
    queryKey: ['jbs', 'login-user'],
    queryFn: () => fetchJbsLoginUser(),
    enabled: embedActive,
    staleTime: 5 * 60 * 1000,
  });

  const currentJbsUserId = loginUser?.userId ?? loginUser?.id;

  // 缓存当前登录用户，供创建人/修改人展示补全
  useEffect(() => {
    if (!currentJbsUserId || !loginUser) {
      return;
    }
    displayCacheRef.current.set(currentJbsUserId, {
      id: currentJbsUserId,
      title: loginUser.nickName ?? loginUser.userName ?? currentJbsUserId,
      email: loginUser.email,
      avatarUrl: loginUser.avatar,
    });
  }, [currentJbsUserId, loginUser]);

  const flatCollaborators = useMemo(() => flattenJbsUserTree(treeData), [treeData]);

  const renderUserEditor = useCallback(
    (props: IUserEditorMainProps, ref: React.ForwardedRef<IUserEditorRef>) => (
      <JbsUserEditorBridge
        {...props}
        ref={ref}
        treeData={treeData}
        isLoading={isLoading}
        onTreeSearch={setSearch}
      />
    ),
    [treeData, isLoading]
  );

  const scheduleFetchJbsUsersByIds = useCallback(
    (userIds: string[]) => {
      const missing = userIds.filter(
        (id) => !displayCacheRef.current.has(id) && !pendingFetchRef.current.has(id)
      );
      if (!missing.length) {
        return;
      }
      missing.forEach((id) => pendingFetchRef.current.add(id));
      if (flushScheduledRef.current) {
        return;
      }
      flushScheduledRef.current = true;
      queueMicrotask(() => {
        flushScheduledRef.current = false;
        const batch = Array.from(pendingFetchRef.current);
        pendingFetchRef.current.clear();
        if (!batch.length) {
          return;
        }
        void fetchJbsUsersByIds(batch).then((users) => {
          users.forEach((user) => {
            const id = user.userId ?? user.id;
            if (!id) {
              return;
            }
            putUserInDisplayCache(id, {
              id,
              title: user.nickName ?? user.userName ?? id,
              email: user.email,
              avatarUrl: user.avatar,
            });
          });
        });
      });
    },
    [putUserInDisplayCache]
  );

  const resolveUserCellValue = useCallback(
    (value: IUserCellValue): IUserCellValue => {
      const cached = displayCacheRef.current.get(value.id);
      if (cached) {
        return {
          ...value,
          title: cached.title || value.title,
          avatarUrl: cached.avatarUrl ?? value.avatarUrl,
        };
      }
      if (needsJbsUserDisplayResolve(value)) {
        scheduleFetchJbsUsersByIds([value.id]);
      }
      return value;
    },
    [scheduleFetchJbsUsersByIds]
  );

  // 批量预取主端用户头像/昵称（展示增强）
  useQuery({
    queryKey: ['jbs', 'user-display-cache', flatCollaborators.length],
    queryFn: async () => {
      const ids = flatCollaborators.map((u) => u.userId).slice(0, 500);
      const users = await fetchJbsUsersByIds(ids);
      users.forEach((user) => {
        const id = user.userId ?? user.id;
        if (!id) {
          return;
        }
        displayCacheRef.current.set(id, {
          id,
          title: user.nickName ?? user.userName ?? id,
          email: user.email,
          avatarUrl: user.avatar,
        });
      });
      setDisplayCacheVersion((v) => v + 1);
      return users;
    },
    enabled: embedActive && flatCollaborators.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const contextValue = useMemo(() => {
    if (!embedActive) {
      return JbsUserFieldContextDefaultValue;
    }
    return {
      enabled: true,
      treeData,
      isLoading,
      onSearch: setSearch,
      flatCollaborators,
      renderUserEditor,
      resolveUserCellValue,
      displayCacheVersion,
      currentJbsUserId,
    };
  }, [
    embedActive,
    treeData,
    isLoading,
    flatCollaborators,
    renderUserEditor,
    resolveUserCellValue,
    displayCacheVersion,
    currentJbsUserId,
  ]);

  return (
    <JbsUserFieldContext.Provider value={contextValue}>{children}</JbsUserFieldContext.Provider>
  );
};
