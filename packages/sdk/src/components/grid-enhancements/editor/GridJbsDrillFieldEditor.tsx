import { Dialog, DialogContent } from '@teable/ui-lib';
import type { ForwardRefRenderFunction } from 'react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useJbsDrillField } from '../../../context/jbs-drill-field';
import type { IEditorRef } from '../../editor/type';
import type { IEditorProps } from '../../grid';
import type { IWrapperEditorProps } from './type';

/** 下钻字段 Grid 编辑器：Dialog 与 Link 编辑器一致，避免点击弹窗导致 Grid 退出编辑态 */
const GridJbsDrillFieldEditorBase: ForwardRefRenderFunction<
  IEditorRef<string>,
  IWrapperEditorProps & IEditorProps
> = (props, ref) => {
  const { field, record, isEditing, setEditing } = props;
  const jbsDrillField = useJbsDrillField();
  const containerRef = useRef<HTMLDivElement>(null);
  const defaultFocusRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => defaultFocusRef.current?.focus?.(),
  }));

  const drillMeta = jbsDrillField.getDrillFieldMeta(field.id);

  const onOpenChange = (open: boolean) => {
    if (open) {
      setEditing?.(true);
      return;
    }
    setEditing?.(false);
  };

  if (!jbsDrillField.enabled || !drillMeta || !jbsDrillField.renderDrillFieldEditor) {
    return <input className="size-0 opacity-0" ref={defaultFocusRef} />;
  }

  return (
    <>
      <div ref={containerRef} />
      <Dialog open={Boolean(isEditing)} onOpenChange={onOpenChange}>
        <DialogContent
          container={containerRef.current}
          className="flex max-w-4xl flex-col"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Dialog 已由 open 控制挂载；与 GridLinkEditor 一致，避免 isEditing 双重条件导致重复挂载 */}
          {jbsDrillField.renderDrillFieldEditor({
            ...props,
            field,
            record,
            drillMeta,
            isEditing,
            setEditing,
          })}
        </DialogContent>
      </Dialog>
      <input className="size-0 opacity-0" ref={defaultFocusRef} />
    </>
  );
};

export const GridJbsDrillFieldEditor = forwardRef(GridJbsDrillFieldEditorBase);
