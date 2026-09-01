/**
 * 分享视图批量新增记录的 OpenAPI 客户端；分享页新增行时发起 POST
 * 26年4月17日修改分享视图权限
 */
import { axios } from '../axios';
import type { ICreateRecordsRo, ICreateRecordsVo } from '../record/create';
import { urlBuilder } from '../utils';

export const SHARE_VIEW_CREATE_RECORDS = '/share/{shareId}/view/records';

export const shareViewCreateRecords = (shareId: string, createRecordsRo: ICreateRecordsRo) => {
  return axios.post<ICreateRecordsVo>(
    urlBuilder(SHARE_VIEW_CREATE_RECORDS, { shareId }),
    createRecordsRo
  );
};
