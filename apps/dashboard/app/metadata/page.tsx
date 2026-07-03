'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { MetadataRecord, Paginated } from '@xray/shared';

export default function MetadataPage() {
  const [page, setPage] = useState(1);
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [sex, setSex] = useState('');
  const [candidateOnly, setCandidateOnly] = useState('');
  const [search, setSearch] = useState('');
  const pageSize = 50;

  const { data } = useQuery({
    queryKey: ['metadata', page, minAge, maxAge, sex, candidateOnly, search],
    queryFn: () =>
      fetchJson<Paginated<MetadataRecord>>('/metadata', {
        page,
        pageSize,
        minAge: minAge || undefined,
        maxAge: maxAge || undefined,
        sex: sex || undefined,
        candidateOnly: candidateOnly || undefined,
        search: search || undefined,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Metadata Explorer</h1>

      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Search caption / text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-56" />
        <input type="number" placeholder="Min age" value={minAge} onChange={(e) => { setMinAge(e.target.value); setPage(1); }} className="w-24" />
        <input type="number" placeholder="Max age" value={maxAge} onChange={(e) => { setMaxAge(e.target.value); setPage(1); }} className="w-24" />
        <select value={sex} onChange={(e) => { setSex(e.target.value); setPage(1); }}>
          <option value="">Any sex</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <select value={candidateOnly} onChange={(e) => { setCandidateOnly(e.target.value); setPage(1); }}>
          <option value="">All records</option>
          <option value="true">Candidate hand X-rays only</option>
        </select>
        <span className="text-sm text-slate-400">{data?.total ?? 0} records</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead className="bg-slate-900/80 text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="table-cell">Age</th>
              <th className="table-cell">Sex</th>
              <th className="table-cell">Caption</th>
              <th className="table-cell">Nearby text</th>
              <th className="table-cell">Source title</th>
              <th className="table-cell">Candidate</th>
              <th className="table-cell">Conf.</th>
              <th className="table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800 align-top hover:bg-slate-800/40">
                <td className="table-cell whitespace-nowrap">{r.age ?? '—'}{r.ageText ? <div className="text-xs text-slate-500">{r.ageText}</div> : null}</td>
                <td className="table-cell">{r.sex ?? '—'}</td>
                <td className="table-cell max-w-xs">{r.caption ?? '—'}</td>
                <td className="table-cell max-w-sm text-slate-400">{r.nearbyText ? r.nearbyText.slice(0, 160) : '—'}</td>
                <td className="table-cell max-w-xs truncate">{r.sourceTitle ?? '—'}</td>
                <td className="table-cell">
                  {r.isPediatricHandXray ? (
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">yes</span>
                  ) : (
                    <span className="text-xs text-slate-500">no</span>
                  )}
                </td>
                <td className="table-cell">{r.confidence != null ? r.confidence.toFixed(2) : '—'}</td>
                <td className="table-cell whitespace-nowrap text-slate-400">{formatDate(r.createdAt)}</td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="table-cell text-center text-slate-500">No metadata found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span className="text-sm text-slate-400">Page {page} / {totalPages}</span>
        <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}
