import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import multer from 'multer';
import { AttachmentsCropModule } from '../../attachments/attachments-crop.module';
import { StorageModule } from '../../attachments/plugins/storage.module';
import { AdminOpenApiController } from './admin-open-api.controller';
import { AdminOpenApiService } from './admin-open-api.service';
import { UserModule } from '../../user/user.module';

@Module({
  imports: [
    UserModule,
    AttachmentsCropModule,
    MulterModule.register({
      storage: multer.diskStorage({}),
    }),
    StorageModule,
  ],
  controllers: [AdminOpenApiController],
  exports: [AdminOpenApiService],
  providers: [AdminOpenApiService],
})
export class AdminOpenApiModule {}
