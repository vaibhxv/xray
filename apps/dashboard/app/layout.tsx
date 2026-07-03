import './globals.css';
import type { Metadata } from 'next';
import { Providers } from './providers';
import { Sidebar } from '@/components/Sidebar';
import { DownloadData } from '@/components/DownloadData';
import { CrawlControls } from '@/components/CrawlControls';

export const metadata: Metadata = {
  title: 'X-ray Data Collection',
  description: 'Raspberry Pi 5 pediatric hand X-ray data collection dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="flex h-screen w-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/40 px-6 py-3">
                <CrawlControls />
                <DownloadData />
              </header>
              <main className="flex-1 overflow-auto p-6">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
