import type {
  AttachmentField,
  DateField,
  MultipleSelectField,
  Record,
  LinkField,
  SingleLineTextField,
  SingleSelectField,
  UserField,
  NumberField,
  CreatedByField,
  LastModifiedByField,
} from '../../../model';

export interface IWrapperEditorProps {
  field:
    | SingleSelectField
    | MultipleSelectField
    | AttachmentField
    | DateField
    | LinkField
    | UserField
    | CreatedByField
    | LastModifiedByField
    | NumberField
    | SingleLineTextField;
  record: Record;
  style?: React.CSSProperties;
  onCancel?: () => void;
}
