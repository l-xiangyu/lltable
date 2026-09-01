import type { IGetRecordsRo } from '@teable/openapi';
import { useContext, useMemo } from 'react';
import { useFields, useSearch, useView, useViewId } from '../../hooks';
import { PersonalViewContext } from '../view/PersonalViewContext';
import { applyJbsReferenceQuery } from './apply-jbs-reference-query';
import type { IJbsReferenceQueryResult } from './apply-jbs-reference-query';
import { useJbsReferenceRecords } from './JbsReferenceRecordsContext';

/**
 * 引用表：合并视图 / 个人视图 / 查询参数，得到筛选排序分组后的结果
 */
export const useJbsReferenceQueryResult = (
  query?: IGetRecordsRo
): IJbsReferenceQueryResult | null => {
  const jbsReference = useJbsReferenceRecords();
  const view = useView();
  const viewId = useViewId();
  const fields = useFields({ withHidden: true });
  const { searchQuery } = useSearch();
  const { personalViewCommonQuery } = useContext(PersonalViewContext);

  return useMemo(() => {
    if (!jbsReference.isReferenceTable || !fields.length) {
      return null;
    }

    const effectiveQuery: IGetRecordsRo = {
      viewId,
      search: searchQuery,
      ...personalViewCommonQuery,
      ...query,
    };

    return applyJbsReferenceQuery({
      records: jbsReference.records,
      fields,
      view: view
        ? {
            filter: view.filter,
            sort: view.sort,
            group: view.group,
          }
        : undefined,
      query: effectiveQuery,
    });
  }, [
    jbsReference.isReferenceTable,
    jbsReference.records,
    fields,
    view,
    viewId,
    searchQuery,
    personalViewCommonQuery,
    query,
  ]);
};
