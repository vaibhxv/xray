'use client';

import { useQuery } from '@tanstack/react-query';
import { exportUrls, fetchJson } from '@/lib/api';
import { formatNumber } from '@/lib/format';

interface ExportSummary {
  images: number;
  pdfs: number;
  metadata: number;
  candidates: number;
}

export function DownloadData() {
  const { data } = useQuery({
    queryKey: ['export-summary'],
    queryFn: () => fetchJson<ExportSummary>('/export/summary'),
    refetchInterval: 15_000,
  });

  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-right text-xs text-slate-400 md:block">
        <div>{formatNumber(data?.metadata)} records · {formatNumber(data?.images)} images</div>
        <div>{formatNumber(data?.candidates)} candidate hand X-rays</div>
      </div>
      <a className="btn btn-ghost" href={exportUrls.csv} download>
        CSV
      </a>
      <a className="btn btn-ghost" href={exportUrls.json} download>
        JSON
      </a>
      <a className="btn btn-primary" href={exportUrls.all} download>
        Download all data
      </a>
    </div>
  );
}
