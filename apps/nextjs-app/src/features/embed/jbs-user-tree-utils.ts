import type { ICollaborator } from '@teable/sdk/components/editor/user/types';
import type { IJbsTreeSelectNode } from '@teable/sdk/context';

/** 将主端用户树展平为可选协作者列表 */
export const flattenJbsUserTree = (nodes: IJbsTreeSelectNode[]): ICollaborator[] => {
  const result: ICollaborator[] = [];
  const walk = (items: IJbsTreeSelectNode[]) => {
    for (const item of items) {
      if (item.deptOrUser === 'user' && item.choose !== false && !item.disabled) {
        result.push({
          userId: item.id,
          userName: item.label,
          email: '',
        });
      }
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return result;
};

/** 按关键字过滤用户树（保留匹配用户及其祖先部门） */
export const filterJbsUserTree = (
  nodes: IJbsTreeSelectNode[],
  keyword: string
): IJbsTreeSelectNode[] => {
  const q = keyword.trim().toLowerCase();
  if (!q) {
    return nodes;
  }

  const filterNode = (node: IJbsTreeSelectNode): IJbsTreeSelectNode | null => {
    const labelMatch = node.label.toLowerCase().includes(q);
    const idMatch = node.id.toLowerCase().includes(q);
    const filteredChildren = (node.children ?? [])
      .map(filterNode)
      .filter((n): n is IJbsTreeSelectNode => n != null);

    if (node.deptOrUser === 'user') {
      return labelMatch || idMatch ? { ...node } : null;
    }
    if (filteredChildren.length || labelMatch) {
      return { ...node, children: filteredChildren, open: true };
    }
    return null;
  };

  return nodes.map(filterNode).filter((n): n is IJbsTreeSelectNode => n != null);
};

/** 从树中按 userId 查找用户节点 */
export const findJbsUserInTree = (
  nodes: IJbsTreeSelectNode[],
  userId: string
): IJbsTreeSelectNode | undefined => {
  for (const node of nodes) {
    if (node.deptOrUser === 'user' && node.id === userId) {
      return node;
    }
    if (node.children?.length) {
      const found = findJbsUserInTree(node.children, userId);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
};
