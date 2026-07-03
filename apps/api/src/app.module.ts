import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.service';
import { StateModule } from './state/state.service';
import { StatsModule } from './stats/stats.module';
import { ImagesModule } from './images/images.module';
import { MetadataModule } from './metadata/metadata.module';
import { SearchModule } from './search/search.module';
import { SystemModule } from './system/system.module';
import { ExportModule } from './export/export.module';
import { CrawlModule } from './crawl/crawl.module';
import { EventsModule } from './events/events.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StateModule,
    StatsModule,
    ImagesModule,
    MetadataModule,
    SearchModule,
    SystemModule,
    ExportModule,
    CrawlModule,
    EventsModule,
    FilesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
