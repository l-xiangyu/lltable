import { useMutation } from '@tanstack/react-query';
import type { AxiosResponse } from 'axios';
import type {
  ICreateRecordsRo,
  IRecordInsertOrderRo,
  IUpdateRecordOrdersRo,
  IUpdateRecordRo,
  IUpdateRecordsRo,
} from '@teable/openapi';
import {
  createRecords as createRecordsApi,
  deleteRecord as deleteRecordApi,
  duplicateRecord as duplicateRecordApi,
  updateRecord as updateRecordApi,
  updateRecordOrders as updateRecordOrdersApi,
  updateRecords as updateRecordsApi,
} from '@teable/openapi';
import { useJbsReferenceRecords } from '../context/jbs-reference';

const JBS_REFERENCE_READONLY_MSG = '引用表为只读，不可修改';
const JBS_REFERENCE_NO_DELETE_MSG = '引用表不支持删除记录';
const JBS_REFERENCE_NO_DUPLICATE_MSG = '引用表不支持复制记录';

/** 引用表跳过 API 调用时的空响应，满足 AxiosResponse 类型 */
const noopVoidAxiosResponse = (): AxiosResponse<void> => ({
  data: undefined,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {} as AxiosResponse<void>['config'],
});

export const useRecordOperations = () => {
  const jbsReference = useJbsReferenceRecords();

  const assertWritable = () => {
    if (jbsReference.isReferenceTable && jbsReference.readonly) {
      throw new Error(JBS_REFERENCE_READONLY_MSG);
    }
  };

  const { mutateAsync: createRecords } = useMutation({
    mutationFn: async ({
      tableId,
      recordsRo,
    }: {
      tableId: string;
      recordsRo: ICreateRecordsRo;
    }) => {
      if (jbsReference.isReferenceTable && !jbsReference.readonly && jbsReference.createRecord) {
        for (const rec of recordsRo.records) {
          await jbsReference.createRecord({ fields: rec.fields });
        }
        return { data: { records: [] } };
      }
      assertWritable();
      return createRecordsApi(tableId, recordsRo);
    },
  });

  const { mutateAsync: updateRecord } = useMutation({
    mutationFn: async ({
      tableId,
      recordId,
      recordRo,
    }: {
      tableId: string;
      recordId: string;
      recordRo: IUpdateRecordRo;
    }) => {
      if (jbsReference.isReferenceTable && !jbsReference.readonly) {
        const fields = recordRo.record?.fields ?? {};
        const hasFieldUpdates = Object.keys(fields).length > 0;

        // 引用表行序由主端决定，忽略仅排序的更新
        if (!hasFieldUpdates && recordRo.order) {
          return { data: {} };
        }

        if (hasFieldUpdates && jbsReference.updateRecordFields) {
          await jbsReference.updateRecordFields({ recordId, fields });
          return { data: {} };
        }

        if (!hasFieldUpdates) {
          return { data: {} };
        }

        throw new Error('引用表更新未就绪');
      }

      assertWritable();
      return updateRecordApi(tableId, recordId, recordRo);
    },
  });

  const { mutateAsync: updateRecords } = useMutation({
    mutationFn: ({ tableId, recordsRo }: { tableId: string; recordsRo: IUpdateRecordsRo }) => {
      assertWritable();
      return updateRecordsApi(tableId, recordsRo);
    },
  });

  const { mutateAsync: duplicateRecord } = useMutation({
    mutationFn: ({
      tableId,
      recordId,
      order,
    }: {
      tableId: string;
      recordId: string;
      order: IRecordInsertOrderRo;
    }) => {
      if (jbsReference.isReferenceTable) {
        throw new Error(JBS_REFERENCE_NO_DUPLICATE_MSG);
      }
      assertWritable();
      return duplicateRecordApi(tableId, recordId, order);
    },
  });

  const { mutateAsync: deleteRecord } = useMutation({
    mutationFn: ({ tableId, recordId }: { tableId: string; recordId: string }) => {
      if (jbsReference.isReferenceTable) {
        throw new Error(JBS_REFERENCE_NO_DELETE_MSG);
      }
      assertWritable();
      return deleteRecordApi(tableId, recordId);
    },
  });

  const { mutateAsync: updateRecordOrders } = useMutation({
    mutationFn: ({
      tableId,
      viewId,
      order,
    }: {
      tableId: string;
      viewId: string;
      order: IUpdateRecordOrdersRo;
    }) => {
      if (jbsReference.isReferenceTable) {
        // 引用表不支持 Teable 视图内调序
        return Promise.resolve(noopVoidAxiosResponse());
      }
      assertWritable();
      return updateRecordOrdersApi(tableId, viewId, order);
    },
  });

  return {
    createRecords,
    updateRecord,
    updateRecords,
    duplicateRecord,
    deleteRecord,
    updateRecordOrders,
  };
};
