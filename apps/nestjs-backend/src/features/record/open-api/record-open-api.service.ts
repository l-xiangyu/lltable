/* eslint-disable sonarjs/no-identical-functions */
import { Inject, Injectable } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type {
  IAttachmentCellValue,
  IAttachmentItem,
  IButtonFieldCellValue,
  IButtonFieldOptions,
  IFieldAIConfig,
  IMakeOptional,
} from '@teable/core';
import { FieldAIActionType, FieldKeyType, FieldType, HttpErrorCode, ViewType } from '@teable/core';
import { generateTaskId } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import {
  CreateRecordAction,
  ICreateRecordsRo,
  IUpdateRecordsRo,
  UpdateRecordAction,
  UploadType,
} from '@teable/openapi';
import type {
  IRecordHistoryItemVo,
  ICreateRecordsVo,
  IFormSubmitRo,
  IGetRecordHistoryQuery,
  IRecord,
  IRecordHistoryVo,
  IRecordInsertOrderRo,
  IUpdateRecordRo,
} from '@teable/openapi';
import { isEmpty, keyBy, pick } from 'lodash';
import { Task } from '@teable/openapi';
import { ClsService } from 'nestjs-cls';
import type { Queue } from 'bullmq';
import { Readable } from 'node:stream';
import { IThresholdConfig, ThresholdConfig } from '../../../configs/threshold.config';
import { CustomHttpException } from '../../../custom.exception';
import { EventEmitterService } from '../../../event-emitter/event-emitter.service';
import { Events } from '../../../event-emitter/events';
import type { IClsStore } from '../../../types/cls';
import { extractFieldReferences } from '../../../utils/extract-field-reference';
import { retryOnDeadlock } from '../../../utils/retry-decorator';
import { AiService } from '../../ai/ai.service';
import { AttachmentsService } from '../../attachments/attachments.service';
import { AttachmentsStorageService } from '../../attachments/attachments-storage.service';
import StorageAdapter from '../../attachments/plugins/adapter';
import { getPublicFullStorageUrl } from '../../attachments/plugins/utils';
import { FieldService } from '../../field/field.service';
import { createFieldInstanceByRaw } from '../../field/model/factory';
import { TableDomainQueryService } from '../../table-domain';
import { RecordModifyService } from '../record-modify/record-modify.service';
import { RecordModifySharedService } from '../record-modify/record-modify.shared.service';
import type { IRecordInnerRo } from '../record.service';
import { RecordService } from '../record.service';
import type { IUpdateRecordsInternalRo } from '../type';
import {
  AI_AUTO_FILL_QUEUE,
  AI_AUTO_FILL_TASK_TYPE,
  AI_TASK_STATUS,
  type IAiAutoFillTaskSnapshot,
} from './ai-auto-fill.constants';
import type { IAiAutoFillJobData } from './ai-auto-fill.processor';
import { extractDocumentText, isDocumentMime, isImageMime } from './attachment-text-extractor';

