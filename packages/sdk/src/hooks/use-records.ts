import type { IRecord } from '@teable/core';
import { IdPrefix } from '@teable/core';
import type { IGetRecordsRo } from '@teable/openapi';
import { keyBy } from 'lodash';
import { useMemo } from 'react';
import { useJbsReferenceRecords } from '../context/jbs-reference';
import { useJbsReferenceQueryResult } from '../context/jbs-reference/use-jbs-reference-query-result';
import { useInstances } from '../context/use-instances';
import { createRecordInstance, recordInstanceFieldMap } from '../model';
import { useFields } from './use-fields';
import { useSearch } from './use-search';
import { useTableId } from './use-table-id';
import { useViewId } from './use-view-id';

export const useRecords = (query?: IGetRecordsRo, initData?: IRecord[]) => {
  const tableId = useTableId();
  const viewId = useViewId();
  const fields = useFields();
  const { searchQuery } = useSearch();
  const jbsReference = useJbsReferenceRecords();
  const jbsQueryResult = useJbsReferenceQueryResult(query);

  const queryParams = useMemo(() => {
    return {
      viewId,
      search: searchQuery,
      ...query,
      type: IdPrefix.Record,
    };
  }, [query, searchQuery, viewId]);

  const { instances, extra } = useInstances({
    collection: `${IdPrefix.Record}_${tableId}`,
    factory: createRecordInstance,
    queryParams,
    initData,
    // 引用表不走 ShareDB 订阅，避免空记录闪烁
    enabled: !jbsReference.isReferenceTable,
  });

  return useMemo(() => {
    const fieldMap = keyBy(fields, 'id');

    if (jbsReference.isReferenceTable) {
      if (!jbsQueryResult) {
        return {
          records: [],
          extra: { loading: jbsReference.loading },
        };
      }
      const instancesFromMain = jbsQueryResult.records.map((record) =>
        recordInstanceFieldMap(createRecordInstance(record), fieldMap)
      );
      return {
        records: instancesFromMain,
        extra: {
          loading: jbsReference.loading,
          groupPoints: jbsQueryResult.groupPoints,
          allGroupHeaderRefs: jbsQueryResult.allGroupHeaderRefs,
          searchHitIndex: jbsQueryResult.searchHitIndex,
        },
      };
    }

    return {
      records: instances.map((instance) => recordInstanceFieldMap(instance, fieldMap)),
      extra,
    };
  }, [
    instances,
    fields,
    extra,
    jbsReference.isReferenceTable,
    jbsReference.loading,
    jbsQueryResult,
  ]);
};
