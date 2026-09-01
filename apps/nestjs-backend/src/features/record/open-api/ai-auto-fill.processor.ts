import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { generateTaskId } from '@teable/core';
import type { Job } from 'bullmq';
import { PrismaService } from '@teable/db-main-prisma';
import { EventEmitterService } from '../../../event-emitter/event-emitter.service';
import { Events } from '../../../event-emitter/events';
import { RecordOpenApiService } from './record-open-api.service';
import {
  AI_AUTO_FILL_QUEUE,
  AI_AUTO_FILL_TASK_TYPE,
  AI_TASK_STATUS,
  type IAiAutoFillTaskSnapshot,
} from './ai-auto-fill.constants';

export interface IAiAutoFillJobData {
  taskId: string;
  tableId: string;
  recordId: string;
  fieldId: string;
}

@Processor(AI_AUTO_FILL_QUEUE)
export class AiAutoFillProcessor extends WorkerHost {
  private readonly logger = new Logger(AiAutoFillProcessor.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly recordOpenApiService: RecordOpenApiService,
    private readonly eventEmitterService: EventEmitterService
  ) {
    super();
  }

  /**
   * 中文注释: 队列任务入口
   * 约定:
   * - 任务创建由 API 层完成（写入 task/task_run）
   * - processor 负责更新状态、执行 AI、回写单元格
   */
  async process(job: Job<IAiAutoFillJobData>): Promise<void> {
    const { taskId, tableId, recordId, fieldId } = job.data;
    const runId = generateTaskId();
    const snapshot: IAiAutoFillTaskSnapshot = {
      tableId,
      recordId,
      fieldId,
      createdAt: new Date().toISOString(),
    };

    // 中文注释: 日志标记队列任务启动，便于排查任务是否真正被 worker 消费
    this.logger.debug(
      `[AI][taskStart] taskId=${taskId} tableId=${tableId} recordId=${recordId} fieldId=${fieldId}`
    );

    // 中文注释: 创建 task_run（每次执行一次，便于追踪失败原因）
    await this.prismaService.txClient().taskRun.create({
      data: {
        id: runId,
        taskId,
        status: AI_TASK_STATUS.Running,
        snapshot: JSON.stringify(snapshot),
        startedTime: new Date(),
      },
    });

    await this.prismaService.txClient().task.update({
      where: { id: taskId },
      data: {
        status: AI_TASK_STATUS.Running,
        snapshot: JSON.stringify(snapshot),
      },
    });

    try {
      // 中文注释: 生成并回写结果（内部会读取记录/构建 prompt/调用模型/更新单元格）
      await this.recordOpenApiService.autoFillCellExecute(tableId, recordId, fieldId);

      await this.prismaService.txClient().task.update({
        where: { id: taskId },
        data: { status: AI_TASK_STATUS.Completed },
      });
      await this.prismaService.txClient().taskRun.update({
        where: { id: runId },
        data: { status: AI_TASK_STATUS.Completed },
      });

      // 日志: 标记任务执行成功，便于和前端的 taskCompleted 事件对齐
      this.logger.debug(
        `[AI][taskCompleted] taskId=${taskId} tableId=${tableId} recordId=${recordId} fieldId=${fieldId}`
      );

      // 中文注释: 与官网一致，通过事件驱动前端刷新，清除单元格 loading
      this.eventEmitterService.emit(Events.TASK_ACTION_TRIGGER, {
        tableId,
        actionKey: 'taskCompleted',
        payload: { recordId, fieldId },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? (error.stack ? String(error.stack) : '') : '';

      // 中文注释: Nest Logger 在某些 logger 适配器下不会自动序列化 Error，这里显式输出，便于排障
      this.logger.error(
        `AI auto-fill task failed: ${taskId}. errorMsg=${errorMsg}${
          errorStack ? `\n${errorStack}` : ''
        }`
      );

      await this.prismaService.txClient().task.update({
        where: { id: taskId },
        data: { status: AI_TASK_STATUS.Failed },
      });
      await this.prismaService.txClient().taskRun.update({
        where: { id: runId },
        data: {
          status: AI_TASK_STATUS.Failed,
          // 中文注释: errorMsg 面向列表快速定位；log 记录更完整堆栈
          errorMsg: errorMsg.slice(0, 2000),
          log: errorStack ? errorStack.slice(0, 20000) : undefined,
        },
      });

      // 日志: 标记任务失败并同步关键信息，方便按 taskFailed 事件链路排错
      this.logger.warn(
        `[AI][taskFailed] taskId=${taskId} tableId=${tableId} recordId=${recordId} fieldId=${fieldId} errorMsg=${errorMsg.slice(0, 200)}`
      );
      // 中文注释: 与官网一致，通知前端展示错误并清除 loading
      this.eventEmitterService.emit(Events.TASK_ACTION_TRIGGER, {
        tableId,
        actionKey: 'taskFailed',
        payload: { recordId, fieldId, errorMsg: errorMsg.slice(0, 2000) },
      });
    }
  }
}
