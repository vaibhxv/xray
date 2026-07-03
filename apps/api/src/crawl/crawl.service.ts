import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StateService } from '../state/state.service';
import { STATE_KEYS } from '@xray/shared';
import { loadSeeds, domainOf } from './seeds.util';

@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly state: StateService,
  ) {}

  /** Insert seed URLs that are not already tracked. Returns number inserted. */
  async seedUrls(urls: string[]): Promise<number> {
    let inserted = 0;
    for (const url of urls) {
      const domain = domainOf(url);
      if (!domain) continue;
      const res = await this.prisma.url.upsert({
        where: { url },
        create: { url, domain, status: 'queued', depth: 0, priority: 10 },
        update: {}, // do not disturb URLs already crawled
      });
      if (res.status === 'queued' && res.attempts === 0) inserted++;
    }
    return inserted;
  }

  async start(): Promise<{ paused: boolean; seeded: number }> {
    await this.state.setFlag(STATE_KEYS.PAUSED, '0');
    const seeded = await this.seedUrls(loadSeeds());
    this.logger.log(`Crawl started. Seeded ${seeded} new URLs.`);
    return { paused: false, seeded };
  }

  async stop(): Promise<{ paused: boolean }> {
    await this.state.setFlag(STATE_KEYS.PAUSED, '1');
    this.logger.log('Crawl paused.');
    return { paused: true };
  }

  async requestRehash(): Promise<void> {
    await this.state.setFlag(STATE_KEYS.REHASH, '1');
  }

  async status() {
    const [paused, queued, inProgress, done, failed, lastJobs] = await Promise.all([
      this.state.getFlag(STATE_KEYS.PAUSED),
      this.prisma.url.count({ where: { status: 'queued' } }),
      this.prisma.url.count({ where: { status: 'in_progress' } }),
      this.prisma.url.count({ where: { status: 'done' } }),
      this.prisma.url.count({ where: { status: 'failed' } }),
      this.prisma.crawlJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return {
      paused: paused === '1',
      urls: { queued, inProgress, done, failed },
      recentJobs: lastJobs,
    };
  }

  /** Re-queue URLs stuck in in_progress for longer than the given minutes. */
  async requeueStale(minutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const res = await this.prisma.url.updateMany({
      where: { status: 'in_progress', updatedAt: { lt: cutoff } },
      data: { status: 'queued' },
    });
    return res.count;
  }
}
