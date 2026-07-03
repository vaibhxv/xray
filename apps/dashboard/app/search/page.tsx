'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson, fileUrl } from '@/lib/api';

interface SearchResult {
  term: string;
  images: {
    id: string;
    sourceUrl: string;
    pageUrl: string | null;
    domain: string | null;
    thumbnailPath: string | null;
    age: number | null;
  }[];
  metadata: {
    id: string;
    age: number | null;
    sex: string | null;
    caption: string | null;
    sourceTitle: string | null;
    isPediatricHandXray: boolean | null;
    confidence: number | null;
  }[];
}

export default function SearchPage() {
  const [term, setTerm] = useState('');
  const [age, setAge] = useState('');
  const [domain, setDomain] = useState('');
  const [submitted, setSubmitted] = useState<{ q: string; age: string; domain: string } | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['search', submitted],
    queryFn: () =>
      fetchJson<SearchResult>('/search', {
        q: submitted?.q || undefined,
        age: submitted?.age || undefined,
        domain: submitted?.domain || undefined,
      }),
    enabled: !!submitted,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Search</h1>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted({ q: term, age, domain });
        }}
      >
        <input placeholder="Age, domain, filename, OCR text, caption…" value={term} onChange={(e) => setTerm(e.target.value)} className="w-96" />
        <input type="number" placeholder="Exact age" value={age} onChange={(e) => setAge(e.target.value)} className="w-28" />
        <input placeholder="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} className="w-48" />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {isFetching && <div className="text-sm text-slate-400">Searching…</div>}

      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card">
            <div className="mb-2 text-sm font-medium">Images ({data.images.length})</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.images.map((img) => {
                const thumb = fileUrl(img.thumbnailPath);
                return (
                  <a key={img.id} href={img.sourceUrl} target="_blank" rel="noreferrer" className="block">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-24 w-full rounded object-cover" />
                    ) : (
                      <div className="h-24 w-full rounded bg-slate-800" />
                    )}
                    <div className="mt-1 truncate text-xs text-slate-400">{img.domain}</div>
                    {img.age != null && <div className="text-xs text-sky-300">age {img.age}</div>}
                  </a>
                );
              })}
              {data.images.length === 0 && <div className="text-sm text-slate-500">No image matches.</div>}
            </div>
          </div>

          <div className="card">
            <div className="mb-2 text-sm font-medium">Metadata ({data.metadata.length})</div>
            <div className="space-y-2">
              {data.metadata.map((m) => (
                <div key={m.id} className="rounded border border-slate-800 p-2 text-sm">
                  <div className="flex gap-3 text-slate-300">
                    <span>Age: {m.age ?? '—'}</span>
                    <span>Sex: {m.sex ?? '—'}</span>
                    {m.isPediatricHandXray && <span className="text-emerald-300">candidate</span>}
                  </div>
                  <div className="text-slate-400">{m.caption ?? m.sourceTitle ?? '—'}</div>
                </div>
              ))}
              {data.metadata.length === 0 && <div className="text-sm text-slate-500">No metadata matches.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
