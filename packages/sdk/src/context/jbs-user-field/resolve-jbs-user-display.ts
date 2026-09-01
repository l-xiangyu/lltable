import type { IUserCellValue } from '@teable/core';
import type { IJbsUserFieldContextValue } from './JbsUserFieldContext';
import { isJbsMainUserId } from './JbsUserFieldContext';

/** 主端用户单元格是否仍需按 id 补全昵称 */
export const needsJbsUserDisplayResolve = (value: IUserCellValue): boolean => {
  if (!isJbsMainUserId(value.id)) {
    return false;
  }
  const title = value.title?.trim();
  return !title || title === value.id;
};

/** 表格/详情等展示：嵌入场景下将主端 userId 解析为昵称 */
export const resolveJbsUserCellValueForDisplay = (
  value: IUserCellValue,
  jbsUserField: IJbsUserFieldContextValue
): IUserCellValue => {
  if (!jbsUserField.enabled || !jbsUserField.resolveUserCellValue || !isJbsMainUserId(value.id)) {
    return value;
  }
  return jbsUserField.resolveUserCellValue(value);
};
