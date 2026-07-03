import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(API_ROOT, '..', '..');

export function storageRoot(): string {
  const configured = process.env.STORAGE_ROOT?.trim();
  if (!configured) return path.join(REPO_ROOT, 'storage');
  if (path.isAbsolute(configured)) return path.resolve(configured);
  return path.resolve(REPO_ROOT, configured);
}
