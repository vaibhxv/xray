/**
 * Shared types, enums and constants for the X-ray data collection platform.
 * Consumed by the NestJS API and the Next.js dashboard.
 */

export const URL_STATUS = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type UrlStatus = (typeof URL_STATUS)[keyof typeof URL_STATUS];

export const PROCESS_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;
export type ProcessStatus = (typeof PROCESS_STATUS)[keyof typeof PROCESS_STATUS];

export const REVIEW_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
} as const;
export type ReviewStatus = (typeof REVIEW_STATUS)[keyof typeof REVIEW_STATUS];

/**
 * Keys used in the `live_state` table to share small pieces of state between
 * the API and the Python worker (replaces the previous Redis usage).
 */
export const STATE_KEYS = {
  LIVE: 'live', // JSON snapshot of live crawl metrics
  PAUSED: 'paused', // '1' | '0'
  REHASH: 'rehash', // '1' | '0'
} as const;

export const RECENT_LOGS_MAX = 200;

export interface OverviewStats {
  urlsQueued: number;
  urlsCrawled: number;
  urlsFailed: number;
  activeWorkers: number;
  crawlSpeedPerMin: number;
  imagesDownloaded: number;
  pdfsDownloaded: number;
  ocrComplete: number;
  metadataExtracted: number;
  duplicateImages: number;
  candidateRecords: number;
  ssdUsageBytes: number;
  ssdTotalBytes: number;
  databaseSizeBytes: number;
}

export interface LiveStats {
  currentUrl: string | null;
  queueSize: number;
  requestsPerMin: number;
  errorsPerMin: number;
  avgDownloadMs: number;
  activeWorkers: number;
}

export interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  url?: string;
}

export interface SystemMetrics {
  ts: string;
  cpuPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  temperatureC: number | null;
  postgresSizeBytes: number;
  crawlThroughputPerMin: number;
  netRxBytesPerSec: number;
  netTxBytesPerSec: number;
}

export interface ImageRecord {
  id: string;
  sourceUrl: string;
  pageUrl: string | null;
  domain: string | null;
  downloadedAt: string;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  format: string | null;
  thumbnailPath: string | null;
  duplicateGroup: string | null;
  isDuplicate: boolean;
  ocrStatus: ProcessStatus;
  metadataStatus: ProcessStatus;
  ageDetected: number | null;
}

export interface MetadataRecord {
  id: string;
  imageId: string | null;
  age: number | null;
  ageText: string | null;
  sex: string | null;
  caption: string | null;
  nearbyText: string | null;
  sourceTitle: string | null;
  isPediatricHandXray: boolean | null;
  confidence: number | null;
  tags: string[];
  summary: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** WebSocket event names emitted by the API to dashboard clients. */
export const WS_EVENTS = {
  LOG: 'log',
  LIVE: 'live',
  STATS: 'stats',
  SYSTEM: 'system',
} as const;
