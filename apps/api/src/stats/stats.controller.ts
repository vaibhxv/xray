import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('overview')
  overview() {
    return this.stats.overview();
  }

  @Get('live')
  live() {
    return this.stats.live();
  }

  @Get('logs')
  logs(@Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 100, 1), 200);
    return this.stats.recentLogs(n);
  }
}
