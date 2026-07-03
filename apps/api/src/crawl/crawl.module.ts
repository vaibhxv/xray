import { Module } from '@nestjs/common';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './crawl.service';
import { SchedulerService } from './scheduler.service';

@Module({
  controllers: [CrawlController],
  providers: [CrawlService, SchedulerService],
  exports: [CrawlService],
})
export class CrawlModule {}
