import type {
  IDateFieldOptions,
  IDateFilter,
  IFilter,
  IFilterItem,
  IFilterSet,
  IGroup,
  IGroupItem,
  IRecord,
  ISortItem,
} from '@teable/core';
import {
  and,
  contains,
  DateFormattingPreset,
  dateFilterSchema,
  DateUtil,
  defaultDatetimeFormatting,
  doesNotContain,
  hasAllOf,
  hasAnyOf,
  hasNoneOf,
  is,
  isAfter,
  isAnyOf,
  isBefore,
  isEmpty,
  isExactly,
  isFieldReferenceValue,
  isGreater,
  isGreaterEqual,
  isLess,
  isLessEqual,
  isNoneOf,
  isNot,
  isNotEmpty,
  isNotExactly,
  isOnOrAfter,
  isOnOrBefore,
  isWithIn,
  mergeWithDefaultFilter,
  mergeWithDefaultSort,
  or,
  parseGroup,
  TimeFormatting,
} from '@teable/core';
import type { IGetRecordsRo, IGroupHeaderRef, IGroupPointsVo } from '@teable/openapi';
import { GroupPointType } from '@teable/openapi';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { keyBy } from 'lodash';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(localeData);

/** 筛选/排序所需的最小字段能力（须用 useFields 已有实例，勿再 plainToInstance，否则会触发 ShareDB） */
export type IJbsReferenceQueryField = {
  id: string;
  /** 日期筛选需字段 type / options 解析时间范围 */
  type?: string;
  options?: IDateFieldOptions | unknown;
  cellValue2String: (value?: unknown) => string;
};

/** 与 nestjs-backend string2Hash 一致，用于分组头 id */
const string2Hash = (str: string) => {
  let hash = 5381;
  let i = str.length;
  while (i) {
    hash = (hash * 33) ^ str.charCodeAt(--i);
  }
  return hash >>> 0;
};

