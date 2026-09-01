import type { IFilter, IRecord, ISort } from '@teable/core';
import type { ICalendarDailyCollectionRo, ICalendarDailyCollectionVo } from '@teable/openapi';
import { eachDayOfInterval } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import type { DateField } from '../../model';
import { applyJbsReferenceQuery, type IJbsReferenceQueryField } from './apply-jbs-reference-query';

export type IBuildJbsReferenceCalendarDailyCollectionInput = {
  records: IRecord[];
  fields: IJbsReferenceQueryField[];
  startDateField: DateField;
  endDateField: DateField;
  rangeStartIso: string;
  rangeEndIso: string;
  view?: {
    filter?: IFilter | null;
    sort?: ISort | null;
  };
  query?: Pick<ICalendarDailyCollectionRo, 'filter' | 'search' | 'ignoreViewQuery' | 'viewId'>;
};

/** 将单元格日期值解析为 Date，无效则返回 null */
const parseCellDate = (value: unknown): Date | null => {
  if (value == null || value === '') {
    return null;
  }
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 在字段时区下取 yyyy-MM-dd，与 nest calendarDailyCollectionQuery 的 date key 一致 */
const toDateKeyInTimeZone = (date: Date, timeZone: string): string => {
  return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
};

/**
 * 引用表日历：在内存中计算 countMap + 当前可见区间内的记录
 * 逻辑对齐 postgres.calendarDailyCollectionQuery
 */
export const buildJbsReferenceCalendarDailyCollection = (
  input: IBuildJbsReferenceCalendarDailyCollectionInput
): ICalendarDailyCollectionVo => {
  const { records, fields, startDateField, endDateField, rangeStartIso, rangeEndIso, view, query } =
    input;

  const timeZone = startDateField.options.formatting.timeZone;
  const rangeStart = new Date(rangeStartIso);
  const rangeEnd = new Date(rangeEndIso);

  // 筛选/排序合并逻辑与 useJbsReferenceQueryResult 一致，交由 applyJbsReferenceQuery 内部处理
  const { records: filteredRecords } = applyJbsReferenceQuery({
    records,
    fields,
    view: view
      ? {
          filter: view.filter,
          sort: view.sort,
        }
      : undefined,
    query: {
      viewId: query?.viewId,
      search: query?.search,
      filter: query?.filter,
      ignoreViewQuery: query?.ignoreViewQuery,
    },
  });

  const countMap: Record<string, number> = {};
  const recordById = new Map<string, IRecord>();

  const dayKeys = eachDayOfInterval({
    start: toZonedTime(rangeStart, timeZone),
    end: toZonedTime(rangeEnd, timeZone),
  }).map((d) => toDateKeyInTimeZone(d, timeZone));

  for (const record of filteredRecords) {
    const startRaw = record.fields[startDateField.id];
    const endRaw = record.fields[endDateField.id];
    const recordStart = parseCellDate(startRaw);
    if (!recordStart) {
      continue;
    }
    const recordEnd = parseCellDate(endRaw) ?? recordStart;
    const effectiveEnd = recordEnd.getTime() >= recordStart.getTime() ? recordEnd : recordStart;

    // 与库侧一致：记录须与可见区间 [rangeStart, rangeEnd) 有交集
    if (recordStart >= rangeEnd || effectiveEnd < rangeStart) {
      continue;
    }

    recordById.set(record.id, record);

    const startKey = toDateKeyInTimeZone(recordStart, timeZone);
    const endKey = toDateKeyInTimeZone(effectiveEnd, timeZone);

    for (const dayKey of dayKeys) {
      if (startKey <= dayKey && endKey >= dayKey) {
        countMap[dayKey] = (countMap[dayKey] ?? 0) + 1;
      }
    }
  }

  const calendarRecords = Array.from(recordById.values()).sort((a, b) => {
    const sa = parseCellDate(a.fields[startDateField.id])?.getTime() ?? 0;
    const sb = parseCellDate(b.fields[startDateField.id])?.getTime() ?? 0;
    return sa - sb;
  });

  return {
    countMap,
    records: calendarRecords,
  };
};
