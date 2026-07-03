'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api';
import { useWsEvent, useWsBuffer } from '@/lib/ws';
import { StatCard } from '@/components/StatCard';
import { formatNumber } from '@/lib/format';
import type { LiveStats, LogEntry } from '@xray/shared';

export default function LivePage() {
  const { data } = useQuery({
    queryKey: ['live'],
    queryFn: () => fetchJson<LiveStats>('/stats/live'),
    refetchInterval: 3000,
  });
  const live = useWsEvent<LiveStats>('live') ?? data;
  const wsLogs = useWsBuffer<LogEntry>('log', 200);

  const { data: initialLogs } = useQuery({
    queryKey: ['logs'],
    queryFn: () => fetchJson<LogEntry[]>('/stats/logs', { limit: 100 }),
    refetchInterval: false,
  });

  const logs = wsLogs.length ? wsLogs : initialLogs ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Live Crawl</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Queue size" value={formatNumber(live?.queueSize)} />
        <StatCard label="Requests / min" value={formatNumber(live?.requestsPerMin)} />
        <StatCard label="Errors / min" value={formatNumber(live?.errorsPerMin)} />
        <StatCard label="Avg download" value={`${formatNumber(live?.avgDownloadMs)} ms`} />
        <StatCard label="Active workers" value={formatNumber(live?.activeWorkers)} />
      </div>

      <div className="card">
        <div className="text-xs uppercase tracking-wide text-slate-400">Current URL</div>
        <div className="mt-1 truncate text-sm text-sky-300">{live?.currentUrl || '—'}</div>
      </div>

      <div className="card">
        <div className="mb-2 text-sm font-medium text-slate-300">Recent logs</div>
        <div className="max-h-[50vh] overflow-auto font-mono text-xs">
          {logs.length === 0 && <div className="text-slate-500">No log activity yet.</div>}
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2 border-b border-slate-800/60 py-1">
              <span className="text-slate-500">{l.ts}</span>
              <span
                className={
                  l.level === 'error'
                    ? 'text-red-400'
                    : l.level === 'warn'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }
              >
                [{l.stage}]
              </span>
              <span className="text-slate-300">{l.message}</span>
              {l.url && <span className="truncate text-slate-500">{l.url}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
