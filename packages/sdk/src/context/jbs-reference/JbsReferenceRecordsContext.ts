import type { IRecord, ISelectFieldChoice } from '@teable/core';
import { createContext, useContext } from 'react';
import type {
  IJbsReferenceCreateRecordParams,
  IJbsReferenceSaveCellParams,
} from './jbs-reference-bridge';

/** 引用表字段元数据（Teable 列 fieldAlias ↔ 主端提交 key label） */
export type IJbsReferenceFieldMeta = {
  fieldId: string;
  fieldAlias: string;
  /** 提交主端 executeEditScripts 时 data 的 key（fieldList.label） */
  fieldName: string;
  isEditable: boolean;
  isRequired: boolean;
  /** 主端字段类型码（ZD 等为字典） */
  jbsType?: string;
  /** 字典字段 dictType */
  dictType?: string;
};

/** 引用表字典字段下拉项（主端 dictLabel） */
export type IJbsDictSelectOption = {
  label: string;
  value: string;
  color?: string;
  backgroundColor?: string;
};

/** 主表指标字段（用于下钻参数 fieldId -> fieldAlias 解析） */
export type IJbsMainKeywordFieldItem = {
  id?: string;
  fieldAlias?: string;
  showAlias?: string;
  label?: string;
  fieldName?: string;
};

/** 引用表虚拟记录上下文（由 nextjs-app 嵌入层注入，普通表为默认空值） */
export type IJbsReferenceRecordsContextValue = {
  /** 当前表是否为引用表（数据来自主端 API） */
  isReferenceTable: boolean;
  /** 表级只读（llTableEditable !== 'Y' 时为 true） */
  readonly: boolean;
  records: IRecord[];
  loading: boolean;
  /** 重新从主端拉数 */
  refresh: () => void;
  keywordId?: string;
  dataPrimaryKey?: string;
  fieldMetas?: IJbsReferenceFieldMeta[];
  /** 主表 keyword fieldList（下钻过滤用） */
  mainKeywordFieldList?: IJbsMainKeywordFieldItem[];
  /** 按 recordId 取主表 preview 原始行（fieldAlias key） */
  getRecordRawRow?: (recordId: string) => Record<string, unknown> | undefined;
  /** 编辑单元格（走主端 executeEditScripts） */
  saveCellUpdate?: (params: IJbsReferenceSaveCellParams) => Promise<void>;
  /** 新增行 */
  createRecord?: (params: IJbsReferenceCreateRecordParams) => Promise<void>;
  /** 批量更新行字段（图册/看板/日历等视图走主端 edit） */
  updateRecordFields?: (params: {
    recordId: string;
    fields: Record<string, unknown>;
  }) => Promise<void>;
  /** 主端 isHiddenField=Y 的 Teable 字段 id（新建视图 columnMeta 未同步前用于过滤） */
  hiddenFieldIds?: ReadonlySet<string>;
  /** 字典 options 版本号（主端字典拉取完成后递增，供编辑器刷新可选项） */
  dictOptionsVersion?: number;
  /** 是否主端字典字段（ZD） */
  isDictField?: (fieldId: string) => boolean;
  /** 主端字典可选项（编辑下拉，禁止 Teable 端新增） */
  getDictSelectOptions?: (fieldId: string) => IJbsDictSelectOption[] | undefined;
  /** 字典展示 choices（含行内值，供 Grid 标签着色） */
  getDictDisplayChoices?: (fieldId: string) => ISelectFieldChoice[] | undefined;
};

export const JbsReferenceRecordsContextDefaultValue: IJbsReferenceRecordsContextValue = {
  isReferenceTable: false,
  readonly: false,
  records: [],
  loading: false,
  refresh: () => undefined,
};

export const JbsReferenceRecordsContext = createContext<IJbsReferenceRecordsContextValue>(
  JbsReferenceRecordsContextDefaultValue
);

export const useJbsReferenceRecords = (): IJbsReferenceRecordsContextValue =>
  useContext(JbsReferenceRecordsContext);
