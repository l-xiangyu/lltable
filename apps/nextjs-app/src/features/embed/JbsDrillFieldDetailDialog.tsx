import { useJbsReferenceRecords } from '@teable/sdk/context';
import { Dialog, DialogContent, cn } from '@teable/ui-lib';
import { useMemo } from 'react';
import { pickVisibleDrillColumns } from './build-drill-query-from-main-row';
import { getRowValue } from './map-preview-row-utils';
import { useJbsDrillTablePreview } from './use-jbs-drill-table-preview';

const isSameDisplayValue = (a: unknown, b: string): boolean =>
  String(a ?? '')
    .trim()
    .toLowerCase() === b.trim().toLowerCase();

type IJbsDrillFieldDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relatedKeyId: string;
  sourceFieldAlias: string;
  sourceFieldId?: string;
  mainRow?: Record<string, unknown>;
  recordId?: string;
  displayValue?: string;
};

/** 下钻数据详情（只读）：按主表行参数字段过滤，展示全部关联行 */
export const JbsDrillFieldDetailDialog = ({
  open,
  onOpenChange,
  relatedKeyId,
  sourceFieldAlias,
  sourceFieldId,
  mainRow: mainRowProp,
  recordId,
  displayValue = '',
}: IJbsDrillFieldDetailDialogProps) => {
  const jbsReference = useJbsReferenceRecords();

  const mainRow = useMemo(() => {
    if (mainRowProp && Object.keys(mainRowProp).length > 0) {
      return mainRowProp;
    }
    if (recordId) {
      return jbsReference.getRecordRawRow?.(recordId);
    }
    return undefined;
  }, [mainRowProp, recordId, jbsReference.getRecordRawRow]);

  const { rows, columns, loading } = useJbsDrillTablePreview({
    relatedKeyId,
    sourceFieldId,
    mainRow,
    mode: 'detail',
    enabled: open && Boolean(relatedKeyId?.trim()),
  });

  const visibleColumns = useMemo(() => pickVisibleDrillColumns(columns), [columns]);

  const displayColumns = useMemo(() => {
    const preferred = visibleColumns.filter(
      (col) => col.fieldName === sourceFieldAlias || col.title === sourceFieldAlias
    );
    const rest = visibleColumns.filter((col) => !preferred.includes(col));
    return [...preferred, ...rest];
  }, [visibleColumns, sourceFieldAlias]);

  const renderBody = () => {
    if (loading) {
      return <div className="p-4 text-sm text-muted-foreground">加载中…</div>;
    }
    if (!rows.length) {
      return <div className="p-4 text-sm text-muted-foreground">未找到关联下钻数据</div>;
    }

    return (
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {displayColumns.map((col) => (
              <th key={col.fieldName} className="px-3 py-2 text-left font-medium">
                {col.title || col.fieldName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const highlighted =
              displayValue.trim() &&
              isSameDisplayValue(getRowValue(row, sourceFieldAlias), displayValue);
            return (
              <tr
                key={rowIndex}
                className={cn('border-t', highlighted && 'bg-primary/10 font-medium text-primary')}
              >
                {displayColumns.map((col) => (
                  <td key={col.fieldName} className="break-words px-3 py-2 align-top">
                    {String(getRowValue(row, col.fieldName) ?? '') || '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-w-4xl flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-medium">
          下钻数据详情
          {!loading && rows.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              共 {rows.length} 条
            </span>
          ) : null}
        </div>
        <div className="max-h-[70vh] overflow-auto rounded-md border">{renderBody()}</div>
      </DialogContent>
    </Dialog>
  );
};
