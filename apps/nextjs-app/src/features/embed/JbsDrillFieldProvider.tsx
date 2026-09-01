'use client';

import {
  JbsDrillFieldContext,
  JbsDrillFieldContextDefaultValue,
  type IJbsDrillFieldContextValue,
  type IJbsDrillFieldDetailParams,
  type IJbsDrillFieldEditorProps,
  type IJbsDrillFieldRecordEditorProps,
} from '@teable/sdk/context';
import { useFields, useTable } from '@teable/sdk/hooks';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { parseJbsTableMeta, type IJbsDrillFieldMeta } from './jbs-table-meta';
import { JbsDrillFieldDetailDialog } from './JbsDrillFieldDetailDialog';
import { JbsDrillFieldEditor } from './JbsDrillFieldEditor';
import { JbsDrillFieldRecordEditor } from './JbsDrillFieldRecordEditor';
import { isInLltableEmbed } from './lltable-parent-bridge';

type IJbsDrillFieldProviderProps = {
  children: ReactNode;
  saveDrillFieldSelection?: IJbsDrillFieldContextValue['saveDrillFieldSelection'];
};

/**
 * 玲珑表格 iframe 嵌入：下钻字段展示/编辑
 * - 展示值来自主端 preview
 * - 编辑时选择下钻表行，写回主端参数字段
 */
export const JbsDrillFieldProvider = ({
  children,
  saveDrillFieldSelection,
}: IJbsDrillFieldProviderProps) => {
  const embedActive = isInLltableEmbed();
  const table = useTable();
  const fields = useFields({ withHidden: true });
  const meta = useMemo(() => parseJbsTableMeta(table?.description ?? ''), [table?.description]);
  const [detailState, setDetailState] = useState<IJbsDrillFieldDetailParams | null>(null);

  const drillMetaByFieldId = useMemo(() => {
    const map = new Map<string, IJbsDrillFieldMeta>();
    if (!meta?.drillFields?.length) {
      return map;
    }
    for (const drill of meta.drillFields) {
      const field = fields.find((item) => item.name === drill.sourceFieldAlias);
      if (field) {
        map.set(field.id, drill);
      }
    }
    return map;
  }, [meta?.drillFields, fields]);

  const isDrillField = useCallback(
    (fieldId: string) => drillMetaByFieldId.has(fieldId),
    [drillMetaByFieldId]
  );

  const getDrillFieldMeta = useCallback(
    (fieldId: string) => {
      const drill = drillMetaByFieldId.get(fieldId);
      if (!drill) {
        return null;
      }
      return {
        sourceFieldAlias: drill.sourceFieldAlias,
        sourceFieldId: drill.sourceFieldId,
        relatedKeyId: drill.relatedKeyId,
        targetTableId: drill.targetTableId,
        targetViewId: drill.targetViewId,
      };
    },
    [drillMetaByFieldId]
  );

  const openDrillFieldDetail = useCallback((params: IJbsDrillFieldDetailParams) => {
    setDetailState(params);
  }, []);

  const contextValue = useMemo<IJbsDrillFieldContextValue>(() => {
    if (!embedActive || !meta?.drillFields?.length) {
      return JbsDrillFieldContextDefaultValue;
    }
    return {
      enabled: true,
      isDrillField,
      getDrillFieldMeta,
      renderDrillFieldEditor: (props: IJbsDrillFieldEditorProps) => (
        <JbsDrillFieldEditor {...props} />
      ),
      renderDrillFieldRecordEditor: (props: IJbsDrillFieldRecordEditorProps) => (
        <JbsDrillFieldRecordEditor {...props} />
      ),
      saveDrillFieldSelection,
      openDrillFieldDetail,
    };
  }, [
    embedActive,
    meta?.drillFields?.length,
    isDrillField,
    getDrillFieldMeta,
    saveDrillFieldSelection,
    openDrillFieldDetail,
  ]);

  return (
    <JbsDrillFieldContext.Provider value={contextValue}>
      {children}
      {detailState && (
        <JbsDrillFieldDetailDialog
          open
          onOpenChange={(open) => !open && setDetailState(null)}
          relatedKeyId={detailState.drillMeta.relatedKeyId}
          sourceFieldAlias={detailState.drillMeta.sourceFieldAlias}
          sourceFieldId={detailState.drillMeta.sourceFieldId}
          recordId={detailState.recordId}
          mainRow={detailState.mainRow}
          displayValue={detailState.displayValue}
        />
      )}
    </JbsDrillFieldContext.Provider>
  );
};
