import { ViewType } from '@teable/core';
import { sortBy } from 'lodash';
import { useContext, useMemo } from 'react';
import { FieldContext } from '../context';
import { useJbsReferenceRecords } from '../context/jbs-reference/JbsReferenceRecordsContext';
import { useView } from './use-view';

export function useFields(
  options: {
    withHidden?: boolean;
    withDenied?: boolean;
    /** 引用表字段同步等场景：包含主端 isHiddenField=Y 的列 */
    withJbsLockedHidden?: boolean;
  } = {}
) {
  const { withHidden, withDenied, withJbsLockedHidden } = options;
  const { fields: originFields } = useContext(FieldContext);
  const jbsReference = useJbsReferenceRecords();

  const view = useView();
  const { type: viewType, columnMeta } = view ?? {};

  return useMemo(() => {
    const sortedFields = sortBy(originFields, (field) => columnMeta?.[field.id]?.order ?? Infinity);

    const excludeJbsLockedHidden = (list: typeof sortedFields) => {
      if (
        !jbsReference.isReferenceTable ||
        withJbsLockedHidden ||
        !jbsReference.hiddenFieldIds?.size
      ) {
        return list;
      }
      return list.filter((field) => !jbsReference.hiddenFieldIds!.has(field.id));
    };

    if ((withHidden && withDenied) || viewType == null) {
      return excludeJbsLockedHidden(sortedFields);
    }

    return excludeJbsLockedHidden(
      sortedFields.filter(({ id, canReadFieldRecord }) => {
        const isHidden = () => {
          if (withHidden) {
            return true;
          }
          // make sure these view rich display as default
          if (
            viewType === ViewType.Kanban ||
            viewType === ViewType.Gallery ||
            viewType === ViewType.Calendar
          ) {
            return columnMeta?.[id]?.visible === undefined ? true : columnMeta?.[id]?.visible;
          }
          if (viewType === ViewType.Form) {
            return columnMeta?.[id]?.visible;
          }
          return !columnMeta?.[id]?.hidden;
        };
        const hasPermission = () => {
          if (withDenied) {
            return true;
          }
          return canReadFieldRecord;
        };
        return isHidden() && hasPermission();
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    originFields,
    withHidden,
    withDenied,
    withJbsLockedHidden,
    viewType,
    JSON.stringify(columnMeta),
    jbsReference.isReferenceTable,
    jbsReference.hiddenFieldIds,
  ]);
}
