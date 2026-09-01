import { useQuery } from '@tanstack/react-query';
import { useJbsReferenceRecords } from '@teable/sdk/context';
import { useMemo } from 'react';
import type { IPreviewColumn } from './build-create-table-from-preview';
import {
  buildDrillQueryCriteriaFromMainRow,
  filterDrillRowsByQueryCriteria,
} from './build-drill-query-from-main-row';
import {
  fetchJbsRelatedInfo,
  fetchLltableKeywordDetail,
  requestJbsAuth,
  type IJbsKeywordFieldItem,
  type IJbsRelationParamItem,
} from './jbs-main-api-client';
import {
  buildJbsReferenceTableMetaForCreate,
  buildKeywordDetailRequestPath,
} from './jbs-table-meta';
import { fetchReferenceTablePreview } from './reference-table-preview';

const DRILL_TABLE_PREVIEW_STALE_MS = 60_000;

export type IJbsDrillTablePreviewMode = 'detail' | 'picker';

export type IUseJbsDrillTablePreviewParams = {
  relatedKeyId: string;
  sourceFieldId?: string;
  mainRow?: Record<string, unknown>;
  /** detail：按主表下钻参数过滤；picker：展示全量便于改选 */
  mode?: IJbsDrillTablePreviewMode;
  enabled?: boolean;
};

export type IUseJbsDrillTablePreviewResult = {
  rows: Record<string, unknown>[];
  columns: IPreviewColumn[];
  loading: boolean;
  relationParams: IJbsRelationParamItem[];
  drillFieldList?: IJbsKeywordFieldItem[];
};

/** 拉取下钻表数据；详情模式按主表行过滤，编辑选择器展示全量 */
export const useJbsDrillTablePreview = (
  params: IUseJbsDrillTablePreviewParams
): IUseJbsDrillTablePreviewResult => {
  const { relatedKeyId, sourceFieldId, mainRow, mode = 'detail', enabled = true } = params;
  const jbsReference = useJbsReferenceRecords();
  const mainRowKey = useMemo(() => JSON.stringify(mainRow ?? {}), [mainRow]);

  const { data, isLoading } = useQuery({
    queryKey: [
      'jbs',
      'drill-table-filtered',
      relatedKeyId,
      sourceFieldId,
      mainRowKey,
      mode,
      jbsReference.mainKeywordFieldList?.length,
    ],
    queryFn: async () => {
      await requestJbsAuth();
      const drillMeta = buildJbsReferenceTableMetaForCreate(relatedKeyId);
      const [relationParams, preview, drillKeyword] = await Promise.all([
        sourceFieldId ? fetchJbsRelatedInfo(sourceFieldId, relatedKeyId) : Promise.resolve([]),
        fetchReferenceTablePreview(drillMeta, ''),
        fetchLltableKeywordDetail(buildKeywordDetailRequestPath(drillMeta)),
      ]);

      const rows =
        mode === 'picker'
          ? preview.rows
          : filterDrillRowsByQueryCriteria(
              preview.rows,
              buildDrillQueryCriteriaFromMainRow({
                relationParams,
                mainRow: mainRow ?? {},
                mainFieldList: jbsReference.mainKeywordFieldList,
                drillFieldList: drillKeyword.fieldList,
              })
            );

      return {
        rows,
        columns: preview.columns,
        relationParams,
        drillFieldList: drillKeyword.fieldList,
      };
    },
    enabled: enabled && Boolean(relatedKeyId?.trim()),
    staleTime: DRILL_TABLE_PREVIEW_STALE_MS,
  });

  return {
    rows: data?.rows ?? [],
    columns: data?.columns ?? [],
    loading: isLoading,
    relationParams: data?.relationParams ?? [],
    drillFieldList: data?.drillFieldList,
  };
};
