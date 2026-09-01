import type { IQueryBaseRo } from '@teable/openapi';
import { useContext } from 'react';
import { RowCountContext } from '../context';
import { useJbsReferenceQueryResult } from '../context/jbs-reference/use-jbs-reference-query-result';
import { useJbsReferenceRecords } from '../context/jbs-reference';

/** 引用表可传入与 useRecords 相同的 query（如日历某日筛选） */
export function useRowCount(query?: IQueryBaseRo) {
  const jbsReference = useJbsReferenceRecords();
  const jbsQueryResult = useJbsReferenceQueryResult(query);
  const rowCount = useContext(RowCountContext);

  if (jbsReference.isReferenceTable) {
    return jbsQueryResult?.rowCount ?? jbsReference.records.length;
  }
  return rowCount;
}
