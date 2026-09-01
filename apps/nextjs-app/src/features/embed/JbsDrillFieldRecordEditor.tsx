import { Pencil } from '@teable/icons';
import type { IJbsDrillFieldRecordEditorProps } from '@teable/sdk/context';
import { useJbsDrillField } from '@teable/sdk/context';
import { useFields } from '@teable/sdk/hooks';
import { cn, Dialog, DialogContent } from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useCallback, useState } from 'react';
import { applyJbsDrillFieldSelection } from './apply-jbs-drill-field-selection';
import { JbsDrillFieldDetailDialog } from './JbsDrillFieldDetailDialog';
import { JbsDrillPickerContent } from './JbsDrillPickerDialog';
import { useMainRowForDrill } from './use-main-row-for-drill';

/**
 * 添加记录 / 展开记录弹窗：下钻展示字段
 * - 点击展示值：打开只读详情弹窗
 * - 点击编辑按钮：打开下钻选择器
 */
export const JbsDrillFieldRecordEditor = (props: IJbsDrillFieldRecordEditorProps) => {
  const { field, record, drillMeta, cellValue, readonly, className } = props;
  const jbsDrillField = useJbsDrillField();
  const allFields = useFields({ withHidden: true });
  const mainRow = useMainRowForDrill(record);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const displayText = typeof cellValue === 'string' ? cellValue : '';

  const handleConfirm = useCallback(
    async (selectedRow: Record<string, unknown>) => {
      setSaving(true);
      try {
        await applyJbsDrillFieldSelection({
          jbsDrillField,
          record,
          drillFieldId: field.id,
          selectedDrillRow: selectedRow,
          allFieldIds: allFields.map((item) => item.id),
          onClose: () => setPickerOpen(false),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '保存下钻字段失败';
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [jbsDrillField, record, field.id, allFields]
  );

  const detailDialog = (
    <JbsDrillFieldDetailDialog
      open={detailOpen}
      onOpenChange={setDetailOpen}
      relatedKeyId={drillMeta.relatedKeyId}
      sourceFieldAlias={drillMeta.sourceFieldAlias}
      sourceFieldId={drillMeta.sourceFieldId}
      mainRow={mainRow}
      displayValue={displayText}
    />
  );

  if (readonly) {
    return (
      <div className={className}>
        <button
          type="button"
          className={cn(
            'min-w-0 truncate text-left text-sm',
            displayText ? 'text-primary hover:underline' : 'text-muted-foreground'
          )}
          onClick={() => displayText && setDetailOpen(true)}
        >
          {displayText || '—'}
        </button>
        {detailDialog}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm',
          className
        )}
      >
        <button
          type="button"
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            displayText ? 'hover:underline' : 'text-muted-foreground'
          )}
          onClick={() => (displayText ? setDetailOpen(true) : setPickerOpen(true))}
          title={displayText ? '查看详情' : '请选择'}
        >
          {displayText || '请选择'}
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setPickerOpen(true)}
          title="选择下钻记录"
        >
          <Pencil className="size-4" />
        </button>
      </div>
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent
          className="flex max-w-4xl flex-col"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <JbsDrillPickerContent
            relatedKeyId={drillMeta.relatedKeyId}
            sourceFieldAlias={drillMeta.sourceFieldAlias}
            sourceFieldId={drillMeta.sourceFieldId}
            mainRow={mainRow}
            initialSelectedValue={displayText}
            saving={saving}
            onCancel={() => setPickerOpen(false)}
            onConfirm={handleConfirm}
          />
        </DialogContent>
      </Dialog>
      {detailDialog}
    </>
  );
};
