import { Module } from '@nestjs/common';
import { DbProvider } from '../../db-provider/db.provider';
import { RecordQueryBuilderModule } from '../record/query-builder';
import { RecordQueryService } from '../record/record-query.service';
import { TableDomainQueryModule } from '../table-domain';
import { UserModule } from '../user/user.module';
import { BatchService } from './batch.service';
import { FieldCalculationService } from './field-calculation.service';
import { LinkService } from './link.service';
import { ReferenceService } from './reference.service';
import { SystemFieldService } from './system-field.service';

@Module({
  imports: [RecordQueryBuilderModule, TableDomainQueryModule, UserModule],
  providers: [
    DbProvider,
    RecordQueryService,
    BatchService,
    ReferenceService,
    LinkService,
    FieldCalculationService,
    SystemFieldService,
  ],
  exports: [
    BatchService,
    ReferenceService,
    LinkService,
    FieldCalculationService,
    SystemFieldService,
    RecordQueryService,
  ],
})
export class CalculationModule {}
