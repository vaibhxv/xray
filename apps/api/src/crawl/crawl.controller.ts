import { Body, Controller, Get, Post } from '@nestjs/common';
import { CrawlService } from './crawl.service';

@Controller('crawl')
export class CrawlController {
  constructor(private readonly crawl: CrawlService) {}

  @Get('status')
  status() {
    return this.crawl.status();
  }

  @Post('start')
  start() {
    return this.crawl.start();
  }

  @Post('stop')
  stop() {
    return this.crawl.stop();
  }

  @Post('seed')
  seed(@Body('urls') urls: string[] = []) {
    const clean = (Array.isArray(urls) ? urls : [])
      .map((u) => String(u).trim())
      .filter((u) => /^https?:\/\//i.test(u));
    return this.crawl.seedUrls(clean).then((inserted) => ({ inserted }));
  }
}
