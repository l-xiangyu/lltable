import type {
  IAttachmentCellValue,
  IButtonFieldCellValue,
  ICheckboxCellValue,
  IDateFieldOptions,
  ILinkCellValue,
  ILinkFieldOptions,
  ILongTextCellValue,
  IMultipleSelectCellValue,
  INumberCellValue,
  IRatingFieldOptions,
  ISelectFieldOptions,
  ISingleLineTextCellValue,
  ISingleLineTextFieldOptions,
  ISingleSelectCellValue,
  IUserCellValue,
  IUserFieldOptions,
} from '@teable/core';
import { FieldType } from '@teable/core';
import { temporaryPaste } from '@teable/openapi';
import { useCallback, useEffect, useRef } from 'react';
import { useJbsDrillField } from '../../context/jbs-drill-field';
import { useJbsReferenceRecords } from '../../context/jbs-reference/JbsReferenceRecordsContext';
import { useTableId } from '../../hooks';
import type { ButtonField } from '../../model/field/button.field';
import { transformSelectOptions } from '../cell-value';
import {
  AttachmentEditor,
  CheckboxEditor,
  DateEditor,
  NumberEditor,
  SelectEditor,
  TextEditor,
  RatingEditor,
  LongTextEditor,
  LinkEditor,
  UserEditor,
  ButtonEditor,
} from '../editor';
import type { IEditorRef } from '../editor/type';
import type { ICellValueEditor } from './type';

export const CellEditorMain = (props: Omit<ICellValueEditor, 'wrapClassName' | 'wrapStyle'>) => {
  const {
    field,
    recordId,
    cellValue,
    onChange,
    readonly,
    className,
    context,
    buttonClickStatusHook,
    record,
  } = props;
  const tableId = useTableId();
  const jbsDrillField = useJbsDrillField();
  const jbsReference = useJbsReferenceRecords();
  const { id: fieldId, type, options } = field;
  const editorRef = useRef<IEditorRef<unknown>>(null);

  useEffect(() => {
    editorRef?.current?.setValue?.(cellValue);
  }, [cellValue]);

  const onOptionAdd = useCallback(
    async (name: string) => {
      if (!tableId) return;

      await temporaryPaste(tableId, {
        content: name,
        projection: [fieldId],
        ranges: [
          [0, 0],
          [0, 0],
        ],
      });
    },
    [tableId, fieldId]
  );

  switch (type) {
    case FieldType.SingleLineText: {
      // 引用表下钻展示列：弹窗表单走选择器，不走文本框
      const drillMeta = jbsDrillField.getDrillFieldMeta(fieldId);
      if (
        jbsDrillField.enabled &&
        drillMeta &&
        jbsDrillField.renderDrillFieldRecordEditor &&
        record
      ) {
        return jbsDrillField.renderDrillFieldRecordEditor({
          field,
          record,
          drillMeta,
          cellValue,
          readonly,
          className,
        });
      }
      return (
        <TextEditor
          ref={editorRef}
          className={className}
          value={cellValue as ISingleLineTextCellValue}
          options={options as ISingleLineTextFieldOptions}
          onChange={onChange}
          readonly={readonly}
        />
      );
    }
    case FieldType.LongText: {
      return (
        <LongTextEditor
          ref={editorRef}
          className={className}
          value={cellValue as ILongTextCellValue}
          onChange={onChange}
          readonly={readonly}
        />
      );
    }
    case FieldType.Number: {
      return (
        <NumberEditor
          ref={editorRef}
          className={className}
          value={cellValue as INumberCellValue}
          onChange={onChange}
          readonly={readonly}
        />
      );
    }
    case FieldType.Rating: {
      return (
        <RatingEditor
          className={className}
          options={options as IRatingFieldOptions}
          value={cellValue as INumberCellValue}
          onChange={onChange}
          readonly={readonly}
        />
      );
    }
    case FieldType.SingleSelect: {
      const isJbsDictField = jbsReference.isReferenceTable && jbsReference.isDictField?.(fieldId);
      const dictOptions = isJbsDictField ? jbsReference.getDictSelectOptions?.(fieldId) : undefined;
      const selectOptions =
        (dictOptions?.length ?? 0) > 0
          ? dictOptions
          : transformSelectOptions((options as ISelectFieldOptions).choices);
      return (
        <SelectEditor
          ref={editorRef}
          className={className}
          value={cellValue as ISingleSelectCellValue}
          preventAutoNewOptions={
            isJbsDictField ? true : (options as ISelectFieldOptions).preventAutoNewOptions
          }
          options={selectOptions}
          onChange={onChange}
          readonly={readonly}
          onOptionAdd={isJbsDictField ? undefined : onOptionAdd}
        />
      );
    }
    case FieldType.MultipleSelect: {
      return (
        <SelectEditor
          ref={editorRef}
          className={className}
          value={cellValue as IMultipleSelectCellValue}
          options={transformSelectOptions((options as ISelectFieldOptions).choices)}
          onChange={onChange}
          isMultiple
          readonly={readonly}
          onOptionAdd={onOptionAdd}
        />
      );
    }
    case FieldType.Checkbox: {
      return (
        // Setting the checkbox size is affected by the font-size causing the height to change.
        <div style={{ fontSize: 0 }}>
          <CheckboxEditor
            className={className}
            value={cellValue as ICheckboxCellValue}
            onChange={onChange}
            readonly={readonly}
          />
        </div>
      );
    }
    case FieldType.Date: {
      return (
        <DateEditor
          ref={editorRef}
          className={className}
          options={options as IDateFieldOptions}
          value={cellValue as string}
          onChange={(selectedDay) => onChange?.(selectedDay ?? null)}
          readonly={readonly}
        />
      );
    }
    case FieldType.Attachment: {
      return (
        <AttachmentEditor
          key={`${field.id}-${recordId}`}
          className={className}
          tableId={tableId}
          recordId={recordId}
          fieldId={field.id}
          value={cellValue as IAttachmentCellValue}
          onChange={onChange}
          readonly={readonly}
          onDownload={props.onAttachmentDownload}
        />
      );
    }
    case FieldType.Link: {
      return (
        <LinkEditor
          className={className}
          cellValue={cellValue as ILinkCellValue | ILinkCellValue[]}
          options={options as ILinkFieldOptions}
          onChange={onChange}
          readonly={readonly}
          fieldId={field.id}
          recordId={recordId}
        />
      );
    }
    case FieldType.User:
    case FieldType.CreatedBy:
    case FieldType.LastModifiedBy: {
      return (
        <UserEditor
          className={className}
          value={cellValue as IUserCellValue | IUserCellValue[]}
          options={options as IUserFieldOptions}
          onChange={onChange}
          readonly={readonly}
          context={context}
        />
      );
    }
    case FieldType.Button: {
      return (
        <ButtonEditor
          field={field as ButtonField}
          recordId={recordId}
          className={className}
          value={cellValue as IButtonFieldCellValue}
          onChange={onChange}
          readonly={readonly}
          statusHook={buttonClickStatusHook}
          record={record}
        />
      );
    }
    default:
      throw new Error(`The field type (${type}) is not implemented editor`);
  }
};
