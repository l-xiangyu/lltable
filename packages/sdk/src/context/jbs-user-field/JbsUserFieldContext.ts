import type { IUserCellValue } from '@teable/core';
import type { ForwardedRef, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { IEditorRef } from '../../components/editor/type';
import type { IUserEditorMainProps } from '../../components/editor/user/EditorMain';
import type { ICollaborator } from '../../components/editor/user/types';

export type { IUserEditorMainProps };

/** 主端用户 ID（iframe 嵌入写入用户字段，非 Teable usr 前缀） */
export const isJbsMainUserId = (userId: string | undefined | null): boolean => {
  if (!userId || userId === 'me') {
    return false;
  }
  if (userId.startsWith('usr')) {
    return false;
  }
  if (userId.startsWith('dept_')) {
    return false;
  }
  return true;
};

/** 主端 TreeSelect 节点（与 /system/user/treeData 一致） */
export type IJbsTreeSelectNode = {
  id: string;
  label: string;
  deptOrUser?: 'dept' | 'user';
  choose?: boolean;
  disabled?: boolean;
  open?: boolean;
  children?: IJbsTreeSelectNode[];
};

export type IUserEditorRef = IEditorRef<IUserCellValue | IUserCellValue[] | undefined>;

/** 玲珑表格 iframe 嵌入：用户字段走主端用户树 */
export type IJbsUserFieldContextValue = {
  enabled: boolean;
  treeData: IJbsTreeSelectNode[];
  isLoading: boolean;
  onSearch: (keyword: string) => void;
  /** 筛选器等扁平列表 */
  flatCollaborators: ICollaborator[];
  /** 自定义用户编辑器（树形），由 nextjs-app 注入 */
  renderUserEditor?: (props: IUserEditorMainProps, ref: ForwardedRef<IUserEditorRef>) => ReactNode;
  /** 按主端 userId 补全展示 */
  resolveUserCellValue?: (value: IUserCellValue) => IUserCellValue;
  /** 展示缓存版本号，补全昵称后递增以触发 Grid 重绘 */
  displayCacheVersion?: number;
  /** 当前主端登录用户 ID（筛选「当前用户」映射用） */
  currentJbsUserId?: string;
};

export const JbsUserFieldContextDefaultValue: IJbsUserFieldContextValue = {
  enabled: false,
  treeData: [],
  isLoading: false,
  onSearch: () => undefined,
  flatCollaborators: [],
};

export const JbsUserFieldContext = createContext<IJbsUserFieldContextValue>(
  JbsUserFieldContextDefaultValue
);

export const useJbsUserField = (): IJbsUserFieldContextValue => useContext(JbsUserFieldContext);
