'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, fetchJson } from '@/lib/api';

interface CrawlStatus {
  paused: boolean;
  urls: { queued: number; inProgress: number; done: number; failed: number };
}

async function post(path: string) {
  const res = await fetch(`${API_BASE}/api${path}`, { method: 'POST' });
  if (!res.ok) throw new Error('request failed');
  return res.json();
}

export function CrawlControls() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['crawl-status'],
    queryFn: () => fetchJson<CrawlStatus>('/crawl/status'),
    refetchInterval: 4000,
  });

  const paused = data?.paused ?? true;

  const toggle = async () => {
    await post(paused ? '/crawl/start' : '/crawl/stop');
    qc.invalidateQueries({ queryKey: ['crawl-status'] });
  };

  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
          paused ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${paused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`}
        />
        {paused ? 'Paused' : 'Crawling'}
      </span>
      <button className="btn btn-ghost" onClick={toggle}>
        {paused ? 'Start crawl' : 'Pause crawl'}
      </button>
    </div>
  );
}
