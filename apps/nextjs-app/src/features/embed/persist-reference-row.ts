import type { IJbsReferenceFieldMeta } from '@teable/sdk/context';
import {
  buildReferenceEditData,
  validateReferenceRequiredFields,
} from './build-reference-edit-data';
import { fetchExecuteEditScripts, type IJbsKeywordDetail } from './jbs-main-api-client';

/** 校验引用表可编辑上下文 */
export const assertEditableReferenceContext = (
  meta: unknown,
  detail: IJbsKeywordDetail | null
): IJbsKeywordDetail => {
  if (!detail || !meta) {
    throw new Error('指标信息未加载');
  }
  if (detail.llTableEditable !== 'Y') {
    throw new Error('该引用表不可编辑');
  }
  return detail;
};

/**
 * 校验 preview 行并提交主端 executeEditScripts，成功后执行 onSuccess（通常为 loadData）
 */
export const persistReferenceRow = async (params: {
  keywordDetail: IJbsKeywordDetail;
  previewRow: Record<string, unknown>;
  fieldMetas: IJbsReferenceFieldMeta[];
  excludeFieldAliases?: Set<string>;
  operation: 'add' | 'edit';
  /** 为 true 时 data 为空则抛错（下钻保存场景） */
  requireNonEmptyData?: boolean;
  onSuccess: () => Promise<void>;
}): Promise<void> => {
  const {
    keywordDetail,
    previewRow,
    fieldMetas,
    excludeFieldAliases,
    operation,
    requireNonEmptyData,
    onSuccess,
  } = params;

  const requiredErr = validateReferenceRequiredFields(previewRow, fieldMetas);
  if (requiredErr) {
    throw new Error(requiredErr);
  }

  const data = buildReferenceEditData(
    previewRow,
    fieldMetas,
    keywordDetail.dataPrimaryKey,
    excludeFieldAliases
  );
  if (requireNonEmptyData && !Object.keys(data).length) {
    throw new Error('没有可提交的主端字段数据');
  }

  await fetchExecuteEditScripts({
    keywordId: keywordDetail.id,
    operation,
    data,
  });
  await onSuccess();
};
