/**
 * 分享视图更新记录的 OpenAPI 客户端；分享页编辑单元格时发起 PATCH
 * 26年4月17日修改分享视图权限
 */
import type { IRecord } from '@teable/core';
import { axios } from '../axios';
import type { IUpdateRecordRo } from '../record/update';
import { urlBuilder } from '../utils';

export const SHARE_VIEW_UPDATE_RECORD = '/share/{shareId}/view/record/{recordId}';

export const shareViewUpdateRecord = (
  shareId: string,
  recordId: string,
  updateRecordRo: IUpdateRecordRo
) => {
  return axios.patch<IRecord>(
    urlBuilder(SHARE_VIEW_UPDATE_RECORD, { shareId, recordId }),
    updateRecordRo
  );
};
