import { Logger, Injectable } from '@nestjs/common';
import { generateBaseNodeFolderId, HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import type { ICreateBaseNodeFolderRo, IUpdateBaseNodeFolderRo } from '@teable/openapi';
import { ClsService } from 'nestjs-cls';
import { CustomHttpException } from '../../../custom.exception';
import type { IClsStore } from '../../../types/cls';

@Injectable()
export class BaseNodeFolderService {
  private readonly logger = new Logger(BaseNodeFolderService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  private get userId() {
    return this.cls.get('user.id');
  }

  async createFolder(baseId: string, ro: ICreateBaseNodeFolderRo) {
    const { name } = ro;
    const trimmedName = name.trim();

    return this.prismaService.$tx(async (prisma) => {
      const existing = await prisma.baseNodeFolder.findFirst({
        where: { baseId, name: trimmedName },
      });
      if (existing) {
        throw new CustomHttpException(
          'Folder name already exists',
          HttpErrorCode.VALIDATION_ERROR,
          {
            localization: {
              i18nKey: 'httpErrors.baseNode.nameAlreadyExists',
            },
          }
        );
      }

      return prisma.baseNodeFolder.create({
        data: {
          id: generateBaseNodeFolderId(),
          baseId,
          name: trimmedName,
          createdBy: this.userId,
        },
        select: {
          id: true,
          name: true,
        },
      });
    });
  }

  async renameFolder(baseId: string, folderId: string, body: IUpdateBaseNodeFolderRo) {
    const { name } = body;

    return this.prismaService.$tx(async (prisma) => {
      const find = await prisma.baseNodeFolder.findFirst({
        where: { baseId, name, id: { not: folderId } },
      });
      if (find) {
        throw new CustomHttpException(
          'Folder name already exists',
          HttpErrorCode.VALIDATION_ERROR,
          {
            localization: {
              i18nKey: 'httpErrors.baseNode.nameAlreadyExists',
            },
          }
        );
      }

      return prisma.baseNodeFolder.update({
        where: { id: folderId },
        data: { name, lastModifiedBy: this.userId },
        select: {
          id: true,
          name: true,
        },
      });
    });
  }

  async deleteFolder(baseId: string, folderId: string) {
    await this.prismaService.txClient().baseNodeFolder.delete({
      where: { baseId, id: folderId },
    });
  }
}
