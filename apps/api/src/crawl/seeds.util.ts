import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(API_ROOT, '..', '..');

function resolveSeedFile(): string {
  const configured = process.env.SEED_FILE?.trim();
  if (!configured) return path.join(REPO_ROOT, 'config', 'seeds.txt');
  if (path.isAbsolute(configured)) return path.resolve(configured);
  return path.resolve(REPO_ROOT, configured);
}

/**
 * Load seed URLs from (in priority order):
 *  1. SEED_URLS env var (comma or newline separated)
 *  2. the seed file at SEED_FILE (default config/seeds.txt from repo root)
 * Lines starting with '#' are treated as comments.
 */
export function loadSeeds(): string[] {
  const seeds = new Set<string>();

  const envSeeds = process.env.SEED_URLS ?? '';
  for (const s of envSeeds.split(/[\n,]/)) {
    const t = s.trim();
    if (t && !t.startsWith('#')) seeds.add(t);
  }

  const file = resolveSeedFile();
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const t = line.trim();
        if (t && !t.startsWith('#')) seeds.add(t);
      }
    }
  } catch {
    // ignore unreadable seed file
  }

  return [...seeds];
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
