import { useMemo } from 'react';
import { useFields } from '../../hooks';
import type { IFieldInstance } from '../../model';
import { useJbsReferenceRecords } from './JbsReferenceRecordsContext';

export type IRichViewCardFields = {
  /** 卡片标题字段（图册/看板上下文里仍叫 primaryField） */
  titleField: IFieldInstance | null;
  /** 卡片正文展示字段（不含标题字段） */
  displayFields: IFieldInstance[];
  /** 当前视图是否具备渲染条件 */
  canRenderView: boolean;
};

/**
 * 图册/看板等富文本视图的标题与展示列：
 * - 引用表：标题取当前视图第一个可见字段（与主端 isHiddenField 同步结果一致）
 * - 原生表：标题仍用 Teable 主字段
 */
export const useRichViewCardFields = (): IRichViewCardFields => {
  const jbsReference = useJbsReferenceRecords();
  const visibleFields = useFields();

  return useMemo(() => {
    if (jbsReference.isReferenceTable) {
      const titleField = visibleFields[0] ?? null;
      return {
        titleField,
        displayFields: titleField ? visibleFields.slice(1) : visibleFields,
        canRenderView: visibleFields.length > 0,
      };
    }

    let titleField: IFieldInstance | null = null;
    const displayFields = visibleFields.filter((field) => {
      if (field.isPrimary) {
        titleField = field;
        return false;
      }
      return true;
    });

    return {
      titleField,
      displayFields,
      canRenderView: Boolean(titleField),
    };
  }, [jbsReference.isReferenceTable, visibleFields]);
};

/** 日历等视图：引用表未配置 titleFieldId 时，默认第一个可见字段作标题 */
export const useJbsReferenceDefaultTitleField = (): IFieldInstance | undefined => {
  const jbsReference = useJbsReferenceRecords();
  const visibleFields = useFields();

  return useMemo(() => {
    if (!jbsReference.isReferenceTable) {
      return undefined;
    }
    return visibleFields[0];
  }, [jbsReference.isReferenceTable, visibleFields]);
};
