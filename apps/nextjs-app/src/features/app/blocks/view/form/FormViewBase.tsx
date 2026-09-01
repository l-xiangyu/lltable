import { useMutation } from '@tanstack/react-query';
import { FieldKeyType } from '@teable/core';
import { formSubmit } from '@teable/openapi';
import { useJbsReferenceRecords } from '@teable/sdk/context';
import {
  useViewId,
  useTableId,
  useIsMobile,
  useTablePermission,
  useRecordOperations,
} from '@teable/sdk/hooks';
import { FormMode, useFormModeStore } from '../tool-bar/store';
import { FormEditor, FormPreviewer } from './components';
import { generateUniqLocalKey } from './util';

export const FormViewBase = () => {
  const tableId = useTableId();
  const activeViewId = useViewId();
  const { modeMap } = useFormModeStore();
  const isMobile = useIsMobile();
  const permission = useTablePermission();
  const jbsReference = useJbsReferenceRecords();
  const { createRecords } = useRecordOperations();

  const { mutateAsync: submitFormRecords } = useMutation({
    mutationFn: async (fields: Record<string, unknown>) => {
      if (!tableId || !activeViewId) {
        return;
      }
      // 引用表：走 useRecordOperations → 主端 executeEditScripts
      if (jbsReference.isReferenceTable && !jbsReference.readonly) {
        await createRecords({
          tableId,
          recordsRo: {
            fieldKeyType: FieldKeyType.Id,
            records: [{ fields }],
          },
        });
        return;
      }
      await formSubmit(tableId, {
        viewId: activeViewId,
        fields,
      });
    },
  });

  const modeKey = generateUniqLocalKey(tableId, activeViewId);
  const mode = modeMap[modeKey] ?? FormMode.Edit;
  const isEditMode = permission['view|update'] && mode === FormMode.Edit;

  const submitForm = async (fields: Record<string, unknown>) => {
    if (!tableId || !activeViewId) return;
    await submitFormRecords(fields);
  };

  return (
    <div className="flex size-full">
      {isEditMode && !isMobile ? <FormEditor /> : <FormPreviewer submit={submitForm} />}
    </div>
  );
};
