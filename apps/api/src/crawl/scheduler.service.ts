import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StateService } from '../state/state.service';
import { CrawlService } from './crawl.service';
import { loadSeeds } from './seeds.util';

/**
 * In-process scheduled jobs (replaces BullMQ/Redis). @nestjs/schedule runs
 * these cron tasks inside the API process — perfect for a single local Pi.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly state: StateService,
    private readonly crawl: CrawlService,
  ) {}

  // Discover new URLs every 30 minutes.
  @Cron('*/30 * * * *', { name: 'discovery' })
  async discover() {
    const job = await this.prisma.crawlJob.create({
      data: { type: 'discovery', status: 'running', startedAt: new Date() },
    });
    try {
      const seeded = await this.crawl.seedUrls(loadSeeds());
      const requeued = await this.crawl.requeueStale(30);
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'done', finishedAt: new Date(), stats: { seeded, requeued } },
      });
      this.logger.log(`Discovery: seeded ${seeded}, requeued ${requeued} stale URLs.`);
    } catch (err: any) {
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), error: String(err?.message ?? err) },
      });
    }
  }

  // Nightly maintenance at 03:00: rehash images, trim logs, vacuum DB.
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'maintenance' })
  async maintenance() {
    const job = await this.prisma.crawlJob.create({
      data: { type: 'maintenance', status: 'running', startedAt: new Date() },
    });
    try {
      await this.crawl.requestRehash();
      await this.state.trimLogs(1000);
      // VACUUM cannot run inside a transaction, so issue it standalone.
      await this.prisma.$executeRawUnsafe('VACUUM (ANALYZE)');
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'done', finishedAt: new Date(), stats: { vacuumed: true } },
      });
      this.logger.log('Nightly maintenance complete (rehash requested, logs trimmed, VACUUM).');
    } catch (err: any) {
      await this.prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'failed', finishedAt: new Date(), error: String(err?.message ?? err) },
      });
    }
  }
}
