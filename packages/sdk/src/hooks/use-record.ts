import type { IRecord } from '@teable/core';
import { IdPrefix } from '@teable/core';
import { keyBy } from 'lodash';
import { useEffect, useMemo, useState } from 'react';
import { useJbsReferenceRecords } from '../context/jbs-reference';
import type { Record } from '../model/record';
import { recordInstanceFieldMap, createRecordInstance } from '../model/record';
import { useConnection } from './use-connection';
import { useFields } from './use-fields';
import { useTableId } from './use-table-id';

export const useRecord = (recordId: string | undefined, initData?: IRecord) => {
  const { connection, connected } = useConnection();
  const tableId = useTableId();
  const jbsReference = useJbsReferenceRecords();
  const fields = useFields();

  const [instance, setInstance] = useState<Record | undefined>(() => {
    return initData && !connected ? createRecordInstance(initData) : undefined;
  });

  useEffect(() => {
    if (jbsReference.isReferenceTable) {
      return undefined;
    }
    if (!connection || !recordId) {
      return undefined;
    }
    const doc = connection.get(`${IdPrefix.Record}_${tableId}`, recordId);

    doc.fetch((err) => {
      if (err) {
        console.error('Failed to fetch document:', err);
        return;
      }
      setInstance(createRecordInstance(doc.data, doc));
    });

    const listeners = () => {
      setInstance(createRecordInstance(doc.data, doc));
    };

    doc.subscribe(() => {
      doc.on('op batch', listeners);
    });

    return () => {
      doc.removeListener('op batch', listeners);
      doc.listenerCount('op batch') === 0 && doc.unsubscribe();
      doc.listenerCount('op batch') === 0 && doc.destroy();
    };
  }, [connection, recordId, tableId, jbsReference.isReferenceTable]);

  return useMemo(() => {
    if (!fields.length || recordId == null) {
      return undefined;
    }
    const fieldMap = keyBy(fields, 'id');

    if (jbsReference.isReferenceTable) {
      const record = jbsReference.records.find((r) => r.id === recordId);
      if (!record) {
        return undefined;
      }
      return recordInstanceFieldMap(createRecordInstance(record), fieldMap);
    }

    if (!instance) {
      return undefined;
    }
    return recordInstanceFieldMap(instance, fieldMap);
  }, [fields, instance, recordId, jbsReference.isReferenceTable, jbsReference.records]);
};
