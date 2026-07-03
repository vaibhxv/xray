import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { STATE_KEYS } from '@xray/shared';

/**
 * PostgreSQL-backed shared state (replaces Redis for this local-only app).
 * Stores the live crawl snapshot and control flags in the `live_state` table
 * and reads crawl logs from the `crawl_logs` table.
 */
@Injectable()
export class StateService {
  constructor(private readonly prisma: PrismaService) {}

  async getFlag(key: string): Promise<string | null> {
    const row = await this.prisma.liveState.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async setFlag(key: string, value: string): Promise<void> {
    await this.prisma.liveState.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  async getLive(): Promise<Record<string, string>> {
    const row = await this.prisma.liveState.findUnique({ where: { key: STATE_KEYS.LIVE } });
    if (!row) return {};
    try {
      return JSON.parse(row.value) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async recentLogs(limit = 100) {
    return this.prisma.crawlLog.findMany({ orderBy: { id: 'desc' }, take: limit });
  }

  async logsAfter(afterId: number, limit = 200) {
    return this.prisma.crawlLog.findMany({
      where: { id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  async latestLogId(): Promise<number> {
    const row = await this.prisma.crawlLog.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    return row?.id ?? 0;
  }

  async trimLogs(keep = 1000): Promise<void> {
    const marker = await this.prisma.crawlLog.findMany({
      orderBy: { id: 'desc' },
      skip: keep,
      take: 1,
      select: { id: true },
    });
    if (marker.length) {
      await this.prisma.crawlLog.deleteMany({ where: { id: { lte: marker[0].id } } });
    }
  }
}

@Global()
@Module({
  providers: [StateService],
  exports: [StateService],
})
export class StateModule {}
