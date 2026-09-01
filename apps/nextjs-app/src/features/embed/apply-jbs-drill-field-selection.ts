import type { IJbsDrillFieldContextValue } from '@teable/sdk/context';
import type { Record } from '@teable/sdk/model';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

/** 收集当前行全部字段值（fieldId -> value） */
const collectRecordFields = (record: Record, fieldIds: string[]): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  for (const fieldId of fieldIds) {
    fields[fieldId] = record.getCellValue(fieldId);
  }
  return fields;
};

/**
 * 下钻选择确认：已有行走主端保存，新建行（record.id 为空）仅本地 updateCell
 */
export const applyJbsDrillFieldSelection = async (params: {
  jbsDrillField: IJbsDrillFieldContextValue;
  record: Record;
  drillFieldId: string;
  selectedDrillRow: Record<string, unknown>;
  allFieldIds: string[];
  onClose?: () => void;
}): Promise<void> => {
  const { jbsDrillField, record, drillFieldId, selectedDrillRow, allFieldIds, onClose } = params;
  if (!jbsDrillField.saveDrillFieldSelection) {
    toast.error('下钻保存未就绪');
    return;
  }

  const result = await jbsDrillField.saveDrillFieldSelection({
    recordId: record.id,
    drillFieldId,
    selectedDrillRow,
    recordFields: collectRecordFields(record, allFieldIds),
  });

  if (result.mode === 'local') {
    for (const [fieldId, value] of Object.entries(result.fieldUpdates)) {
      await record.updateCell(fieldId, value);
    }
  }

  onClose?.();
};
