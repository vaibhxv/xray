import { Injectable } from '@nestjs/common';
import * as si from 'systeminformation';
import * as path from 'node:path';
import { statfs } from 'node:fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { StateService } from '../state/state.service';
import { SystemMetrics } from '@xray/shared';

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: StateService,
  ) {}

  private async diskUsage() {
    try {
      const s = await statfs(path.resolve(process.env.STORAGE_ROOT ?? './storage'));
      const total = s.blocks * s.bsize;
      const free = s.bfree * s.bsize;
      return { used: total - free, total };
    } catch {
      return { used: 0, total: 0 };
    }
  }

  private async postgresSize(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) AS size`;
      return Number(rows[0]?.size ?? 0);
    } catch {
      return 0;
    }
  }

  async current(): Promise<SystemMetrics> {
    const [load, mem, disk, temp, net, pgSize, live] = await Promise.all([
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ used: 0, total: 0 }) as any),
      this.diskUsage(),
      si.cpuTemperature().catch(() => ({ main: null }) as any),
      si.networkStats().catch(() => [] as any[]),
      this.postgresSize(),
      this.state.getLive(),
    ]);

    const primaryNet = Array.isArray(net) && net.length ? net[0] : { rx_sec: 0, tx_sec: 0 };

    return {
      ts: new Date().toISOString(),
      cpuPercent: Math.round((load.currentLoad ?? 0) * 10) / 10,
      ramUsedBytes: (mem as any).active ?? (mem as any).used ?? 0,
      ramTotalBytes: (mem as any).total ?? 0,
      diskUsedBytes: disk.used,
      diskTotalBytes: disk.total,
      temperatureC: (temp as any).main ?? null,
      postgresSizeBytes: pgSize,
      crawlThroughputPerMin: Number(live.crawlSpeedPerMin ?? live.requestsPerMin ?? 0),
      netRxBytesPerSec: Math.max(0, Math.round((primaryNet as any).rx_sec ?? 0)),
      netTxBytesPerSec: Math.max(0, Math.round((primaryNet as any).tx_sec ?? 0)),
    };
  }
}
