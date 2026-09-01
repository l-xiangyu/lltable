/** 引用表单元格保存参数（走主端 executeEditScripts） */
export type IJbsReferenceSaveCellParams = {
  recordId: string;
  fieldId: string;
  cellValue: unknown;
  /** 当前行全部字段值（fieldId -> value） */
  recordFields: Record<string, unknown>;
};

/** 引用表新增行参数 */
export type IJbsReferenceCreateRecordParams = {
  fields: Record<string, unknown>;
};

export type IJbsReferenceBridgeHandlers = {
  /** 编辑已有行 */
  saveCellUpdate?: (params: IJbsReferenceSaveCellParams) => Promise<void>;
  /** 新增行 */
  createRecord?: (params: IJbsReferenceCreateRecordParams) => Promise<void>;
};

/** 由 nextjs-app 嵌入层注册，供 Record.updateCell 等无 React Context 场景调用 */
let bridgeHandlers: IJbsReferenceBridgeHandlers | null = null;

export const setJbsReferenceBridgeHandlers = (
  handlers: IJbsReferenceBridgeHandlers | null
): void => {
  bridgeHandlers = handlers;
};

export const getJbsReferenceBridgeHandlers = (): IJbsReferenceBridgeHandlers | null =>
  bridgeHandlers;
