import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ITableActionKey } from '@teable/core';
import { getActionTriggerChannel } from '@teable/core';
import { ShareDbService } from '../../share-db/share-db.service';
import { Events } from '../events';

/** 中文注释: 事件 payload，与前端 useTableListener 约定的 actionKey + payload 一致 */
export interface ITaskActionTriggerPayload {
  tableId: string;
  actionKey: ITableActionKey;
  payload?: { recordId?: string; fieldId?: string; errorMsg?: string };
}

/**
 * 中文注释: 监听 TASK_ACTION_TRIGGER，通过 ShareDB presence 推给前端
 * - 与 ActionTriggerListener 同源（都用 ShareDbService），不增加 record 模块对 ShareDb 的依赖
 * - 官网 develop 前端仅依赖 taskProcessing/taskCompleted/taskFailed 事件驱动刷新
 */
@Injectable()
export class TaskActionTriggerListener {
  private readonly logger = new Logger(TaskActionTriggerListener.name);

  constructor(private readonly shareDbService: ShareDbService) {}

  @OnEvent(Events.TASK_ACTION_TRIGGER)
  handle(payload: ITaskActionTriggerPayload): void {
    const { tableId, actionKey, payload: actionPayload } = payload;
    if (!tableId || !actionKey) {
      return;
    }
    try {
      const channel = getActionTriggerChannel(tableId);
      // 中文注释: 这里不使用缓存的 connection，使用 ShareDbService.connect() 以保持和其他 listener 一致
      this.logger.debug(
        `[AI][TaskActionTrigger][recv] tableId=${tableId} actionKey=${actionKey} payload=${JSON.stringify(actionPayload ?? {})}`
      );
      const presence = this.shareDbService.connect().getPresence(channel);
      const localPresence = presence.create(tableId);
      localPresence.submit([{ actionKey, payload: actionPayload }], (error) => {
        if (error) {
          this.logger.warn(
            `TaskActionTrigger submit failed: tableId=${tableId}, actionKey=${actionKey}, error=${String(error)}`
          );
        }
      });
    } catch (e) {
      this.logger.warn(
        `TaskActionTrigger unexpected: tableId=${tableId}, actionKey=${actionKey}, error=${String(e)}`
      );
    }
  }
}
