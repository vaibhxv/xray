import { Injectable } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { StateService } from '../state/state.service';
import { OverviewStats, LiveStats } from '@xray/shared';
import { storageRoot } from '../storage-root';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: StateService,
  ) {}

  private storageRoot(): string {
    return storageRoot();
  }

  private async diskUsage(): Promise<{ used: number; total: number }> {
    try {
      const s = await statfs(this.storageRoot());
      const total = s.blocks * s.bsize;
      const free = s.bfree * s.bsize;
      return { used: total - free, total };
    } catch {
      return { used: 0, total: 0 };
    }
  }

  private async databaseSize(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) AS size`;
      return Number(rows[0]?.size ?? 0);
    } catch {
      return 0;
    }
  }

  async overview(): Promise<OverviewStats> {
    const [
      urlsQueued,
      urlsCrawled,
      urlsFailed,
      imagesDownloaded,
      pdfsDownloaded,
      ocrComplete,
      metadataExtracted,
      duplicateImages,
      candidateRecords,
      disk,
      dbSize,
      live,
    ] = await Promise.all([
      this.prisma.url.count({ where: { status: 'queued' } }),
      this.prisma.url.count({ where: { status: 'done' } }),
      this.prisma.url.count({ where: { status: 'failed' } }),
      this.prisma.image.count(),
      this.prisma.pdf.count(),
      this.prisma.image.count({ where: { ocrStatus: 'done' } }),
      this.prisma.metadata.count(),
      this.prisma.image.count({ where: { isDuplicate: true } }),
      this.prisma.metadata.count({ where: { isPediatricHandXray: true } }),
      this.diskUsage(),
      this.databaseSize(),
      this.state.getLive(),
    ]);

    return {
      urlsQueued,
      urlsCrawled,
      urlsFailed,
      activeWorkers: Number(live.activeWorkers ?? 0),
      crawlSpeedPerMin: Number(live.crawlSpeedPerMin ?? live.requestsPerMin ?? 0),
      imagesDownloaded,
      pdfsDownloaded,
      ocrComplete,
      metadataExtracted,
      duplicateImages,
      candidateRecords,
      ssdUsageBytes: disk.used,
      ssdTotalBytes: disk.total,
      databaseSizeBytes: dbSize,
    };
  }

  async live(): Promise<LiveStats> {
    const [live, queueSize] = await Promise.all([
      this.state.getLive(),
      this.prisma.url.count({ where: { status: 'queued' } }),
    ]);
    return {
      currentUrl: live.currentUrl || null,
      queueSize,
      requestsPerMin: Number(live.requestsPerMin ?? 0),
      errorsPerMin: Number(live.errorsPerMin ?? 0),
      avgDownloadMs: Number(live.avgDownloadMs ?? 0),
      activeWorkers: Number(live.activeWorkers ?? 0),
    };
  }

  async recentLogs(limit = 100) {
    return this.state.recentLogs(limit);
  }
}