const convertValueToStringify = (value: unknown): number | string | null => {
  if (typeof value === 'bigint' || typeof value === 'number') {
    return Number(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) return null;
  return JSON.stringify(value);
};

export type IJbsReferenceQueryInput = {
  records: IRecord[];
  fields: IJbsReferenceQueryField[];
  /** 当前视图（含 filter / sort / group） */
  view?: {
    filter?: IFilter | null;
    sort?: { sortObjs?: ISortItem[]; manualSort?: boolean } | null;
    group?: IGroup | null;
  };
  query?: IGetRecordsRo;
};

export type IJbsReferenceQueryResult = {
  /** 经筛选、排序、分组折叠后的全量行（未分页） */
  records: IRecord[];
  /** 筛选 + 搜索后的行数（不含折叠隐藏） */
  rowCount: number;
  groupPoints: IGroupPointsVo;
  allGroupHeaderRefs: IGroupHeaderRef[];
  searchHitIndex?: { fieldId: string; recordId: string }[];
};

const getFieldMap = (
  fields: IJbsReferenceQueryField[]
): Record<string, IJbsReferenceQueryField> => {
  return keyBy(fields, 'id');
};

const getCellCompareKey = (
  field: IJbsReferenceQueryField | undefined,
  record: IRecord,
  fieldId: string
) => {
  if (!field) return null;
  return convertValueToStringify(field.cellValue2String(record.fields[fieldId]));
};

const getCellSearchText = (
  field: IJbsReferenceQueryField | undefined,
  record: IRecord,
  fieldId: string
) => {
  if (!field) return '';
  return field.cellValue2String(record.fields[fieldId]) ?? '';
};

/** 判断筛选值是否为日期筛选结构 */
const isDateFilterValue = (value: unknown): value is IDateFilter => {
  return (
    typeof value === 'object' &&
    value != null &&
    'mode' in value &&
    typeof (value as { mode?: unknown }).mode === 'string'
  );
};

/** 从字段或筛选值解析日期字段 options */
const resolveDateFieldOptionsForFilter = (
  fieldOptions: unknown,
  filterValue: IDateFilter
): IDateFieldOptions => {
  const fromField = fieldOptions as IDateFieldOptions | undefined;
  if (fromField?.formatting?.timeZone) {
    return fromField;
  }
  return {
    formatting: {
      ...defaultDatetimeFormatting,
      timeZone: filterValue.timeZone,
    },
  };
};

/** 与 nestjs-backend getFilterDateTimeRange 对齐：将日期筛选值解析为 [startIso, endIso] */
const resolveJbsDateFilterRange = (
  dateFieldOptions: IDateFieldOptions,
  filterValue: IDateFilter
): [string, string] => {
  const filterValueByDate = dateFilterSchema.parse(filterValue);
  const { mode, numberOfDays, exactDate } = filterValueByDate;
  const {
    formatting: { timeZone, date: dateFormat, time: timeFormat },
  } = dateFieldOptions;

  const hasTimeFormat = timeFormat && timeFormat !== TimeFormatting.None;
  const dateUtil = new DateUtil(timeZone);

  const computeDateRangeForFixedDays = (
    methodName:
      | 'date'
      | 'tomorrow'
      | 'yesterday'
      | 'lastWeek'
      | 'nextWeek'
      | 'lastMonth'
      | 'nextMonth'
  ): [Dayjs, Dayjs] => {
    return [dateUtil[methodName]().startOf('day'), dateUtil[methodName]().endOf('day')];
  };

  const calculateDateRangeForOffsetDays = (isPast: boolean): [Dayjs, Dayjs] => {
    if (!numberOfDays) {
      throw new Error('Number of days must be entered');
    }
    const offsetDays = isPast ? -numberOfDays : numberOfDays;
    return [
      dateUtil.offsetDay(offsetDays).startOf('day'),
      dateUtil.offsetDay(offsetDays).endOf('day'),
    ];
  };

  const determineDateRangeForExactDate = (): [Dayjs, Dayjs] => {
    if (!exactDate) {
      throw new Error('Exact date must be entered');
    }
    return [dateUtil.date(exactDate).startOf('day'), dateUtil.date(exactDate).endOf('day')];
  };

  const determineDateRangeForExactFormatDate = (): [Dayjs, Dayjs] => {
    if (!exactDate) {
      throw new Error('Exact date must be entered');
    }
    const parsedDate = dateUtil.date(exactDate);
    switch (dateFormat) {
      case DateFormattingPreset.Y:
        return [parsedDate.startOf('year'), parsedDate.endOf('year')];
      case DateFormattingPreset.YM:
      case DateFormattingPreset.M:
        return [parsedDate.startOf('month'), parsedDate.endOf('month')];
      case DateFormattingPreset.MD:
      case DateFormattingPreset.D:
      default:
        return [parsedDate.startOf('day'), parsedDate.endOf('day')];
    }
  };

  const generateOffsetDateRange = (
    isPast: boolean,
    unit: 'day' | 'week' | 'month' | 'year',
    days?: number
  ): [Dayjs, Dayjs] => {
    if (days === undefined || days === null) {
      throw new Error('Number of days must be entered');
    }
    const currentDate = dateUtil.date();
    const startOfDay = currentDate.startOf('day');
    const endOfDay = currentDate.endOf('day');
    const startDate = isPast ? dateUtil.offset(unit, -days, endOfDay).startOf('day') : startOfDay;
    const endDate = isPast ? endOfDay : dateUtil.offset(unit, days, startOfDay).endOf('day');
    return [startDate, endDate];
  };

  const generateRelativeDateFromCurrentDateRange = (
    relativeMode: 'current' | 'next' | 'last',
    unit: 'week' | 'month' | 'year'
  ): [Dayjs, Dayjs] => {
    dayjs.locale(dayjs.locale(), { weekStart: 1 });
    let cursorDate;
    switch (relativeMode) {
      case 'current':
        cursorDate = dateUtil.date();
        break;
      case 'next':
        cursorDate = dateUtil.date().add(1, unit);
        break;
      case 'last':
        cursorDate = dateUtil.date().subtract(1, unit);
        break;
      default:
        cursorDate = dateUtil.date();
    }
    return [cursorDate.startOf(unit).startOf('day'), cursorDate.endOf(unit).endOf('day')];
  };

  const determineDateRangeForDateRange = (): [Dayjs, Dayjs] => {
    if (!exactDate) {
      throw new Error('Start date must be entered for date range');
    }
    const exactDateEnd = filterValueByDate.exactDateEnd;
    if (!exactDateEnd) {
      throw new Error('End date must be entered for date range');
    }
    const startDate = dateUtil.date(exactDate);
    const endDate = dateUtil.date(exactDateEnd);
    if (startDate.isAfter(endDate)) {
      throw new Error('Start date cannot be after end date');
    }
    if (hasTimeFormat) {
      return [startDate, endDate];
    }
    return [startDate.startOf('day'), endDate.endOf('day')];
  };

  const operationMap: Record<string, () => [Dayjs, Dayjs]> = {
    today: () => computeDateRangeForFixedDays('date'),
    tomorrow: () => computeDateRangeForFixedDays('tomorrow'),
    yesterday: () => computeDateRangeForFixedDays('yesterday'),
    oneWeekAgo: () => computeDateRangeForFixedDays('lastWeek'),
    oneWeekFromNow: () => computeDateRangeForFixedDays('nextWeek'),
    oneMonthAgo: () => computeDateRangeForFixedDays('lastMonth'),
    oneMonthFromNow: () => computeDateRangeForFixedDays('nextMonth'),
    daysAgo: () => calculateDateRangeForOffsetDays(true),
    daysFromNow: () => calculateDateRangeForOffsetDays(false),
    exactDate: () => determineDateRangeForExactDate(),
    exactFormatDate: () => determineDateRangeForExactFormatDate(),
    dateRange: () => determineDateRangeForDateRange(),
    currentWeek: () => generateRelativeDateFromCurrentDateRange('current', 'week'),
    currentMonth: () => generateRelativeDateFromCurrentDateRange('current', 'month'),
    currentYear: () => generateRelativeDateFromCurrentDateRange('current', 'year'),
    lastWeek: () => generateRelativeDateFromCurrentDateRange('last', 'week'),
    lastMonth: () => generateRelativeDateFromCurrentDateRange('last', 'month'),
    lastYear: () => generateRelativeDateFromCurrentDateRange('last', 'year'),
    nextWeekPeriod: () => generateRelativeDateFromCurrentDateRange('next', 'week'),
    nextMonthPeriod: () => generateRelativeDateFromCurrentDateRange('next', 'month'),
    nextYearPeriod: () => generateRelativeDateFromCurrentDateRange('next', 'year'),
    pastWeek: () => generateOffsetDateRange(true, 'week', 1),
    pastMonth: () => generateOffsetDateRange(true, 'month', 1),
    pastYear: () => generateOffsetDateRange(true, 'year', 1),
    nextWeek: () => generateOffsetDateRange(false, 'week', 1),
    nextMonth: () => generateOffsetDateRange(false, 'month', 1),
    nextYear: () => generateOffsetDateRange(false, 'year', 1),
    pastNumberOfDays: () => generateOffsetDateRange(true, 'day', numberOfDays),
    nextNumberOfDays: () => generateOffsetDateRange(false, 'day', numberOfDays),
  };

  const resolver = operationMap[mode];
  if (!resolver) {
    throw new Error(`Unsupported date filter mode: ${mode}`);
  }

  const [startDate, endDate] = resolver();
  return [startDate.toISOString(), endDate.toISOString()];
};

const parseCellTimestamp = (fieldValue: unknown): number | null => {
  if (fieldValue == null || fieldValue === '') {
    return null;
  }
  const t = new Date(fieldValue as string).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * 日期字段筛选：与 nestjs-backend datetime-cell-value-filter 语义对齐（BETWEEN 日界 / 比较 range 端点）
 * @returns null 表示非日期筛选值，交由通用逻辑处理
 */
const evaluateDateFilterItem = (
  record: IRecord,
  item: IFilterItem,
  field: IJbsReferenceQueryField
): boolean | null => {
  if (!isDateFilterValue(item.value)) {
    return null;
  }

  const cellTs = parseCellTimestamp(record.fields[item.fieldId]);
  const dateOptions = resolveDateFieldOptionsForFilter(field.options, item.value);

  let range: [number, number];
  try {
    const [startIso, endIso] = resolveJbsDateFilterRange(dateOptions, item.value);
    range = [new Date(startIso).getTime(), new Date(endIso).getTime()];
    if (Number.isNaN(range[0]) || Number.isNaN(range[1])) {
      return true;
    }
  } catch {
    // 筛选配置不完整时跳过该条件，避免整表被误过滤
    return true;
  }

  const [start, end] = range;
  const { operator } = item;

  // 空单元格：isNot 与后端一致视为匹配（NOT BETWEEN OR NULL）
  if (cellTs == null) {
    if (operator === isNot.value) {
      return true;
    }
    if (operator === isEmpty.value) {
      return true;
    }
    if (operator === isNotEmpty.value) {
      return false;
    }
    return false;
  }

  switch (operator) {
    case is.value:
    case isWithIn.value:
      return cellTs >= start && cellTs <= end;
    case isNot.value:
      return cellTs < start || cellTs > end;
    // 晚于 / 早于：UI 使用 isAfter / isBefore（后端映射为 isGreater / isLess）
    case isGreater.value:
    case isAfter.value:
      return cellTs > end;
    case isGreaterEqual.value:
    case isOnOrAfter.value:
      return cellTs >= start;
    case isLess.value:
    case isBefore.value:
      return cellTs < start;
    case isLessEqual.value:
    case isOnOrBefore.value:
      return cellTs <= end;
    case isEmpty.value:
      return false;
    case isNotEmpty.value:
      return true;
    default:
      // 日期字段未知运算符不放行，避免误显示全量数据
      return false;
  }
};

const evaluateFilterItem = (
  record: IRecord,
  item: IFilterItem,
  fieldMap: Record<string, IJbsReferenceQueryField>
): boolean => {
  const field = fieldMap[item.fieldId];
  if (!field) return true;
  if (isFieldReferenceValue(item.value)) {
    // 引用表暂不支持字段间比较筛选
    return true;
  }

  const cellKey = getCellCompareKey(field, record, item.fieldId);
  const cellStr = field.cellValue2String(record.fields[item.fieldId]) ?? '';
  const { operator, value } = item;

  const dateResult = evaluateDateFilterItem(record, item, field);
  if (dateResult != null) {
    return dateResult;
  }

  switch (operator) {
    case isEmpty.value:
      return cellKey == null || cellStr === '';
    case isNotEmpty.value:
      return cellKey != null && cellStr !== '';
    case is.value:
      return String(cellKey ?? '') === String(value ?? '');
    case isNot.value:
      return String(cellKey ?? '') !== String(value ?? '');
    case contains.value:
      return cellStr.toLowerCase().includes(String(value ?? '').toLowerCase());
    case doesNotContain.value:
      return !cellStr.toLowerCase().includes(String(value ?? '').toLowerCase());
    case isGreater.value:
    case isAfter.value:
      return compareScalar(cellKey, value) > 0;
    case isGreaterEqual.value:
    case isOnOrAfter.value:
      return compareScalar(cellKey, value) >= 0;
    case isLess.value:
    case isBefore.value:
      return compareScalar(cellKey, value) < 0;
    case isLessEqual.value:
    case isOnOrBefore.value:
      return compareScalar(cellKey, value) <= 0;
    case isAnyOf.value:
    case hasAnyOf.value:
      return matchAnyOf(cellStr, value);
    case isNoneOf.value:
    case hasNoneOf.value:
      return !matchAnyOf(cellStr, value);
    case hasAllOf.value:
      return matchAllOf(cellStr, value);
    case isExactly.value:
      return cellStr === String(value ?? '');
    case isNotExactly.value:
      return cellStr !== String(value ?? '');
    default:
      return true;
  }
};

const compareScalar = (left: unknown, right: unknown): number => {
  const ln = Number(left);
  const rn = Number(right);
  if (!Number.isNaN(ln) && !Number.isNaN(rn)) {
    return ln - rn;
  }
  return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
};

const matchAnyOf = (cellStr: string, value: unknown): boolean => {
  const list = Array.isArray(value) ? value : [value];
  return list.some(
    (v) => cellStr === String(v ?? '') || cellStr.split(', ').includes(String(v ?? ''))
  );
};

const matchAllOf = (cellStr: string, value: unknown): boolean => {
  const list = Array.isArray(value) ? value : [value];
  const parts = cellStr.split(', ').filter(Boolean);
  return list.every((v) => cellStr === String(v ?? '') || parts.includes(String(v ?? '')));
};

const evaluateFilterNode = (
  record: IRecord,
  node: IFilterSet,
  fieldMap: Record<string, IJbsReferenceQueryField>
): boolean => {
  const results = node.filterSet.map((entry) => {
    if ('filterSet' in entry) {
      return evaluateFilterNode(record, entry, fieldMap);
    }
    return evaluateFilterItem(record, entry as IFilterItem, fieldMap);
  });
  return node.conjunction === or.value ? results.some(Boolean) : results.every(Boolean);
};

const evaluateFilter = (
  record: IRecord,
  filter: IFilter | undefined,
  fieldMap: Record<string, IJbsReferenceQueryField>
): boolean => {
  if (!filter?.filterSet?.length) return true;
  return evaluateFilterNode(record, filter as IFilterSet, fieldMap);
};

const applySearch = (
  records: IRecord[],
  search: IGetRecordsRo['search'],
  fieldMap: Record<string, IJbsReferenceQueryField>,
  fieldIds: string[]
): { records: IRecord[]; searchHitIndex: { fieldId: string; recordId: string }[] } => {
  if (!search?.[0]) {
    return { records, searchHitIndex: [] };
  }
  const [keyword, fieldId = '', hideNotMatchRow] = search;
  const hideNonMatch = Boolean(hideNotMatchRow);
  const needle = keyword.toLowerCase();
  const searchHitIndex: { fieldId: string; recordId: string }[] = [];

  const targetFieldIds =
    fieldId && fieldId !== '' ? (fieldIds.includes(fieldId) ? [fieldId] : []) : fieldIds;

  const matched = records.filter((record) => {
    let hit = false;
    for (const fid of targetFieldIds) {
      const text = getCellSearchText(fieldMap[fid], record, fid);
      const hay = text.toLowerCase();
      if (hay.includes(needle)) {
        searchHitIndex.push({ fieldId: fid, recordId: record.id });
        hit = true;
      }
    }
    return !hideNonMatch || hit;
  });

  return { records: hideNonMatch ? matched : records, searchHitIndex };
};

const sortRecords = (
  records: IRecord[],
  orderBy: ISortItem[],
  groupBy: IGroup | undefined,
  fieldMap: Record<string, IJbsReferenceQueryField>
): IRecord[] => {
  const sortKeys: ISortItem[] = [...(groupBy ?? []), ...orderBy];
  if (!sortKeys.length) return records;

  return [...records].sort((a, b) => {
    for (const { fieldId, order } of sortKeys) {
      const field = fieldMap[fieldId];
      const va = field?.cellValue2String(a.fields[fieldId]) ?? '';
      const vb = field?.cellValue2String(b.fields[fieldId]) ?? '';
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      if (cmp !== 0) {
        return order === 'asc' ? cmp : -cmp;
      }
    }
    return 0;
  });
};

const getGroupIdsForRecord = (
  record: IRecord,
  groupBy: IGroupItem[],
  fieldMap: Record<string, IJbsReferenceQueryField>
): string[] => {
  const ids: string[] = [];
  const trail: (string | number | null)[] = [];
  for (const { fieldId } of groupBy) {
    const key = getCellCompareKey(fieldMap[fieldId], record, fieldId);
    trail.push(key);
    ids.push(String(string2Hash(`${fieldId}_${trail.join('_')}`)));
  }
  return ids;
};

const isRecordInCollapsedGroup = (
  record: IRecord,
  groupBy: IGroupItem[],
  fieldMap: Record<string, IJbsReferenceQueryField>,
  collapsedGroupIds: Set<string>
): boolean => {
  if (!collapsedGroupIds.size) return false;
  return getGroupIdsForRecord(record, groupBy, fieldMap).some((id) => collapsedGroupIds.has(id));
};

/** 按服务端 groupDbCollection2GroupPoints 规则，在内存行上生成分组点 */
const buildGroupPoints = (
  records: IRecord[],
  groupBy: IGroupItem[],
  fieldMap: Record<string, IJbsReferenceQueryField>,
  collapsedGroupIds?: string[]
): { groupPoints: IGroupPointsVo; allGroupHeaderRefs: IGroupHeaderRef[] } => {
  const groupPoints: NonNullable<IGroupPointsVo> = [];
  const allGroupHeaderRefs: IGroupHeaderRef[] = [];
  if (!groupBy?.length || !records.length) {
    return { groupPoints: null, allGroupHeaderRefs };
  }

  const collapsedSet = new Set(collapsedGroupIds ?? []);
  const fieldValues: unknown[] = [Symbol(), Symbol(), Symbol()];
  let collapsedDepth = Number.MAX_SAFE_INTEGER;
  let runCount = 0;

  const flushRow = () => {
    if (runCount > 0 && collapsedDepth === Number.MAX_SAFE_INTEGER) {
      groupPoints.push({ type: GroupPointType.Row, count: runCount });
    }
    runCount = 0;
  };

  const emitHeadersForRecord = (record: IRecord) => {
    for (let index = 0; index < groupBy.length; index++) {
      const { fieldId } = groupBy[index];
      const fieldValue = getCellCompareKey(fieldMap[fieldId], record, fieldId);
      if (fieldValues[index] === fieldValue) continue;

      if (index > collapsedDepth) break;

      collapsedDepth = Number.MAX_SAFE_INTEGER;

      const flagString = `${fieldId}_${[...fieldValues.slice(0, index), fieldValue].join('_')}`;
      const groupId = String(string2Hash(flagString));

      fieldValues[index] = fieldValue;
      for (let j = index + 1; j < fieldValues.length; j++) {
        fieldValues[j] = Symbol();
      }

      const isCollapsedInner = collapsedSet.has(groupId);
      allGroupHeaderRefs.push({ id: groupId, depth: index });
      groupPoints.push({
        id: groupId,
        type: GroupPointType.Header,
        depth: index,
        value: fieldMap[fieldId]?.cellValue2String(record.fields[fieldId]) ?? fieldValue,
        isCollapsed: isCollapsedInner,
      });

      if (isCollapsedInner) {
        collapsedDepth = index;
      }
    }
  };

  let lastPathKey: string | null = null;

  for (const record of records) {
    const pathKey = groupBy
      .map(({ fieldId }) => getCellCompareKey(fieldMap[fieldId], record, fieldId))
      .join('\0');

    if (pathKey !== lastPathKey) {
      flushRow();
      emitHeadersForRecord(record);
      lastPathKey = pathKey;
    }

    if (collapsedDepth === Number.MAX_SAFE_INTEGER) {
      runCount += 1;
    }
  }
  flushRow();

  return { groupPoints, allGroupHeaderRefs };
};

/**
 * 引用表：在内存中对主端拉取的全量记录应用视图筛选、排序、搜索、分组（与 Teable 服务端语义对齐）
 */
export const applyJbsReferenceQuery = (
  input: IJbsReferenceQueryInput
): IJbsReferenceQueryResult => {
  const { records, fields, view, query } = input;
  const fieldMap = getFieldMap(fields);
  const fieldIds = fields.map((f) => f.id);

  const ignoreViewQuery = query?.ignoreViewQuery ?? false;
  const viewFilterStr =
    !ignoreViewQuery && view?.filter != null ? JSON.stringify(view.filter) : null;
  const viewSortStr = !ignoreViewQuery && view?.sort != null ? JSON.stringify(view.sort) : null;

  const mergedFilter = mergeWithDefaultFilter(viewFilterStr, query?.filter);
  const orderBy = mergeWithDefaultSort(viewSortStr, query?.orderBy);
  const groupBy = parseGroup(
    query?.groupBy ?? (!ignoreViewQuery ? view?.group ?? undefined : undefined)
  );

  let list = records.filter((r) => evaluateFilter(r, mergedFilter, fieldMap));

  const { records: searched, searchHitIndex } = applySearch(
    list,
    query?.search,
    fieldMap,
    fieldIds
  );
  list = searched;

  list = sortRecords(list, orderBy, groupBy, fieldMap);

  const collapsedSet = new Set(query?.collapsedGroupIds ?? []);
  const visibleRecords =
    groupBy?.length && collapsedSet.size
      ? list.filter((r) => !isRecordInCollapsedGroup(r, groupBy, fieldMap, collapsedSet))
      : list;

  const { groupPoints, allGroupHeaderRefs } = buildGroupPoints(
    list,
    groupBy ?? [],
    fieldMap,
    query?.collapsedGroupIds
  );

  const skip = query?.skip ?? 0;
  const take = query?.take;
  const paged = take != null ? visibleRecords.slice(skip, skip + take) : visibleRecords.slice(skip);

  return {
    records: paged,
    rowCount: visibleRecords.length,
    groupPoints,
    allGroupHeaderRefs,
    searchHitIndex: searchHitIndex.length ? searchHitIndex : undefined,
  };
};
