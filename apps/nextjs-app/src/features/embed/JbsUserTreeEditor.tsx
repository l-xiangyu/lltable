'use client';

/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
import type { IUserCellValue } from '@teable/core';
import { Check, ChevronRight } from '@teable/icons';
import type { IJbsTreeSelectNode, IUserEditorMainProps, IUserEditorRef } from '@teable/sdk/context';
import { useTranslation } from '@teable/sdk/context/app/i18n';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  Skeleton,
  cn,
} from '@teable/ui-lib';
import type { ForwardRefRenderFunction } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { filterJbsUserTree } from './jbs-user-tree-utils';

type IJbsUserTreeEditorProps = IUserEditorMainProps & {
  treeData: IJbsTreeSelectNode[];
  isLoading?: boolean;
  onSearch?: (value: string) => void;
};

type ITreeRowProps = {
  node: IJbsTreeSelectNode;
  level: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
  activeIds: Set<string>;
  onSelectUser: (node: IJbsTreeSelectNode) => void;
};

const TreeRow = ({ node, level, expanded, onToggle, activeIds, onSelectUser }: ITreeRowProps) => {
  const isDept = node.deptOrUser !== 'user';
  const isExpanded = expanded[node.id] ?? node.open ?? level < 1;
  const hasChildren = Boolean(node.children?.length);
  const selectable = !isDept && node.choose !== false && !node.disabled;
  const isActive = selectable && activeIds.has(node.id);

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm',
          selectable && 'cursor-pointer hover:bg-accent',
          isActive && 'bg-accent'
        )}
        style={{ paddingLeft: level * 12 + 4 }}
        onClick={() => {
          if (isDept && hasChildren) {
            onToggle(node.id);
            return;
          }
          if (selectable) {
            onSelectUser(node);
          }
        }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', {
              'rotate-90': isExpanded,
            })}
          />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className={cn('flex-1 truncate', isDept && 'text-muted-foreground')}>
          {node.label}
        </span>
        {isActive && <Check className="ml-1 size-4 shrink-0" />}
      </div>
      {hasChildren && isExpanded
        ? node.children!.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              activeIds={activeIds}
              onSelectUser={onSelectUser}
            />
          ))
        : null}
    </>
  );
};

const JbsUserTreeEditorBase: ForwardRefRenderFunction<IUserEditorRef, IJbsUserTreeEditorProps> = (
  props,
  ref
) => {
  const {
    value: cellValue,
    style,
    className,
    isLoading,
    isMultiple,
    treeData,
    onChange,
    onSearch,
  } = props;
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const filteredTree = useMemo(() => filterJbsUserTree(treeData, search), [treeData, search]);

  const activeIds = useMemo(() => {
    if (isMultiple) {
      return new Set(((cellValue as IUserCellValue[]) ?? []).map((v) => v.id));
    }
    const single = cellValue as IUserCellValue | undefined;
    return single?.id ? new Set([single.id]) : new Set<string>();
  }, [cellValue, isMultiple]);

  const onToggle = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const onSelectUser = useCallback(
    (node: IJbsTreeSelectNode) => {
      const nextValue: IUserCellValue = {
        id: node.id,
        title: node.label,
      };
      if (isMultiple) {
        const innerValue = (cellValue || []) as IUserCellValue[];
        const exists = innerValue.some((v) => v.id === nextValue.id);
        const newValue = exists
          ? innerValue.filter((v) => v.id !== nextValue.id)
          : [...innerValue, nextValue];
        onChange?.(newValue.length ? newValue : undefined);
        return;
      }
      onChange?.(nextValue.id === (cellValue as IUserCellValue)?.id ? undefined : nextValue);
    },
    [cellValue, isMultiple, onChange]
  );

  return (
    <Command className={className} style={style} shouldFilter={false}>
      <CommandInput
        ref={inputRef}
        value={search}
        placeholder={t('editor.user.searchPlaceholder')}
        onValueChange={(value) => {
          setSearch(value);
          onSearch?.(value);
        }}
      />
      <CommandList>
        <CommandEmpty>{t('common.search.empty')}</CommandEmpty>
        <CommandGroup>
          {isLoading ? (
            <div className="flex items-center space-x-4 px-2 py-1">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            filteredTree.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                level={0}
                expanded={expanded}
                onToggle={onToggle}
                activeIds={activeIds}
                onSelectUser={onSelectUser}
              />
            ))
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export const JbsUserTreeEditor = forwardRef(JbsUserTreeEditorBase);
