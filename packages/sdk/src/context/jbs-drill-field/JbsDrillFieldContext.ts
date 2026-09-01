import type { ForwardedRef, ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { IEditorProps } from '../../components/grid/components';
import type { IWrapperEditorProps } from '../../components/grid-enhancements/editor/type';
import type { IFieldInstance, Record as RecordModel } from '../../model';

/** 下钻字段元数据（由 embed 层注入） */
export type IJbsDrillFieldMetaView = {
  sourceFieldAlias: string;
  sourceFieldId?: string;
  relatedKeyId: string;
  targetTableId: string;
  targetViewId?: string;
};

export type IJbsDrillFieldEditorProps = IEditorProps &
  IWrapperEditorProps & {
    field: IFieldInstance;
    record: RecordModel;
    drillMeta: IJbsDrillFieldMetaView;
  };

/** 展开记录 / 添加记录弹窗中的下钻字段编辑器 */
export type IJbsDrillFieldRecordEditorProps = {
  field: IFieldInstance;
  record: RecordModel;
  drillMeta: IJbsDrillFieldMetaView;
  cellValue: unknown;
  readonly?: boolean;
  className?: string;
};

export type IJbsDrillFieldSaveParams = {
  recordId: string;
  drillFieldId: string;
  /** 下钻表选中行（preview 原始行，key 为 fieldAlias） */
  selectedDrillRow: globalThis.Record<string, unknown>;
  recordFields: globalThis.Record<string, unknown>;
};

/** 下钻选择保存结果：新建行仅本地更新，已有行走主端保存 */
export type IJbsDrillFieldSaveResult =
  | { mode: 'local'; fieldUpdates: globalThis.Record<string, unknown> }
  | { mode: 'persisted' };

/** 查看下钻数据详情入参（点击展示值时触发） */
export type IJbsDrillFieldDetailParams = {
  drillMeta: IJbsDrillFieldMetaView;
  displayValue: string;
  recordId?: string;
  mainRow?: Record<string, unknown>;
};

/** 玲珑表格 iframe 嵌入：下钻字段走主端参数字段保存 */
export type IJbsDrillFieldContextValue = {
  enabled: boolean;
  isDrillField: (fieldId: string) => boolean;
  getDrillFieldMeta: (fieldId: string) => IJbsDrillFieldMetaView | null;
  renderDrillFieldEditor?: (props: IJbsDrillFieldEditorProps) => ReactNode;
  /** 添加记录 / 展开记录弹窗中的下钻字段编辑 */
  renderDrillFieldRecordEditor?: (props: IJbsDrillFieldRecordEditorProps) => ReactNode;
  saveDrillFieldSelection?: (params: IJbsDrillFieldSaveParams) => Promise<IJbsDrillFieldSaveResult>;
  /** 点击下钻展示值查看对应数据详情（只读） */
  openDrillFieldDetail?: (params: IJbsDrillFieldDetailParams) => void;
};

export const JbsDrillFieldContextDefaultValue: IJbsDrillFieldContextValue = {
  enabled: false,
  isDrillField: () => false,
  getDrillFieldMeta: () => null,
};

export const JbsDrillFieldContext = createContext<IJbsDrillFieldContextValue>(
  JbsDrillFieldContextDefaultValue
);

export const useJbsDrillField = (): IJbsDrillFieldContextValue => useContext(JbsDrillFieldContext);
