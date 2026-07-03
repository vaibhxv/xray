#!/usr/bin/env node
/**
 * Seed the crawl frontier from config/seeds.txt by POSTing to the API.
 * Usage: node scripts/seed-urls.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const apiBase = (process.env.API_URL || `http://localhost:${process.env.API_PORT || 4000}`).replace(/\/$/, '');
const seedFile = process.env.SEED_FILE || resolve(repoRoot, 'config/seeds.txt');

let content = '';
try {
  content = readFileSync(seedFile, 'utf8');
} catch (e) {
  console.error(`Could not read seed file at ${seedFile}: ${e.message}`);
  process.exit(1);
}

const urls = content
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && /^https?:\/\//i.test(l));

if (urls.length === 0) {
  console.error('No seed URLs found. Add some to config/seeds.txt first.');
  process.exit(1);
}

const res = await fetch(`${apiBase}/api/crawl/seed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ urls }),
});

if (!res.ok) {
  console.error(`Seeding failed: HTTP ${res.status}`);
  process.exit(1);
}

const data = await res.json();
console.log(`Seeded ${data.inserted} new URLs (from ${urls.length} provided).`);
