import type { IJbsDrillFieldEditorProps } from '@teable/sdk/context';
import { useJbsDrillField } from '@teable/sdk/context';
import { useFields } from '@teable/sdk/hooks';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useCallback, useMemo, useState } from 'react';
import { applyJbsDrillFieldSelection } from './apply-jbs-drill-field-selection';
import { JbsDrillPickerContent } from './JbsDrillPickerDialog';
import { useMainRowForDrill } from './use-main-row-for-drill';

/** 下钻字段 Grid 编辑器内容：选择下钻表行后写回主端参数字段 */
export const JbsDrillFieldEditor = (props: IJbsDrillFieldEditorProps) => {
  const { record, drillMeta, setEditing } = props;
  const jbsDrillField = useJbsDrillField();
  const allFields = useFields({ withHidden: true });
  const mainRow = useMainRowForDrill(record);
  const [saving, setSaving] = useState(false);

  const initialSelectedValue = useMemo(() => {
    const raw = record.getCellValue(props.field.id);
    if (raw == null) {
      return '';
    }
    return typeof raw === 'string' ? raw : String(raw);
  }, [record, props.field.id]);

  const handleConfirm = useCallback(
    async (selectedRow: Record<string, unknown>) => {
      setSaving(true);
      try {
        await applyJbsDrillFieldSelection({
          jbsDrillField,
          record,
          drillFieldId: props.field.id,
          selectedDrillRow: selectedRow,
          allFieldIds: allFields.map((f) => f.id),
          onClose: () => setEditing?.(false),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '保存下钻字段失败';
        toast.error(msg);
      } finally {
        setSaving(false);
      }
    },
    [jbsDrillField, props.field.id, record, allFields, setEditing]
  );

  return (
    <JbsDrillPickerContent
      relatedKeyId={drillMeta.relatedKeyId}
      sourceFieldAlias={drillMeta.sourceFieldAlias}
      sourceFieldId={drillMeta.sourceFieldId}
      mainRow={mainRow}
      initialSelectedValue={initialSelectedValue}
      saving={saving}
      onCancel={() => setEditing?.(false)}
      onConfirm={handleConfirm}
    />
  );
};
