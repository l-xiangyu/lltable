import type { IGroup } from '@teable/core';
import { StatisticsFunc } from '@teable/core';
import type { IGetRecordsRo } from '@teable/openapi';
import { getAggregation, getRecords, autoFillCell } from '@teable/openapi';
import type { GridView } from '@teable/sdk';
import { useTableId, useView, useViewId } from '@teable/sdk/hooks';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useTranslation } from 'next-i18next';
import React, { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { tableConfig } from '@/features/i18n/table.config';
import type { AiAutoFillMode } from '../../../../components/field-setting/dialog/AiAutoFillDialog';
import { AiAutoFillDialog } from '../../../../components/field-setting/dialog/AiAutoFillDialog';

type SyncPendingCell = { recordId: string; fieldId: string };

interface IAiAutoFillDialogContainerProps {
  group?: IGroup;
  personalViewCommonQuery?: IGetRecordsRo;
  addSyncPendingCell?: (cell: SyncPendingCell) => void;
  removeSyncPendingCell?: (cell: SyncPendingCell) => void;
  onSyncSuccess?: () => void;
}

export interface IAiAutoFillDialogContainerRef {
  open: (fieldId: string) => void;
}

export const AiAutoFillDialogContainer = forwardRef<
  IAiAutoFillDialogContainerRef,
  IAiAutoFillDialogContainerProps
>((props, ref) => {
  const {
    group,
    personalViewCommonQuery,
    addSyncPendingCell,
    removeSyncPendingCell,
    onSyncSuccess,
  } = props;
  const { t } = useTranslation(tableConfig.i18nNamespaces);
  const tableId = useTableId() as string;
  const activeViewId = useViewId();
  const view = useView(activeViewId) as GridView | undefined;

  const [autoFillFieldId, setAutoFillFieldId] = useState<string | undefined>();
  const [aiFieldStats, setAiFieldStats] = useState<{
    rowCount?: number;
    emptyCount?: number;
    filledCount?: number;
    isLoading: boolean;
  }>({ isLoading: false });

  const fetchFieldStats = useCallback(
    async (fieldId: string) => {
      if (!tableId) return;

      setAiFieldStats({ isLoading: true });
      try {
        // Build query based on personal view or regular view
        const query = personalViewCommonQuery
          ? {
              filter: personalViewCommonQuery.filter,
              ignoreViewQuery: true,
            }
          : view?.id
            ? { viewId: view.id }
            : {};

        const result = await getAggregation(tableId, {
          ...query,
          field: {
            [StatisticsFunc.Empty]: [fieldId],
            [StatisticsFunc.Filled]: [fieldId],
          },
        });

        const aggregations = result.data.aggregations;
        if (aggregations && aggregations.length > 0) {
          const parseValue = (value: string | number | null | undefined): number | undefined => {
            if (value == null) return undefined;
            return typeof value === 'string' ? parseInt(value, 10) : value;
          };

          const emptyAgg = aggregations.find(
            (agg) => agg.fieldId === fieldId && agg.total?.aggFunc === StatisticsFunc.Empty
          );
          const filledAgg = aggregations.find(
            (agg) => agg.fieldId === fieldId && agg.total?.aggFunc === StatisticsFunc.Filled
          );

          const emptyCount = parseValue(emptyAgg?.total?.value);
          const filledCount = parseValue(filledAgg?.total?.value);
          // Calculate rowCount from empty + filled
          const rowCount =
            emptyCount != null && filledCount != null ? emptyCount + filledCount : undefined;

          setAiFieldStats({
            rowCount,
            emptyCount,
            filledCount,
            isLoading: false,
          });
        } else {
          setAiFieldStats({ isLoading: false });
        }
      } catch (e) {
        console.error('Failed to fetch field stats', e);
        setAiFieldStats({ isLoading: false });
      }
    },
    [tableId, view?.id, personalViewCommonQuery]
  );

  const handleOpen = useCallback(
    (fieldId: string) => {
      setAutoFillFieldId(fieldId);
      fetchFieldStats(fieldId);
    },
    [fetchFieldStats]
  );

  useImperativeHandle(ref, () => ({
    open: handleOpen,
  }));

  const handleClose = useCallback(() => {
    setAutoFillFieldId(undefined);
    setAiFieldStats({ isLoading: false });
  }, []);

  const handleConfirm = useCallback(
    async (mode: AiAutoFillMode) => {
      if (!tableId || !view || !autoFillFieldId || mode === 'saveOnly') {
        handleClose();
        return;
      }

      const baseQuery = personalViewCommonQuery
        ? {
            filter: personalViewCommonQuery.filter,
            orderBy: personalViewCommonQuery.orderBy,
            groupBy: personalViewCommonQuery.groupBy,
            ignoreViewQuery: true,
          }
        : {
            viewId: view.id,
            groupBy: group,
          };

      try {
        // API allows max 1000 records per request
        const MAX_TAKE = 1000;
        const allRecords: Awaited<ReturnType<typeof getRecords>>['data']['records'] = [];
        let skip = 0;
        let hasMore = true;
        while (hasMore) {
          const { data } = await getRecords(tableId, {
            ...baseQuery,
            skip,
            take: MAX_TAKE,
          });
          const records = data?.records ?? [];
          allRecords.push(...records);
          hasMore = records.length >= MAX_TAKE;
          skip += MAX_TAKE;
        }

        const fieldId = autoFillFieldId;
        const toFill =
          mode === 'emptyOnly'
            ? allRecords.filter((r) => {
                const v = r.fields?.[fieldId];
                return v == null || (typeof v === 'string' && v.trim() === '');
              })
            : allRecords;

        if (toFill.length === 0) {
          handleClose();
          return;
        }

        toFill.forEach((r) => addSyncPendingCell?.({ recordId: r.id, fieldId }));

        await Promise.all(
          toFill.map(async (r) => {
            try {
              await autoFillCell(tableId, r.id, fieldId);
            } catch (e) {
              console.error('autoFillCell error', e);
            } finally {
              removeSyncPendingCell?.({ recordId: r.id, fieldId });
            }
          })
        );
        onSyncSuccess?.();
      } catch (e) {
        toast.error(t('table:field.aiConfig.autoFillConfirm.generateFailed'));
        console.error('Batch auto-fill error', e);
      } finally {
        handleClose();
      }
    },
    [
      tableId,
      view,
      autoFillFieldId,
      personalViewCommonQuery,
      group,
      addSyncPendingCell,
      removeSyncPendingCell,
      onSyncSuccess,
      handleClose,
      t,
    ]
  );

  return (
    <AiAutoFillDialog
      open={Boolean(autoFillFieldId)}
      title={t('table:field.aiConfig.autoFillFieldDialog.title')}
      rowCount={aiFieldStats.rowCount ?? 0}
      emptyCount={aiFieldStats.emptyCount}
      filledCount={aiFieldStats.filledCount}
      isLoadingStats={aiFieldStats.isLoading}
      cancelText={t('common:actions.cancel')}
      hideSaveOnly
      labels={{
        description: t('table:field.aiConfig.autoFillFieldDialog.description'),
        emptyOnly: t('table:field.aiConfig.autoFillConfirm.emptyOnlyMode'),
        emptyOnlyDesc: t('table:field.aiConfig.autoFillConfirm.emptyOnlyModeDesc'),
        all: t('table:field.aiConfig.autoFillConfirm.allMode'),
        allDesc: t('table:field.aiConfig.autoFillConfirm.allModeDesc'),
        saveOnly: t('table:field.aiConfig.autoFillConfirm.saveOnlyMode'),
        saveOnlyDesc: t('table:field.aiConfig.autoFillConfirm.saveOnlyModeDesc'),
        recommended: t('table:field.aiConfig.autoFillConfirm.recommended'),
        limitWarning: t('table:field.aiConfig.autoFillConfirm.limitWarning'),
      }}
      confirmLabels={{
        emptyOnly: t('table:field.aiConfig.autoFillConfirm.fillEmptyCells'),
        all: t('table:field.aiConfig.autoFillConfirm.generateAll'),
        saveOnly: t('table:field.aiConfig.autoFillConfirm.saveConfigOnly'),
      }}
      onClose={handleClose}
      onConfirm={handleConfirm}
    />
  );
});

AiAutoFillDialogContainer.displayName = 'AiAutoFillDialogContainer';
