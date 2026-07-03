import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { StatsModule } from '../stats/stats.module';
import { SystemModule } from '../system/system.module';

@Module({
  imports: [StatsModule, SystemModule],
  providers: [EventsGateway],
})
export class EventsModule {}
