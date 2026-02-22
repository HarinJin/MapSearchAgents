#!/usr/bin/env node

import { mkdir, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const VENDOR_DIR = join(PROJECT_ROOT, 'vendor');

const FILES = [
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    dest: 'leaflet.min.js',
  },
  {
    url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    dest: 'leaflet.min.css',
  },
  {
    url: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    dest: 'leaflet.markercluster.min.js',
  },
  {
    url: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    dest: 'MarkerCluster.css',
  },
  {
    url: 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    dest: 'MarkerCluster.Default.css',
  },
];

const force = process.argv.includes('--force');

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destPath, label) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }
  const buffer = await res.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));
}

async function main() {
  await mkdir(VENDOR_DIR, { recursive: true });

  const total = FILES.length;
  let skipped = 0;
  let downloaded = 0;
  let failed = 0;

  for (let i = 0; i < FILES.length; i++) {
    const { url, dest } = FILES[i];
    const destPath = join(VENDOR_DIR, dest);
    const index = `${i + 1}/${total}`;

    if (!force && (await fileExists(destPath))) {
      console.log(`[${index}] Skipped (already exists): ${dest}`);
      skipped++;
      continue;
    }

    process.stdout.write(`[${index}] Downloading ${dest}...`);
    try {
      await download(url, destPath);
      process.stdout.write(' done\n');
      downloaded++;
    } catch (err) {
      process.stdout.write('\n');
      console.error(`[${index}] Failed: ${err.message}`);
      failed++;
    }
  }

  console.log(
    `\nDone. Downloaded: ${downloaded}, Skipped: ${skipped}, Failed: ${failed}`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
