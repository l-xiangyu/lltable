import { useMutation } from '@tanstack/react-query';
import { RefreshCcw } from '@teable/icons';
import { autoFillCell } from '@teable/openapi';
import {
  Record,
  TaskStatusCollectionContext,
  useFields,
  useTableId,
  useTableListener,
  useTablePermission,
} from '@teable/sdk';
import type { IActiveCell, IGridRef, IRecordIndexMap } from '@teable/sdk';
import { Button } from '@teable/ui-lib';
import React, {
  useCallback,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useContext,
  useState,
} from 'react';

type SyncPendingCell = { recordId: string; fieldId: string };

interface IAIButtonProps {
  gridRef: React.RefObject<IGridRef>;
  activeCell?: IActiveCell;
  recordMap: IRecordIndexMap;
  onGenerate?: () => void;
  /** Add cell to sync-pending set (show star in that cell) */
  addSyncPendingCell?: (cell: SyncPendingCell) => void;
  /** Remove cell from sync-pending set; call on success/error for that cell */
  removeSyncPendingCell?: (cell: SyncPendingCell) => void;
  /** Current set of cells in sync loading (for button disabled state) */
  syncPendingCells?: SyncPendingCell[];
  /** Called when sync auto-fill succeeds so grid can refresh and show LLM result */
  onSyncSuccess?: (recordId?: string, fieldId?: string) => void;
  /** When API returns value (sync mode), call with the filled value for optimistic display */
  onAutoFillValue?: (recordId: string, fieldId: string, value: string) => void;
}

export const AiGenerateButton = forwardRef<{ onScrollHandler: () => void }, IAIButtonProps>(
  (props, ref) => {
    const {
      gridRef,
      activeCell,
      recordMap,
      addSyncPendingCell,
      removeSyncPendingCell,
      syncPendingCells = [],
      onSyncSuccess,
      onAutoFillValue,
    } = props;
    const tableId = useTableId() as string;
    const fields = useFields();
    const permission = useTablePermission();
    const taskStatusCollection = useContext(TaskStatusCollectionContext);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [style, setStyle] = React.useState<React.CSSProperties | null>(null);

    const { mutate: mutateGenerate } = useMutation({
      mutationFn: ({ recordId, fieldId }: { recordId: string; fieldId: string }) =>
        autoFillCell(tableId, recordId, fieldId),
      onSuccess: (data, variables) => {
        // For sync mode we always treat a successful response as
        // “this cell is done”, regardless of taskId shape.
        const cell = { recordId: variables.recordId, fieldId: variables.fieldId };
        removeSyncPendingCell?.(cell);
        if (data?.data?.value != null) {
          onAutoFillValue?.(variables.recordId, variables.fieldId, data.data.value);
        }
        onSyncSuccess?.(variables.recordId, variables.fieldId);
      },
      onError: (_err, variables) => {
        removeSyncPendingCell?.({ recordId: variables.recordId, fieldId: variables.fieldId });
      },
    });

    const handleTaskEvent = useCallback(
      (_actionKey: string, payload?: { recordId?: string; fieldId?: string }) => {
        if (payload?.recordId && payload?.fieldId) {
          removeSyncPendingCell?.({ recordId: payload.recordId, fieldId: payload.fieldId });
        }
      },
      [removeSyncPendingCell]
    );

    useTableListener(
      tableId,
      ['taskProcessing', 'taskCompleted', 'taskCancelled', 'taskFailed'],
      handleTaskEvent
    );

    // Check if cell is currently being processed by task queue (showing star animation)
    const isCellInTaskQueue = (cell?: IActiveCell) => {
      if (!cell || !taskStatusCollection?.cells) return false;
      return taskStatusCollection.cells.some(
        (c) => c.recordId === cell.recordId && c.fieldId === cell.fieldId
      );
    };

    const isLocalPending =
      activeCell &&
      syncPendingCells.some(
        (c) => c.recordId === activeCell.recordId && c.fieldId === activeCell.fieldId
      );

    useImperativeHandle(ref, () => ({
      onScrollHandler: () => {
        setStyle(null);

        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }

        scrollTimeoutRef.current = setTimeout(() => {
          onPositionChanged();
        }, 200);
      },
    }));

    const record = activeCell?.rowIndex ? recordMap[activeCell.rowIndex] : undefined;

    const onPositionChanged = useCallback(() => {
      if (!activeCell || !permission['record|update']) {
        return setStyle(null);
      }

      const { fieldId, columnIndex, rowIndex } = activeCell;

      const field = fields.find((f) => f.id === fieldId);

      if (
        Record.isLocked(record?.permissions, fieldId) ||
        Record.isHidden(record?.permissions, fieldId)
      ) {
        return setStyle(null);
      }

      if (!field?.aiConfig?.type) {
        return setStyle(null);
      }

      const bounds = gridRef.current?.getCellBounds([columnIndex, rowIndex]);
      if (bounds) {
        const { x, y, width, height } = bounds;
        setStyle({
          left: x + width + 4,
          top: y + (height - 32) / 2,
        });
      }
    }, [activeCell, fields, gridRef, permission, record]);

    useEffect(() => {
      onPositionChanged();
    }, [activeCell, onPositionChanged]);

    useEffect(() => {
      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
      };
    }, []);

    const onGenerate = () => {
      if (!activeCell || isCellInTaskQueue(activeCell) || isLocalPending) return;

      props.onGenerate?.();

      const cell = { recordId: activeCell.recordId, fieldId: activeCell.fieldId };
      addSyncPendingCell?.(cell);
      // Fire the API call
      mutateGenerate({
        recordId: activeCell.recordId,
        fieldId: activeCell.fieldId,
      });
    };

    // Hide button when cell is in task queue (star animation is showing)
    if (!style || isCellInTaskQueue(activeCell)) return null;

    return (
      <div className="absolute z-50 rounded-lg border bg-background" style={style}>
        <Button variant="outline" size="sm" onClick={onGenerate} disabled={!!isLocalPending}>
          <RefreshCcw className={isLocalPending ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
    );
  }
);

AiGenerateButton.displayName = 'AiGenerateButton';
