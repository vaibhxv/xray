export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';

export async function fetchJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${API_BASE}/api${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Build a URL to a stored file (thumbnail/image/pdf) given its relative path. */
export function fileUrl(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  return `${API_BASE}/api/files/${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

export const exportUrls = {
  all: `${API_BASE}/api/export/all.zip`,
  csv: `${API_BASE}/api/export/records.csv`,
  json: `${API_BASE}/api/export/records.json`,
  summary: `${API_BASE}/api/export/summary`,
};
