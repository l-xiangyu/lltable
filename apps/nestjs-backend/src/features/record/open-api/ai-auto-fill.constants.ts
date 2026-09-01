export const AI_AUTO_FILL_QUEUE = 'ai_auto_fill_queue';

// 中文注释: 任务类型，用于区分不同任务来源/用途
export const AI_AUTO_FILL_TASK_TYPE = 'ai_auto_fill_cell';

// 中文注释: 任务状态（存入 task/status 与 task_run/status）
export const AI_TASK_STATUS = {
  Pending: 'pending',
  Running: 'running',
  Completed: 'completed',
  Failed: 'failed',
  Cancelled: 'cancelled',
} as const;

export type IAiTaskStatus = (typeof AI_TASK_STATUS)[keyof typeof AI_TASK_STATUS];

// 中文注释: task.snapshot 结构（JSON 字符串）
export interface IAiAutoFillTaskSnapshot {
  tableId: string;
  recordId: string;
  fieldId: string;
  // 中文注释: 方便排查问题，不参与逻辑判断
  createdAt: string;
}
