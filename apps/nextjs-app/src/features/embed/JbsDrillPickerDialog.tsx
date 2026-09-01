/* eslint-disable jsx-a11y/no-static-element-interactions */
import { Check } from '@teable/icons';
import { useJbsReferenceRecords } from '@teable/sdk/context';
import { Button, cn, Input } from '@teable/ui-lib';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  findAssociatedDrillRowIndices,
  findMarkedDrillRowIndicesByDrillRow,
  findSelectedDrillRowIndex,
  pickVisibleDrillColumns,
} from './build-drill-query-from-main-row';
import { getRowValue } from './map-preview-row-utils';
import { useJbsDrillTablePreview } from './use-jbs-drill-table-preview';

type IJbsDrillPickerContentProps = {
  relatedKeyId: string;
  sourceFieldAlias: string;
  sourceFieldId?: string;
  mainRow?: Record<string, unknown>;
  initialSelectedValue?: string | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (selectedRow: Record<string, unknown>) => void | Promise<void>;
};

/** 下钻指标选择内容（外层 Dialog 由 GridJbsDrillFieldEditor 提供） */
export const JbsDrillPickerContent = ({
  relatedKeyId,
  sourceFieldAlias,
  sourceFieldId,
  mainRow,
  initialSelectedValue,
  saving = false,
  onCancel,
  onConfirm,
}: IJbsDrillPickerContentProps) => {
  const jbsReference = useJbsReferenceRecords();
  const [search, setSearch] = useState('');
  const [activeOriginalIndex, setActiveOriginalIndex] = useState<number | null>(null);
  const [markedOriginalIndices, setMarkedOriginalIndices] = useState<Set<number>>(() => new Set());
  const scrollTargetRef = useRef<HTMLTableRowElement>(null);
  const initializedSessionKeyRef = useRef<string | null>(null);

  const mainRowKey = useMemo(() => JSON.stringify(mainRow ?? {}), [mainRow]);
  const sessionKey = `${relatedKeyId}|${mainRowKey}|${initialSelectedValue ?? ''}`;

  const { rows, columns, loading, relationParams, drillFieldList } = useJbsDrillTablePreview({
    relatedKeyId,
    sourceFieldId,
    mainRow,
    mode: 'picker',
    enabled: Boolean(relatedKeyId?.trim()),
  });

  const visibleColumns = useMemo(() => pickVisibleDrillColumns(columns), [columns]);

  const applyMarkingByPivotRow = (pivotRow: Record<string, unknown>, activeIndex: number) => {
    const marked = findMarkedDrillRowIndicesByDrillRow({
      rows,
      pivotRow,
      relationParams,
      drillFieldList,
    });
    setMarkedOriginalIndices(new Set(marked));
    setActiveOriginalIndex(activeIndex);
  };

  useEffect(() => {
    initializedSessionKeyRef.current = null;
    setActiveOriginalIndex(null);
    setMarkedOriginalIndices(new Set());
    setSearch('');
  }, [sessionKey]);

  useEffect(() => {
    if (!rows.length || loading || initializedSessionKeyRef.current === sessionKey) {
      return;
    }

    let pivotIndex = findSelectedDrillRowIndex({
      rows,
      columns: visibleColumns,
      sourceFieldAlias,
      displayValue: initialSelectedValue,
      mainRow,
      relationParams,
      mainFieldList: jbsReference.mainKeywordFieldList,
      drillFieldList,
    });

    if (pivotIndex < 0 && mainRow && relationParams?.length) {
      const associated = findAssociatedDrillRowIndices({
        rows,
        mainRow,
        relationParams,
        mainFieldList: jbsReference.mainKeywordFieldList,
        drillFieldList,
      });
      pivotIndex = associated[0] ?? -1;
    }

    if (pivotIndex >= 0) {
      applyMarkingByPivotRow(rows[pivotIndex], pivotIndex);
    }

    initializedSessionKeyRef.current = sessionKey;
  }, [
    rows,
    loading,
    sessionKey,
    initialSelectedValue,
    sourceFieldAlias,
    mainRow,
    relationParams,
    drillFieldList,
    jbsReference.mainKeywordFieldList,
    visibleColumns,
  ]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return rows;
    }
    return rows.filter((row) =>
      visibleColumns.some((col) =>
        String(getRowValue(row, col.fieldName) ?? '')
          .toLowerCase()
          .includes(keyword)
      )
    );
  }, [rows, search, visibleColumns]);

  const activeFilteredIndex = useMemo(() => {
    if (activeOriginalIndex == null) {
      return null;
    }
    const activeRow = rows[activeOriginalIndex];
    if (!activeRow) {
      return null;
    }
    const idx = filteredRows.indexOf(activeRow);
    return idx >= 0 ? idx : null;
  }, [activeOriginalIndex, rows, filteredRows]);

  useEffect(() => {
    if (loading || markedOriginalIndices.size === 0) {
      return;
    }
    scrollTargetRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [loading, markedOriginalIndices, activeFilteredIndex, filteredRows.length]);

  const displayColumns = useMemo(() => {
    const preferred = visibleColumns.filter(
      (col) => col.fieldName === sourceFieldAlias || col.title === sourceFieldAlias
    );
    const rest = visibleColumns.filter((col) => !preferred.includes(col));
    return [...preferred, ...rest].slice(0, 6);
  }, [visibleColumns, sourceFieldAlias]);

  const submitSelection = async (index: number) => {
    const row = filteredRows[index];
    if (!row || saving) {
      return;
    }
    await onConfirm(row);
  };

  const handleRowSelect = (indexInFiltered: number) => {
    const row = filteredRows[indexInFiltered];
    const originalIndex = rows.indexOf(row);
    if (originalIndex < 0) {
      return;
    }
    applyMarkingByPivotRow(row, originalIndex);
  };

  const handleConfirm = () => {
    if (activeFilteredIndex == null) {
      return;
    }
    void submitSelection(activeFilteredIndex);
  };

  const scrollAnchorOriginalIndex = useMemo(() => {
    if (activeOriginalIndex != null && markedOriginalIndices.has(activeOriginalIndex)) {
      return activeOriginalIndex;
    }
    return [...markedOriginalIndices][0] ?? activeOriginalIndex;
  }, [markedOriginalIndices, activeOriginalIndex]);

  return (
    <div
      className="flex max-h-[80vh] flex-col gap-3"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="text-lg font-medium">选择下钻记录</div>
      <Input
        placeholder="搜索"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
        disabled={saving}
      />
      <div className="min-h-[320px] flex-1 overflow-auto rounded-md border">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">加载中…</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">暂无下钻数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr>
                <th className="w-12 p-2 text-center text-xs font-medium text-muted-foreground">
                  选中
                </th>
                {displayColumns.map((col) => (
                  <th key={col.fieldName} className="px-3 py-2 text-left font-medium">
                    {col.title || col.fieldName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => {
                const originalIndex = rows.indexOf(row);
                const isMarked = originalIndex >= 0 && markedOriginalIndices.has(originalIndex);
                const isActive = activeFilteredIndex === index;
                const isScrollAnchor = originalIndex === scrollAnchorOriginalIndex;

                return (
                  <tr
                    key={index}
                    ref={isScrollAnchor ? scrollTargetRef : undefined}
                    className={cn(
                      'cursor-pointer border-t transition-colors hover:bg-muted/50',
                      isMarked && 'bg-primary/10 hover:bg-primary/15',
                      isActive && 'ring-1 ring-inset ring-primary'
                    )}
                    onClick={() => handleRowSelect(index)}
                    onDoubleClick={() => void submitSelection(index)}
                  >
                    <td className="p-2 text-center">
                      <span
                        className={cn(
                          'inline-flex size-5 items-center justify-center rounded-full border transition-colors',
                          isMarked
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-muted-foreground/35 bg-background'
                        )}
                        aria-hidden
                      >
                        {isMarked ? <Check className="size-3.5 stroke-[3]" /> : null}
                      </span>
                    </td>
                    {displayColumns.map((col) => (
                      <td
                        key={col.fieldName}
                        className={cn(
                          'px-3 py-2',
                          isMarked &&
                            col.fieldName === sourceFieldAlias &&
                            'font-medium text-primary'
                        )}
                      >
                        {String(getRowValue(row, col.fieldName) ?? '')}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button onClick={handleConfirm} disabled={activeFilteredIndex == null || saving}>
          {saving ? '保存中…' : '确认'}
        </Button>
      </div>
    </div>
  );
};
