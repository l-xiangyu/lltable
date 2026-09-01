import { Module } from '@nestjs/common';
import { EventJobModule } from '../../../event-emitter/event-job/event-job.module';
import { AttachmentsStorageModule } from '../../attachments/attachments-storage.module';
import { AttachmentsModule } from '../../attachments/attachments.module';
import { CalculationModule } from '../../calculation/calculation.module';
import { CollaboratorModule } from '../../collaborator/collaborator.module';
import { FieldCalculateModule } from '../../field/field-calculate/field-calculate.module';
import { FieldModule } from '../../field/field.module';
import { TableDomainQueryModule } from '../../table-domain';
import { ViewOpenApiModule } from '../../view/open-api/view-open-api.module';
import { ViewModule } from '../../view/view.module';
import { AiModule } from '../../ai/ai.module';
import { RecordModifyModule } from '../record-modify/record-modify.module';
import { RecordModule } from '../record.module';
import { RecordOpenApiController } from './record-open-api.controller';
import { RecordOpenApiService } from './record-open-api.service';
import { AI_AUTO_FILL_QUEUE } from './ai-auto-fill.constants';
import { AiAutoFillProcessor } from './ai-auto-fill.processor';

@Module({
  imports: [
    RecordModule,
    RecordModifyModule,
    FieldCalculateModule,
    FieldModule,
    CalculationModule,
    AttachmentsStorageModule,
    AttachmentsModule,
    CollaboratorModule,
    ViewModule,
    ViewOpenApiModule,
    TableDomainQueryModule,
    AiModule,
    EventJobModule.registerQueue(AI_AUTO_FILL_QUEUE),
  ],
  controllers: [RecordOpenApiController],
  providers: [RecordOpenApiService, AiAutoFillProcessor],
  exports: [RecordOpenApiService],
})
export class RecordOpenApiModule {}