@Injectable()
export class RecordOpenApiService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly recordService: RecordService,
    private readonly attachmentsService: AttachmentsService,
    private readonly recordModifyService: RecordModifyService,
    @ThresholdConfig() private readonly thresholdConfig: IThresholdConfig,
    private readonly recordModifySharedService: RecordModifySharedService,
    private readonly tableDomainQueryService: TableDomainQueryService,
    private readonly fieldService: FieldService,
    private readonly cls: ClsService<IClsStore>,
    private readonly eventEmitterService: EventEmitterService,
    private readonly aiService: AiService,
    private readonly attachmentsStorageService: AttachmentsStorageService,
    // 中文注释: 有 Redis 时为 BullMQ Queue；无 Redis 时为本地 fallback queue（仅提供 add）
    @Inject(getQueueToken(AI_AUTO_FILL_QUEUE))
    private readonly aiAutoFillQueue: Pick<Queue, 'add'> | { add: Queue['add'] }
  ) {}

  @retryOnDeadlock()
  async multipleCreateRecords(
    tableId: string,
    createRecordsRo: ICreateRecordsRo,
    ignoreMissingFields: boolean = false,
    isAiInternal?: string
  ): Promise<ICreateRecordsVo> {
    const res = await this.prismaService.$tx(
      async () =>
        this.recordModifyService.multipleCreateRecords(
          tableId,
          createRecordsRo,
          ignoreMissingFields
        ),
      { timeout: this.thresholdConfig.bigTransactionTimeout }
    );

    const appId = this.cls.get('appId');
    if (appId) {
      this.cls.set('skipRecordAuditLog', true);
      await this.recordService.emitRecordAuditLogEvent(
        CreateRecordAction.AppRecordCreate,
        tableId,
        createRecordsRo.records?.length ?? 0,
        appId
      );
    } else if (isAiInternal) {
      this.cls.set('skipRecordAuditLog', true);
      this.cls.set('user.id', 'aiRobot');
      await this.recordService.emitRecordAuditLogEvent(
        CreateRecordAction.AiRecordCreate,
        tableId,
        createRecordsRo.records?.length ?? 0
      );
    }

    return res;
  }

  /**
   * create records without any ops, only typecast and sql
   * @param tableId
   * @param createRecordsRo
   */
  async createRecordsOnlySql(tableId: string, createRecordsRo: ICreateRecordsRo): Promise<void> {
    await this.prismaService.$tx(async () => {
      return await this.recordModifyService.createRecordsOnlySql(tableId, createRecordsRo);
    });
  }

  async createRecords(
    tableId: string,
    createRecordsRo: ICreateRecordsRo & { records: IMakeOptional<IRecordInnerRo, 'id'>[] },
    ignoreMissingFields: boolean = false
  ): Promise<ICreateRecordsVo> {
    return await this.prismaService.$tx(
      async () =>
        this.recordModifyService.multipleCreateRecords(
          tableId,
          createRecordsRo,
          ignoreMissingFields
        ),
      { timeout: this.thresholdConfig.bigTransactionTimeout }
    );
  }

  @retryOnDeadlock()
  async updateRecords(
    tableId: string,
    updateRecordsRo: IUpdateRecordsRo,
    windowId?: string,
    isAiInternal?: string
  ) {
    const res = await this.recordModifyService.updateRecords(
      tableId,
      updateRecordsRo as IUpdateRecordsInternalRo,
      windowId
    );

    const appId = this.cls.get('appId');
    if (appId) {
      this.cls.set('skipRecordAuditLog', true);
      await this.recordService.emitRecordAuditLogEvent(
        UpdateRecordAction.AppRecordUpdate,
        tableId,
        updateRecordsRo.records?.length ?? 0,
        appId
      );
    } else if (isAiInternal) {
      this.cls.set('skipRecordAuditLog', true);
      this.cls.set('user.id', 'aiRobot');
      await this.recordService.emitRecordAuditLogEvent(
        UpdateRecordAction.AiRecordUpdate,
        tableId,
        updateRecordsRo.records?.length ?? 0
      );
    }

    return res;
  }

  async simpleUpdateRecords(tableId: string, updateRecordsRo: IUpdateRecordsRo) {
    return await this.recordModifyService.simpleUpdateRecords(
      tableId,
      updateRecordsRo as IUpdateRecordsInternalRo
    );
  }

  async updateRecord(
    tableId: string,
    recordId: string,
    updateRecordRo: IUpdateRecordRo,
    windowId?: string,
    isAiInternal?: string
  ): Promise<IRecord> {
    await this.updateRecords(
      tableId,
      {
        ...updateRecordRo,
        records: [{ id: recordId, fields: updateRecordRo.record.fields }],
      },
      windowId,
      isAiInternal
    );

    const snapshots = await this.recordService.getSnapshotBulkWithPermission(
      tableId,
      [recordId],
      undefined,
      updateRecordRo.fieldKeyType || FieldKeyType.Name,
      undefined,
      true
    );

    if (snapshots.length !== 1) {
      throw new CustomHttpException('update record failed', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.record.updateFailed',
        },
      });
    }

    return snapshots[0].data;
  }

  async deleteRecord(tableId: string, recordId: string, windowId?: string) {
    return this.recordModifyService.deleteRecord(tableId, recordId, windowId);
  }

  async deleteRecords(tableId: string, recordIds: string[], windowId?: string) {
    return this.recordModifyService.deleteRecords(tableId, recordIds, windowId);
  }

  async getRecordHistory(
    tableId: string,
    recordId: string | undefined,
    query: IGetRecordHistoryQuery,
    projectionIds?: string[]
  ): Promise<IRecordHistoryVo> {
    const { cursor, startDate, endDate } = query;
    const limit = 20;

    const dateFilter: { [key: string]: Date } = {};
    if (startDate) {
      dateFilter['gte'] = new Date(startDate);
    }
    if (endDate) {
      dateFilter['lte'] = new Date(endDate);
    }

    const list = await this.prismaService.recordHistory.findMany({
      where: {
        tableId,
        ...(recordId ? { recordId } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { createdTime: dateFilter } : {}),
        ...(projectionIds?.length ? { fieldId: { in: projectionIds } } : {}),
      },
      select: {
        id: true,
        recordId: true,
        fieldId: true,
        before: true,
        after: true,
        createdTime: true,
        createdBy: true,
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: {
        createdTime: 'desc',
      },
    });

    let nextCursor: typeof cursor | undefined = undefined;

    if (list.length > limit) {
      const nextItem = list.pop();
      nextCursor = nextItem?.id;
    }

    const createdBySet: Set<string> = new Set();
    const historyList: IRecordHistoryItemVo[] = [];

    for (const item of list) {
      const { id, recordId, fieldId, before, after, createdTime, createdBy } = item;

      createdBySet.add(createdBy);
      const beforeObj = JSON.parse(before as string);
      const afterObj = JSON.parse(after as string);
      const { meta: beforeMeta, data: beforeData } = beforeObj as IRecordHistoryItemVo['before'];
      const { meta: afterMeta, data: afterData } = afterObj as IRecordHistoryItemVo['after'];
      const { type: beforeType } = beforeMeta;
      const { type: afterType } = afterMeta;

      if (beforeType === FieldType.Attachment) {
        beforeObj.data = await this.recordService.getAttachmentPresignedCellValue(
          beforeData as IAttachmentCellValue
        );
      }

      if (afterType === FieldType.Attachment) {
        afterObj.data = await this.recordService.getAttachmentPresignedCellValue(
          afterData as IAttachmentCellValue
        );
      }

      historyList.push({
        id,
        tableId,
        recordId,
        fieldId,
        before: beforeObj,
        after: afterObj,
        createdTime: createdTime.toISOString(),
        createdBy,
      });
    }

    const userList = await this.prismaService.user.findMany({
      where: {
        id: {
          in: Array.from(createdBySet),
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    });

    const handledUserList = userList.map((user) => {
      const { avatar } = user;
      return {
        ...user,
        avatar: avatar && getPublicFullStorageUrl(avatar),
      };
    });

    return {
      historyList,
      userMap: keyBy(handledUserList, 'id'),
      nextCursor,
    };
  }

  private async getValidateAttachmentRecord(tableId: string, recordId: string, fieldId: string) {
    const field = await this.prismaService
      .txClient()
      .field.findFirstOrThrow({
        where: {
          id: fieldId,
          deletedTime: null,
        },
        select: {
          id: true,
          type: true,
          isComputed: true,
        },
      })
      .catch(() => {
        throw new CustomHttpException(`Field ${fieldId} not found`, HttpErrorCode.NOT_FOUND, {
          localization: {
            i18nKey: 'httpErrors.field.notFound',
          },
        });
      });

    if (field.type !== FieldType.Attachment) {
      throw new CustomHttpException('Field is not an attachment', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.field.notAttachment',
        },
      });
    }

    if (field.isComputed) {
      throw new CustomHttpException('Field is computed', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.field.isComputed',
        },
      });
    }

    const recordData = await this.recordService.getRecordsById(tableId, [recordId]);
    const record = recordData.records[0];
    if (!record) {
      throw new CustomHttpException(`Record ${recordId} not found`, HttpErrorCode.NOT_FOUND, {
        localization: {
          i18nKey: 'httpErrors.record.notFound',
        },
      });
    }
    return record;
  }

  async uploadAttachment(
    tableId: string,
    recordId: string,
    fieldId: string,
    file?: Express.Multer.File,
    fileUrl?: string
  ) {
    if (!file && !fileUrl) {
      throw new CustomHttpException('No file or URL provided', HttpErrorCode.VALIDATION_ERROR, {
        localization: {
          i18nKey: 'httpErrors.record.noFileOrUrlProvided',
        },
      });
    }

    const record = await this.getValidateAttachmentRecord(tableId, recordId, fieldId);

    const attachmentItem = file
      ? await this.attachmentsService.uploadFile(file)
      : await this.attachmentsService.uploadFromUrl(fileUrl as string);

    // Update the cell value
    const updateRecordRo: IUpdateRecordRo = {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [fieldId]: ((record.fields[fieldId] || []) as IAttachmentItem[]).concat(attachmentItem),
        },
      },
    };

    return await this.updateRecord(tableId, recordId, updateRecordRo);
  }

  async insertAttachment(
    tableId: string,
    recordId: string,
    fieldId: string,
    attachments: IAttachmentItem[],
    anchorId?: string
  ) {
    if (!attachments.length) {
      throw new CustomHttpException('No attachments provided', HttpErrorCode.VALIDATION_ERROR);
    }

    const record = await this.getValidateAttachmentRecord(tableId, recordId, fieldId);

    // Fetch full attachment data for each attachment item from database

    const current = (record.fields[fieldId] || []) as IAttachmentItem[];
    const anchorIndex = anchorId ? current.findIndex((item) => item.id === anchorId) : -1;
    const next =
      anchorIndex >= 0
        ? [...current.slice(0, anchorIndex + 1), ...attachments, ...current.slice(anchorIndex + 1)]
        : current.concat(attachments);

    const updateRecordRo: IUpdateRecordRo = {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [fieldId]: next,
        },
      },
    };

    return await this.updateRecord(tableId, recordId, updateRecordRo);
  }

  async duplicateRecord(
    tableId: string,
    recordId: string,
    order?: IRecordInsertOrderRo,
    projection?: string[]
  ) {
    const query = { fieldKeyType: FieldKeyType.Id, projection };
    const result = await this.recordService.getRecord(tableId, recordId, query);
    const records = { fields: result.fields };
    const createRecordsRo = {
      fieldKeyType: FieldKeyType.Id,
      order,
      records: [records],
    };
    return await this.prismaService
      .$tx(async () => this.createRecords(tableId, createRecordsRo))
      .then((res) => {
        return res.records[0];
      });
  }

  async buttonClick(tableId: string, recordId: string, fieldId: string) {
    const fieldRaw = await this.prismaService.txClient().field.findFirstOrThrow({
      where: {
        id: fieldId,
        type: FieldType.Button,
        deletedTime: null,
      },
    });

    const fieldInstance = createFieldInstanceByRaw(fieldRaw);
    const options = fieldInstance.options as IButtonFieldOptions;
    const isActive = options.workflow && options.workflow.id && options.workflow.isActive;
    if (!isActive) {
      throw new CustomHttpException(
        `Button field's workflow ${options.workflow?.id} is not active`,
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.workflow.notActive',
          },
        }
      );
    }

    const maxCount = options.maxCount || 0;
    const record = await this.recordService.getRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
    });

    const fieldValue = record.fields[fieldId] as IButtonFieldCellValue;
    const count = fieldValue?.count || 0;
    if (maxCount > 0 && count >= maxCount) {
      throw new CustomHttpException(
        `Button click count ${count} reached max count ${maxCount}`,
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.field.button.clickCountReachedMaxCount',
          },
        }
      );
    }
    const updatedRecord: IRecord = await this.updateRecord(tableId, recordId, {
      record: {
        fields: { [fieldId]: { count: count + 1 } },
      },
      fieldKeyType: FieldKeyType.Id,
    });
    updatedRecord.fields = pick(updatedRecord.fields, [fieldId]);

    return {
      tableId,
      fieldId,
      record: updatedRecord,
    };
  }

  async resetButton(tableId: string, recordId: string, fieldId: string) {
    const fieldRaw = await this.prismaService.txClient().field.findFirstOrThrow({
      where: {
        id: fieldId,
        type: FieldType.Button,
        deletedTime: null,
      },
    });

    const fieldInstance = createFieldInstanceByRaw(fieldRaw);
    const fieldOptions = fieldInstance.options as IButtonFieldOptions;
    if (!fieldOptions.resetCount) {
      throw new CustomHttpException(
        'Button field does not support reset',
        HttpErrorCode.VALIDATION_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.field.button.notSupportReset',
          },
        }
      );
    }

    return await this.updateRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [fieldId]: null,
        },
      },
    });
  }

  /**
   * AI 自动填充（异步任务版）:
   * - 立即返回 taskId（tsk...）
   * - 后台队列执行（解析附件/构建 prompt/调用模型/回写）
   * - 前端通过 /aggregation/task-status-collection 轮询进度
   */
  async autoFillCell(
    tableId: string,
    recordId: string,
    fieldId: string
  ): Promise<{ taskId: string; value?: string }> {
    const table = await this.tableDomainQueryService.getTableDomainById(tableId);
    const field = table.getField(fieldId);
    if (!field) {
      throw new CustomHttpException('Field not found', HttpErrorCode.VALIDATION_ERROR);
    }
    const aiConfig = field.aiConfig as IFieldAIConfig | undefined;
    if (!aiConfig || !('type' in aiConfig)) {
      throw new CustomHttpException('Field has no AI config', HttpErrorCode.VALIDATION_ERROR);
    }

    // 中文注释: 去重 - 同一个单元格若已有进行中的任务，直接复用 taskId，避免重复执行
    const existing = await this.prismaService.txClient().task.findFirst({
      where: {
        type: AI_AUTO_FILL_TASK_TYPE,
        status: { in: [AI_TASK_STATUS.Pending, AI_TASK_STATUS.Running] },
        AND: [
          { snapshot: { contains: `"tableId":"${tableId}"` } },
          { snapshot: { contains: `"recordId":"${recordId}"` } },
          { snapshot: { contains: `"fieldId":"${fieldId}"` } },
        ],
      },
      select: { id: true },
      orderBy: { createdTime: 'desc' },
    });
    if (existing?.id) {
      // 通过事件驱动前端刷新 task-status-collection，不引入 ShareDb 依赖
      this.eventEmitterService.emit(Events.TASK_ACTION_TRIGGER, {
        tableId,
        actionKey: 'taskProcessing',
        payload: { recordId, fieldId },
      });
      // eslint-disable-next-line no-console
      console.debug(
        `[AI][autoFillCell][reuse] tableId=${tableId} recordId=${recordId} fieldId=${fieldId} taskId=${existing.id}`
      );
      return { taskId: existing.id };
    }

    const taskId = generateTaskId();
    const snapshot: IAiAutoFillTaskSnapshot = {
      tableId,
      recordId,
      fieldId,
      createdAt: new Date().toISOString(),
    };

    await this.prismaService.txClient().task.create({
      data: {
        id: taskId,
        type: AI_AUTO_FILL_TASK_TYPE,
        status: AI_TASK_STATUS.Pending,
        snapshot: JSON.stringify(snapshot),
        createdBy: this.cls.get('user.id') ?? 'system',
      },
    });

    const jobData: IAiAutoFillJobData = { taskId, tableId, recordId, fieldId };
    await this.aiAutoFillQueue.add('ai_auto_fill_cell', jobData, {
      removeOnComplete: true,
      removeOnFail: true,
    } as never);

    // 日志: 标记新任务创建+入队成功，便于排查“任务未创建/入队失败”等问题
    // eslint-disable-next-line no-console
    console.debug(
      `[AI][autoFillCell][enqueue] tableId=${tableId} recordId=${recordId} fieldId=${fieldId} taskId=${taskId} queue=${AI_AUTO_FILL_QUEUE}`
    );
    // 中文注释: 任务入队后立即通知前端刷新，与官网 develop 前端“事件驱动、无轮询”一致
    this.eventEmitterService.emit(Events.TASK_ACTION_TRIGGER, {
      tableId,
      actionKey: 'taskProcessing',
      payload: { recordId, fieldId },
    });

    return { taskId };
  }

  /**
   * 中文注释: 真正执行 auto-fill 的逻辑（供队列 worker 调用）
   * 注意:
   * - 必须在服务端读取并解析附件内容（docx）
   * - 执行完成后回写目标单元格
   */
  async autoFillCellExecute(tableId: string, recordId: string, fieldId: string): Promise<void> {
    const table = await this.tableDomainQueryService.getTableDomainById(tableId);
    const field = table.getField(fieldId);
    if (!field) {
      throw new CustomHttpException('Field not found', HttpErrorCode.VALIDATION_ERROR);
    }
    const aiConfig = field.aiConfig as IFieldAIConfig | undefined;
    if (!aiConfig || !('type' in aiConfig)) {
      throw new CustomHttpException('Field has no AI config', HttpErrorCode.VALIDATION_ERROR);
    }

    const record = await this.recordService.getRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
    });
    if (!record?.fields) {
      throw new CustomHttpException('Record not found', HttpErrorCode.VALIDATION_ERROR);
    }

    const baseId = table.baseId;
    if (!baseId) {
      throw new CustomHttpException('Table has no base', HttpErrorCode.VALIDATION_ERROR);
    }

    const sourceFieldId = (aiConfig as { sourceFieldId?: string }).sourceFieldId;
    const sourceField = sourceFieldId ? table.getField(sourceFieldId) : undefined;
    const sourceValue = sourceFieldId ? record.fields[sourceFieldId] : undefined;

    // 中文注释: 源为附件时分流处理——文档类抽正文入 prompt，仅图片走 FilePart，以兼容 OpenAI 等仅支持 text/image
    let text: string;
    if (
      sourceField?.type === FieldType.Attachment &&
      Array.isArray(sourceValue) &&
      (sourceValue as IAttachmentCellValue).length > 0
    ) {
      const transferMode = await this.aiService.getAttachmentTransferMode();
      const { documentText, imageParts } = await this.getAttachmentContentForAi(
        sourceValue as IAttachmentCellValue,
        transferMode
      );
      const sourceFieldName = sourceField.name ?? sourceFieldId;
      if (documentText.length === 0 && imageParts.length === 0) {
        throw new CustomHttpException(
          'No supported attachment content for AI (need document or image)',
          HttpErrorCode.VALIDATION_ERROR
        );
      }
      const prompt =
        documentText.length > 0
          ? this.buildAiPromptFromSourceText(aiConfig, sourceFieldName, documentText)
          : this.buildInstructionPromptForAttachment(aiConfig, sourceFieldName);
      if (imageParts.length > 0) {
        text = await this.aiService.generateTextWithAttachments(baseId, {
          prompt,
          modelKey: aiConfig.modelKey,
          task: Task.Coding,
          fileParts: imageParts,
        });
      } else {
        text = await this.aiService.generateText(baseId, {
          prompt,
          modelKey: aiConfig.modelKey,
          task: Task.Coding,
        });
      }
    } else {
      const prompt = await this.buildAiPromptWithAttachment(aiConfig, record, table);
      text = await this.aiService.generateText(baseId, {
        prompt,
        modelKey: aiConfig.modelKey,
        task: Task.Coding,
      });
    }

    await this.updateRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [fieldId]: text } },
    });
  }

  /**
   * 将字段值安全地转为可读文本, 避免 Object 类型直接 String() 变成 [object Object] - 2026-03-01 21:00:00
   * 优先使用 FieldCore.cellValue2String, 其次 JSON.stringify, 最后 String()
   */
  private cellValueToText(
    value: unknown,
    field?: { cellValue2String: (v?: unknown) => string }
  ): string {
    if (value == null) return '';
    if (field && typeof field.cellValue2String === 'function') {
      return field.cellValue2String(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * 根据 AI 配置类型构建 prompt - 2026-03-01 21:00:00
   * - Customization/ImageCustomization: 使用用户自定义 prompt, 替换 {fieldId} 引用
   * - 其他类型: 根据 sourceFieldId 读取源字段值, 结合 type 和 attachPrompt 构建 prompt
   */
  private buildAiPrompt(
    aiConfig: IFieldAIConfig,
    record: IRecord,
    table: {
      getField: (
        id: string
      ) => { name: string; cellValue2String: (v?: unknown) => string } | undefined;
    }
  ): string {
    const { type } = aiConfig;

    // Customization 和 ImageCustomization 类型使用用户自定义 prompt - 2026-03-01 21:00:00
    if (type === FieldAIActionType.Customization || type === FieldAIActionType.ImageCustomization) {
      const customPrompt = (aiConfig as { prompt?: string }).prompt?.trim();
      if (!customPrompt) {
        throw new CustomHttpException(
          'Field AI config has no prompt',
          HttpErrorCode.VALIDATION_ERROR
        );
      }
      let prompt = customPrompt;
      const refs = extractFieldReferences(prompt);
      for (const refId of refs) {
        const value = record.fields[refId];
        const refField = table.getField(refId);
        const str = this.cellValueToText(value, refField);
        prompt = prompt.replace(new RegExp(`\\{${refId}\\}`, 'g'), str);
      }
      return prompt;
    }

    // 非自定义类型: 基于 sourceFieldId 构建 prompt - 2026-03-01 21:00:00
    const sourceFieldId = (aiConfig as { sourceFieldId?: string }).sourceFieldId;
    if (!sourceFieldId) {
      throw new CustomHttpException(
        'Field AI config has no sourceFieldId',
        HttpErrorCode.VALIDATION_ERROR
      );
    }

    const sourceField = table.getField(sourceFieldId);
    const sourceFieldName = sourceField?.name ?? sourceFieldId;
    const sourceValue = record.fields[sourceFieldId];
    const sourceText = this.cellValueToText(sourceValue, sourceField);
    return this.buildAiPromptFromSourceText(aiConfig, sourceFieldName, sourceText);
  }

  /**
   * 中文注释: 根据 sourceText 构建 prompt（抽离公共逻辑，避免附件字段被错误走 cellValue2String）
   */
  private buildAiPromptFromSourceText(
    aiConfig: IFieldAIConfig,
    sourceFieldName: string,
    sourceText: string
  ): string {
    const { type } = aiConfig;
    const attachPrompt = (aiConfig as { attachPrompt?: string }).attachPrompt?.trim();

    let prompt: string;
    switch (type) {
      case FieldAIActionType.Summary:
        prompt = `Please summarize the following content from field "${sourceFieldName}":\n\n${sourceText}`;
        break;
      case FieldAIActionType.Translation: {
        const targetLanguage =
          (aiConfig as { targetLanguage?: string }).targetLanguage || 'English';
        prompt = `Please translate the following content from field "${sourceFieldName}" into ${targetLanguage}:\n\n${sourceText}`;
        break;
      }
      case FieldAIActionType.Extraction:
        prompt = `Please extract the key information from the following content of field "${sourceFieldName}":\n\n${sourceText}`;
        break;
      case FieldAIActionType.Improvement:
        prompt = `Please improve and polish the following text from field "${sourceFieldName}":\n\n${sourceText}`;
        break;
      case FieldAIActionType.Classification:
        prompt = `Please classify the following content from field "${sourceFieldName}" into a single category. Return only the category name:\n\n${sourceText}`;
        break;
      case FieldAIActionType.Tag:
        prompt = `Please generate relevant tags for the following content from field "${sourceFieldName}". Return tags separated by commas:\n\n${sourceText}`;
        break;
      case FieldAIActionType.Rating:
        prompt = `Please rate the following content from field "${sourceFieldName}" on a scale of 1 to 5. Return only the number:\n\n${sourceText}`;
        break;
      case FieldAIActionType.ImageGeneration:
        prompt = `Generate an image based on the following description from field "${sourceFieldName}":\n\n${sourceText}`;
        break;
      default:
        throw new CustomHttpException(
          `Unsupported AI config type: ${type}`,
          HttpErrorCode.VALIDATION_ERROR
        );
    }

    // 中文注释: 附加用户额外的 prompt 提示
    if (attachPrompt) {
      prompt += `\n\nAdditional instructions: ${attachPrompt}`;
    }
    return prompt;
  }

  /**
   * 中文注释: 源非附件或走“发文件给模型”失败时的兜底，按原逻辑用 cellValue2String 构建 prompt
   */
  private async buildAiPromptWithAttachment(
    aiConfig: IFieldAIConfig,
    record: IRecord,
    table: {
      getField: (
        id: string
      ) => { name: string; type?: string; cellValue2String: (v?: unknown) => string } | undefined;
    }
  ): Promise<string> {
    return this.buildAiPrompt(aiConfig, record, table);
  }

  /**
   * 中文注释: 仅构建“指令”文案，附件内容由大模型通过 FilePart 直接接收，无需塞进 prompt
   */
  private buildInstructionPromptForAttachment(
    aiConfig: IFieldAIConfig,
    sourceFieldName: string
  ): string {
    return this.buildAiPromptFromSourceText(aiConfig, sourceFieldName, '（请查看下方附件内容）');
  }

  /**
   * 中文注释: 附件分流——文档类抽正文，图片类收集为 fileParts；供 AI 填充时文档走 prompt、图片走 FilePart
   */
  private async getAttachmentContentForAi(
    value: IAttachmentCellValue,
    transferMode: 'url' | 'base64'
  ): Promise<{ documentText: string; imageParts: Array<{ data: string; mediaType: string }> }> {
    const bucket = StorageAdapter.getBucket(UploadType.Table);
    const documentChunks: string[] = [];
    const imageParts: Array<{ data: string; mediaType: string }> = [];
    const expireSec = 3600;

    for (const item of value) {
      const token = item?.token;
      if (!token) continue;

      const attachment = await this.prismaService.txClient().attachments.findUnique({
        where: { token, deletedTime: null },
        select: { path: true, mimetype: true },
      });
      if (!attachment?.path) continue;

      const mediaType = attachment.mimetype || 'application/octet-stream';

      if (isDocumentMime(mediaType)) {
        const stream = await this.attachmentsService.storageAdapter.downloadFile(
          bucket,
          attachment.path
        );
        const buffer = await this.streamToBuffer(stream as unknown as Readable);
        const extracted = await extractDocumentText(buffer, mediaType);
        if (extracted) documentChunks.push(extracted);
      } else if (isImageMime(mediaType)) {
        if (transferMode === 'url') {
          const url = await this.attachmentsStorageService.getPreviewUrlByPath(
            bucket,
            attachment.path,
            token,
            expireSec,
            { 'Content-Type': mediaType }
          );
          imageParts.push({ data: url, mediaType });
        } else {
          const stream = await this.attachmentsService.storageAdapter.downloadFile(
            bucket,
            attachment.path
          );
          const buffer = await this.streamToBuffer(stream as unknown as Readable);
          imageParts.push({
            data: buffer.toString('base64'),
            mediaType,
          });
        }
      }
    }

    return {
      documentText: documentChunks.join('\n\n---\n\n'),
      imageParts,
    };
  }

  /**
   * 中文注释: 按系统配置取 URL 或 base64，供 generateTextWithAttachments 发给大模型（仅图片时使用）
   */
  private async getAttachmentFilePartsForAi(
    value: IAttachmentCellValue,
    transferMode: 'url' | 'base64'
  ): Promise<Array<{ data: string; mediaType: string }>> {
    const bucket = StorageAdapter.getBucket(UploadType.Table);
    const parts: Array<{ data: string; mediaType: string }> = [];
    const expireSec = 3600;

    for (const item of value) {
      const token = item?.token;
      if (!token) continue;

      const attachment = await this.prismaService.txClient().attachments.findUnique({
        where: { token, deletedTime: null },
        select: { path: true, mimetype: true },
      });
      if (!attachment?.path) continue;

      const mediaType = attachment.mimetype || 'application/octet-stream';

      if (transferMode === 'url') {
        const url = await this.attachmentsStorageService.getPreviewUrlByPath(
          bucket,
          attachment.path,
          token,
          expireSec,
          { 'Content-Type': mediaType }
        );
        parts.push({ data: url, mediaType });
      } else {
        const stream = await this.attachmentsService.storageAdapter.downloadFile(
          bucket,
          attachment.path
        );
        const buffer = await this.streamToBuffer(stream as unknown as Readable);
        parts.push({
          data: buffer.toString('base64'),
          mediaType,
        });
      }
    }
    return parts;
  }

  /**
   * 中文注释: 将可读流完整读取为 Buffer
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return await new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      );
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  public async validateFieldsAndTypecast<
    T extends {
      fields: Record<string, unknown>;
    },
  >(
    tableId: string,
    records: T[],
    fieldKeyType: FieldKeyType = FieldKeyType.Name,
    typecast: boolean = false,
    ignoreMissingFields: boolean = false
  ) {
    const table = await this.tableDomainQueryService.getTableDomainById(tableId);
    return this.recordModifySharedService.validateFieldsAndTypecast(
      table,
      records,
      fieldKeyType,
      typecast,
      ignoreMissingFields
    );
  }

  async formSubmit(
    tableId: string,
    formSubmitRo: IFormSubmitRo,
    options?: { includeHiddenField?: boolean }
  ): Promise<IRecord> {
    const { viewId, fields, typecast } = formSubmitRo;
    const { includeHiddenField = false } = options ?? {};

    // 1. Validate view exists and is Form type
    await this.prismaService.view
      .findFirstOrThrow({
        where: { id: viewId, tableId, deletedTime: null, type: ViewType.Form },
      })
      .catch(() => {
        throw new CustomHttpException('View is not a form', HttpErrorCode.RESTRICTED_RESOURCE, {
          localization: {
            i18nKey: 'httpErrors.share.viewTypeNotAllowed',
          },
        });
      });

    // 2. Check field visibility - only allow submission of visible fields
    const visibleFields = await this.fieldService.getFieldsByQuery(tableId, {
      viewId,
      filterHidden: !includeHiddenField,
    });
    const visibleFieldIdSet = new Set(visibleFields.map(({ id }) => id));

    if (
      (!visibleFields.length && !isEmpty(fields)) ||
      Object.keys(fields).some((fieldId) => !visibleFieldIdSet.has(fieldId))
    ) {
      throw new CustomHttpException(
        'The form contains hidden fields, submission not allowed.',
        HttpErrorCode.RESTRICTED_RESOURCE,
        {
          localization: {
            i18nKey: 'httpErrors.share.hiddenFieldsSubmissionNotAllowed',
          },
        }
      );
    }

    // 3. Create record with form entry context
    const { records } = await this.prismaService.$tx(async () => {
      this.cls.set('entry', { type: 'form', id: viewId });
      this.cls.set('skipRecordAuditLog', true);
      return this.createRecords(tableId, {
        records: [{ fields }],
        fieldKeyType: FieldKeyType.Id,
        typecast,
      });
    });

    // 4. Emit form audit log
    await this.emitFormAuditLog(tableId, records.length);

    // 5. Validate record creation
    if (records.length === 0) {
      throw new CustomHttpException(
        'The number of successful submit records is 0',
        HttpErrorCode.INTERNAL_SERVER_ERROR,
        {
          localization: {
            i18nKey: 'httpErrors.share.submitRecordsError',
          },
        }
      );
    }

    return records[0];
  }

  private async emitFormAuditLog(tableId: string, length: number) {
    const userId = this.cls.get('user.id');
    const origin = this.cls.get('origin');

    await this.cls.run(async () => {
      this.cls.set('user.id', userId);
      this.cls.set('origin', origin!);
      await this.eventEmitterService.emitAsync(Events.TABLE_RECORD_CREATE_RELATIVE, {
        action: CreateRecordAction.FormSubmit,
        resourceId: tableId,
        recordCount: length,
      });
    });
  }
}
