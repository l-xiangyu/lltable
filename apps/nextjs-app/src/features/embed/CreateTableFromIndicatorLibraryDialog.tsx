import { useBase, useBaseId, useTables } from '@teable/sdk/hooks';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { Loader } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useState } from 'react';
import { createReferenceTableInBase } from './create-reference-table-in-base';
import {
  fetchLltableKeywordDetail,
  fetchLltableKeywordList,
  type IJbsKeywordListItem,
} from './jbs-main-api-client';
import {
  buildJbsReferenceTableMetaForCreate,
  buildKeywordDetailRequestPath,
} from './jbs-table-meta';
import { isInLltableEmbed } from './lltable-parent-bridge';
import { resolvePreviewColumnsForKeyword } from './reference-table-preview';

type ICreateTableFromIndicatorLibraryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 玲珑表格内「从指标库新建表格」弹窗：选择指标库 + 填写表名后创建引用表
 */
export const CreateTableFromIndicatorLibraryDialog = ({
  open,
  onOpenChange,
}: ICreateTableFromIndicatorLibraryDialogProps) => {
  const base = useBase();
  const baseId = useBaseId() as string;
  const tables = useTables();
  const router = useRouter();
  const { t } = useTranslation(['table', 'common']);

  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [keywordOptions, setKeywordOptions] = useState<IJbsKeywordListItem[]>([]);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string>();
  const [tableName, setTableName] = useState('');

  const resetForm = useCallback(() => {
    setSelectedKeywordId(undefined);
    setTableName('');
  }, []);

  const loadKeywordList = useCallback(async () => {
    if (!isInLltableEmbed()) {
      toast.error('当前不在主端嵌入环境，无法加载指标库');
      return;
    }
    setLoadingList(true);
    try {
      const rows = await fetchLltableKeywordList();
      setKeywordOptions(rows);
      if (rows.length === 0) {
        toast.warning(t('table:table.indicatorLibraryDialog.emptyList'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载指标库失败';
      toast.error(msg);
      setKeywordOptions([]);
    } finally {
      setLoadingList(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) {
      resetForm();
      loadKeywordList();
    }
  }, [open, loadKeywordList, resetForm]);

  const handleConfirm = async () => {
    if (!selectedKeywordId) {
      toast.error(t('table:table.indicatorLibraryDialog.keywordRequired'));
      return;
    }
    if (!tableName.trim()) {
      toast.error(t('table:table.indicatorLibraryDialog.tableNameRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const detail = await fetchLltableKeywordDetail(
        buildKeywordDetailRequestPath(buildJbsReferenceTableMetaForCreate(selectedKeywordId))
      );
      const columns = await resolvePreviewColumnsForKeyword(detail);
      const result = await createReferenceTableInBase({
        base,
        tables,
        router,
        baseId,
        tableName: tableName.trim(),
        columns,
        keyword: detail,
        t,
      });
      toast.success(
        t('table:table.indicatorLibraryDialog.createSuccess', { name: result.tableName })
      );
      onOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t('table:table.indicatorLibraryDialog.createFailed');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('table:table.indicatorLibraryDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('table:table.indicatorLibraryDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label>{t('table:table.indicatorLibraryDialog.keywordLabel')}</Label>
            <Select
              value={selectedKeywordId}
              onValueChange={setSelectedKeywordId}
              disabled={loadingList || submitting}
            >
              <SelectTrigger className="h-10">
                <SelectValue
                  placeholder={
                    loadingList
                      ? t('table:table.indicatorLibraryDialog.loading')
                      : t('table:table.indicatorLibraryDialog.keywordPlaceholder')
                  }
                />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {keywordOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="truncate">{item.keyWord || item.code || item.id}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t('table:table.indicatorLibraryDialog.tableNameLabel')}</Label>
            <Input
              value={tableName}
              disabled={submitting}
              placeholder={t('table:table.indicatorLibraryDialog.tableNamePlaceholder')}
              onChange={(e) => setTableName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  void handleConfirm();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={submitting || loadingList || !selectedKeywordId || !tableName.trim()}
            onClick={() => void handleConfirm()}
          >
            {submitting ? <Loader className="size-4 animate-spin" /> : t('common:actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
