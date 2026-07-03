'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api';
import { useWsEvent } from '@/lib/ws';
import { StatCard } from '@/components/StatCard';
import { formatBytes, formatNumber } from '@/lib/format';
import type { OverviewStats } from '@xray/shared';

export default function OverviewPage() {
  const { data } = useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchJson<OverviewStats>('/stats/overview'),
  });
  const live = useWsEvent<OverviewStats>('stats');
  const s = live ?? data;

  const ssdPct =
    s && s.ssdTotalBytes > 0 ? Math.round((s.ssdUsageBytes / s.ssdTotalBytes) * 100) : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="URLs queued" value={formatNumber(s?.urlsQueued)} />
        <StatCard label="URLs crawled" value={formatNumber(s?.urlsCrawled)} />
        <StatCard label="Active workers" value={formatNumber(s?.activeWorkers)} />
        <StatCard label="Crawl speed" value={`${formatNumber(s?.crawlSpeedPerMin)}/min`} />
        <StatCard label="Images downloaded" value={formatNumber(s?.imagesDownloaded)} />
        <StatCard label="PDFs downloaded" value={formatNumber(s?.pdfsDownloaded)} />
        <StatCard label="OCR complete" value={formatNumber(s?.ocrComplete)} />
        <StatCard label="Metadata extracted" value={formatNumber(s?.metadataExtracted)} />
        <StatCard label="Duplicate images" value={formatNumber(s?.duplicateImages)} />
        <StatCard
          label="Candidate records"
          value={formatNumber(s?.candidateRecords)}
          hint="Likely pediatric hand X-rays"
        />
        <StatCard
          label="SSD usage"
          value={`${formatBytes(s?.ssdUsageBytes)}`}
          hint={`${ssdPct}% of ${formatBytes(s?.ssdTotalBytes)}`}
        />
        <StatCard label="Database size" value={formatBytes(s?.databaseSizeBytes)} />
      </div>
      <p className="text-sm text-slate-500">
        Use the “Download all data” button (top right) to export the full dataset (images, PDFs,
        thumbnails and a metadata manifest) as a single ZIP for model training on another machine.
      </p>
    </div>
  );
}
