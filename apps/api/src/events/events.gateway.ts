import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { Server } from 'socket.io';
import { StateService } from '../state/state.service';
import { StatsService } from '../stats/stats.service';
import { SystemService } from '../system/system.service';
import { WS_EVENTS } from '@xray/shared';

@WebSocketGateway({ cors: { origin: true } })
export class EventsGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsGateway.name);
  private timers: NodeJS.Timeout[] = [];
  private lastLogId = 0;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly state: StateService,
    private readonly stats: StatsService,
    private readonly system: SystemService,
  ) {}

  async afterInit() {
    // Start streaming only logs created from now on.
    this.lastLogId = await this.state.latestLogId().catch(() => 0);

    // Poll new crawl logs from PostgreSQL and push them to clients.
    this.timers.push(
      setInterval(async () => {
        try {
          const logs = await this.state.logsAfter(this.lastLogId, 200);
          for (const log of logs) {
            this.lastLogId = Math.max(this.lastLogId, log.id);
            this.server.emit(WS_EVENTS.LOG, {
              ts: log.ts.toISOString(),
              level: log.level,
              stage: log.stage,
              message: log.message,
              url: log.url ?? undefined,
            });
          }
        } catch (e) {
          this.logger.debug(`log poll failed: ${e}`);
        }
      }, 1500),
    );

    // Periodically push live/system/overview snapshots.
    this.timers.push(
      setInterval(async () => {
        try {
          this.server.emit(WS_EVENTS.LIVE, await this.stats.live());
        } catch (e) {
          this.logger.debug(`live emit failed: ${e}`);
        }
      }, 2000),
    );

    this.timers.push(
      setInterval(async () => {
        try {
          this.server.emit(WS_EVENTS.SYSTEM, await this.system.current());
        } catch (e) {
          this.logger.debug(`system emit failed: ${e}`);
        }
      }, 3000),
    );

    this.timers.push(
      setInterval(async () => {
        try {
          this.server.emit(WS_EVENTS.STATS, await this.stats.overview());
        } catch (e) {
          this.logger.debug(`stats emit failed: ${e}`);
        }
      }, 5000),
    );

    this.logger.log('WebSocket gateway initialised (PostgreSQL-backed, no Redis).');
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }
}
