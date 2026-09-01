import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateQueryId } from '@teable/core';
import type { IQueryParamsRo, IQueryParamsVo } from '@teable/openapi';
import createServer from 'next';
import { CacheService } from '../../cache/cache.service';
import type { ICacheStore } from '../../cache/types';

@Injectable()
export class NextService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(NextService.name);
  public server!: ReturnType<typeof createServer>;
  // 防止 webpack HMR 重载时重复创建 Next.js 实例导致锁冲突 2026-02-28 17:20:00
  private static starting = false;
  constructor(
    private configService: ConfigService,
    private readonly cacheService: CacheService<ICacheStore>
  ) {}

  private async startNEXTjs() {
    if (NextService.starting) {
      return;
    }
    NextService.starting = true;
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const port = this.configService.get<number>('PORT');
    const nextJsDir = this.configService.get<string>('NEXTJS_DIR');
    try {
      this.server = createServer({
        dev: nodeEnv !== 'production',
        port: port,
        dir: nextJsDir,
        hostname: 'localhost',
        turbopack: true,
      });
      await this.server.prepare();
    } catch (error) {
      NextService.starting = false;
      this.logger.error(error);
    }
  }

  async onModuleInit() {
    if (process.env.BACKEND_SKIP_NEXT_START !== 'true') {
      await this.startNEXTjs();
    }
  }

  async onModuleDestroy() {
    await this.server?.close();
  }

  async saveQueryParams(queryParamsRo: IQueryParamsRo): Promise<IQueryParamsVo> {
    const { params } = queryParamsRo;
    const ttl = 60;
    const queryId = generateQueryId();
    const cacheKey = `query-params:${queryId}` as const;

    await this.cacheService.setDetail(cacheKey, params, ttl);

    return { queryId };
  }
}
