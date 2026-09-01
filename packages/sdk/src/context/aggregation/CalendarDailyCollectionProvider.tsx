import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ITableActionKey, IViewActionKey } from '@teable/core';
import { FieldType } from '@teable/core';
import type { ICalendarDailyCollectionRo } from '@teable/openapi';
import { getCalendarDailyCollection, getShareViewCalendarDailyCollection } from '@teable/openapi';
import { throttle } from 'lodash';
import type { FC, ReactNode } from 'react';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { ReactQueryKeys } from '../../config';
import {
  useFields,
  useSearch,
  useIsHydrated,
  useTableListener,
  useViewListener,
  useView,
} from '../../hooks';
import { useDocumentVisible } from '../../hooks/use-document-visible';
import type { CalendarView, DateField } from '../../model';
import { AnchorContext } from '../anchor';
import { buildJbsReferenceCalendarDailyCollection } from '../jbs-reference/build-jbs-reference-calendar-daily-collection';
import { useJbsReferenceRecords } from '../jbs-reference/JbsReferenceRecordsContext';
import { ShareViewContext } from '../table/ShareViewContext';
import { CalendarDailyCollectionContext } from './CalendarDailyCollectionContext';

interface ICalendarDailyCollectionProviderProps {
  children: ReactNode;
  query?: ICalendarDailyCollectionRo;
}

const THROTTLE_TIME = 2000;

export const CalendarDailyCollectionProvider: FC<ICalendarDailyCollectionProviderProps> = ({
  children,
  query,
}) => {
  const isHydrated = useIsHydrated();
  const { tableId, viewId } = useContext(AnchorContext);
  const queryClient = useQueryClient();
  const { searchQuery } = useSearch();
  const { shareId } = useContext(ShareViewContext);
  const view = useView() as CalendarView | undefined;
  const visible = useDocumentVisible();
  const viewFilter = view?.filter;
  const jbsReference = useJbsReferenceRecords();
  const fields = useFields({ withHidden: true });
  const { startDate, endDate, startDateFieldId, endDateFieldId } = query ?? {};

  const isEnabled = Boolean(startDate && endDate && startDateFieldId && endDateFieldId);

  const calenderDailyCollectionQuery = useMemo(() => {
    const { startDate, endDate, startDateFieldId, endDateFieldId, filter, ignoreViewQuery } =
      query ?? {};
    return {
      viewId,
      search: searchQuery,
      startDate: startDate || '',
      endDate: endDate || '',
      startDateFieldId: startDateFieldId || '',
      endDateFieldId: endDateFieldId || '',
      filter: shareId ? viewFilter : filter,
      ignoreViewQuery,
    };
  }, [query, viewId, searchQuery, shareId, viewFilter]);

  const commonQueryKey = useMemo(
    () => ReactQueryKeys.calendarDailyCollection(tableId as string, calenderDailyCollectionQuery),
    [tableId, calenderDailyCollectionQuery]
  );

  const shareQueryKey = useMemo(
    () =>
      ReactQueryKeys.shareCalendarDailyCollection(shareId as string, calenderDailyCollectionQuery),
    [shareId, calenderDailyCollectionQuery]
  );

  // 引用表数据在内存中，不走 Teable 库聚合接口
  const clientCalendarDailyCollection = useMemo(() => {
    if (!jbsReference.isReferenceTable || !isEnabled) {
      return null;
    }
    const startField = fields.find(
      (f) => f.id === startDateFieldId && f.type === FieldType.Date
    ) as DateField | undefined;
    const endField = fields.find((f) => f.id === endDateFieldId && f.type === FieldType.Date) as
      | DateField
      | undefined;
    if (!startField || !endField) {
      return { countMap: {}, records: [] };
    }
    return buildJbsReferenceCalendarDailyCollection({
      records: jbsReference.records,
      fields,
      startDateField: startField,
      endDateField: endField,
      rangeStartIso: startDate!,
      rangeEndIso: endDate!,
      view: view
        ? {
            filter: view.filter,
            sort: view.sort,
          }
        : undefined,
      query: calenderDailyCollectionQuery,
    });
  }, [
    jbsReference.isReferenceTable,
    jbsReference.records,
    fields,
    isEnabled,
    startDate,
    endDate,
    startDateFieldId,
    endDateFieldId,
    view,
    calenderDailyCollectionQuery,
  ]);

  const { data: commonCalendarDailyCollection } = useQuery({
    queryKey: commonQueryKey,
    queryFn: ({ queryKey }) =>
      getCalendarDailyCollection(queryKey[1], queryKey[2]).then(({ data }) => data),
    enabled: Boolean(
      !shareId && tableId && isHydrated && isEnabled && visible && !jbsReference.isReferenceTable
    ),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const { data: shareCalendarDailyCollection } = useQuery({
    queryKey: shareQueryKey,
    queryFn: ({ queryKey }) =>
      getShareViewCalendarDailyCollection(queryKey[1], queryKey[2]).then(({ data }) => data),
    enabled: Boolean(shareId && tableId && isHydrated && isEnabled && visible),
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const resCalendarDailyCollection = shareId
    ? shareCalendarDailyCollection
    : commonCalendarDailyCollection;

  const activeQueryKey = shareId ? shareQueryKey : commonQueryKey;

  const updateCalendarDailyCollection = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: activeQueryKey.slice(0, 3),
      }),
    [queryClient, activeQueryKey]
  );

  const throttleUpdateCalendarDailyCollection = useMemo(() => {
    return throttle(updateCalendarDailyCollection, THROTTLE_TIME);
  }, [updateCalendarDailyCollection]);

  const updateCalendarDailyCollectionForTable = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: activeQueryKey.slice(0, 2),
    });
  }, [queryClient, activeQueryKey]);

  const throttleUpdateCalendarDailyCollectionForTable = useMemo(() => {
    return throttle(updateCalendarDailyCollectionForTable, THROTTLE_TIME);
  }, [updateCalendarDailyCollectionForTable]);

  const tableMatches = useMemo<ITableActionKey[]>(
    () => ['setRecord', 'addRecord', 'deleteRecord'],
    []
  );
  useTableListener(tableId, tableMatches, throttleUpdateCalendarDailyCollectionForTable);

  const viewMatches = useMemo<IViewActionKey[]>(() => ['applyViewFilter'], []);
  useViewListener(viewId, viewMatches, throttleUpdateCalendarDailyCollection);

  const calendarDailyCollection = useMemo(() => {
    if (jbsReference.isReferenceTable) {
      if (jbsReference.loading) {
        return null;
      }
      return clientCalendarDailyCollection;
    }
    return resCalendarDailyCollection || null;
  }, [
    jbsReference.isReferenceTable,
    jbsReference.loading,
    clientCalendarDailyCollection,
    resCalendarDailyCollection,
  ]);

  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: activeQueryKey });
    };
  }, [queryClient, activeQueryKey]);

  return (
    <CalendarDailyCollectionContext.Provider value={calendarDailyCollection}>
      {children}
    </CalendarDailyCollectionContext.Provider>
  );
};
