'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/live', label: 'Live Crawl' },
  { href: '/images', label: 'Image Explorer' },
  { href: '/metadata', label: 'Metadata Explorer' },
  { href: '/search', label: 'Search' },
  { href: '/system', label: 'System Metrics' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900/40 p-4">
      <div className="mb-6">
        <div className="text-lg font-semibold text-sky-400">X-ray Collector</div>
        <div className="text-xs text-slate-500">Raspberry Pi 5</div>
      </div>
      <nav className="flex flex-col gap-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm ${
                active ? 'bg-sky-500/15 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
