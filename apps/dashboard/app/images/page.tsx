'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson, fileUrl } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/format';
import type { ImageRecord, Paginated } from '@xray/shared';

export default function ImagesPage() {
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState('');
  const [duplicate, setDuplicate] = useState('');
  const [hasAge, setHasAge] = useState('');
  const [search, setSearch] = useState('');
  const pageSize = 50;

  const { data: domains } = useQuery({
    queryKey: ['image-domains'],
    queryFn: () => fetchJson<string[]>('/images/domains'),
  });

  const { data } = useQuery({
    queryKey: ['images', page, domain, duplicate, hasAge, search],
    queryFn: () =>
      fetchJson<Paginated<ImageRecord>>('/images', {
        page,
        pageSize,
        domain: domain || undefined,
        duplicate: duplicate || undefined,
        hasAge: hasAge || undefined,
        search: search || undefined,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Image Explorer</h1>

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Search url / OCR text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-64"
        />
        <select value={domain} onChange={(e) => { setDomain(e.target.value); setPage(1); }}>
          <option value="">All domains</option>
          {domains?.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={duplicate} onChange={(e) => { setDuplicate(e.target.value); setPage(1); }}>
          <option value="">All (dupes + unique)</option>
          <option value="false">Unique only</option>
          <option value="true">Duplicates only</option>
        </select>
        <select value={hasAge} onChange={(e) => { setHasAge(e.target.value); setPage(1); }}>
          <option value="">Any age status</option>
          <option value="true">Age detected</option>
          <option value="false">No age</option>
        </select>
        <span className="text-sm text-slate-400">{data?.total ?? 0} images</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="table-cell">Thumb</th>
              <th className="table-cell">Source URL</th>
              <th className="table-cell">Downloaded</th>
              <th className="table-cell">Dims</th>
              <th className="table-cell">Size</th>
              <th className="table-cell">Dup group</th>
              <th className="table-cell">OCR</th>
              <th className="table-cell">Metadata</th>
              <th className="table-cell">Age</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => {
              const thumb = fileUrl(r.thumbnailPath);
              return (
                <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                  <td className="table-cell">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-slate-800" />
                    )}
                  </td>
                  <td className="table-cell max-w-xs truncate">
                    <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-400">
                      {r.sourceUrl}
                    </a>
                    <div className="text-xs text-slate-500">{r.domain}</div>
                  </td>
                  <td className="table-cell whitespace-nowrap text-slate-400">{formatDate(r.downloadedAt)}</td>
                  <td className="table-cell whitespace-nowrap">{r.width}×{r.height}</td>
                  <td className="table-cell whitespace-nowrap">{formatBytes(r.fileSize)}</td>
                  <td className="table-cell">
                    {r.isDuplicate ? (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">dup</span>
                    ) : (
                      <span className="text-xs text-slate-500">unique</span>
                    )}
                  </td>
                  <td className="table-cell text-xs">{r.ocrStatus}</td>
                  <td className="table-cell text-xs">{r.metadataStatus}</td>
                  <td className="table-cell">{r.ageDetected ?? '—'}</td>
                </tr>
              );
            })}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={9} className="table-cell text-center text-slate-500">No images found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span className="text-sm text-slate-400">Page {page} / {totalPages}</span>
        <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
