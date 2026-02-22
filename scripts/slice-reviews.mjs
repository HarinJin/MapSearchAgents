#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve } from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('categories', {
    alias: 'c',
    type: 'string',
    description: 'Path to categories.json',
    demandOption: true,
  })
  .option('details', {
    alias: 'd',
    type: 'string',
    description: 'Path to details-raw.json',
    demandOption: true,
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    description: 'Path for output sliced JSON (default: derived from categories path)',
  })
  .help()
  .argv;

const categoriesPath = resolve(argv.categories);
const detailsPath = resolve(argv.details);
const outputPath = argv.output
  ? resolve(argv.output)
  : categoriesPath.replace(/-categories\.json$/, '-sliced.json');

const categories = JSON.parse(readFileSync(categoriesPath, 'utf-8'));
const details = JSON.parse(readFileSync(detailsPath, 'utf-8'));

// Build placeId -> { name, reviews[] } map
const placeMap = new Map();
let totalReviews = 0;

for (const place of details) {
  const reviews = place.reviews ?? [];
  totalReviews += reviews.length;
  placeMap.set(place.place_id, {
    name: place.name,
    reviews,
  });
}

// Collect all placeIds referenced by any section
const referencedIds = new Set();
for (const section of (categories.sections ?? [])) {
  for (const id of (section.placeIds ?? [])) {
    referencedIds.add(id);
  }
}

// Build deduplicated reviewsByPlace (reviews stored once, sections reference by placeId)
const reviewsByPlace = {};
let slicedReviews = 0;

for (const placeId of referencedIds) {
  const entry = placeMap.get(placeId);
  if (!entry) continue;

  reviewsByPlace[placeId] = {
    placeName: entry.name,
    reviews: entry.reviews.map((review) => {
      const text = typeof review.text === 'string'
        ? review.text.slice(0, 200)
        : '';
      slicedReviews++;
      return {
        author: review.author ?? null,
        rating: review.rating ?? null,
        text,
      };
    }),
  };
}

// Sections only reference placeIds (no duplicated review data)
const sections = (categories.sections ?? []).map((section) => ({
  id: section.id,
  placeIds: section.placeIds ?? [],
}));

const output = {
  meta: {
    categoriesFile: categoriesPath,
    detailsFile: detailsPath,
    createdAt: new Date().toISOString(),
    totalReviews,
    slicedReviews,
    referencedPlaces: referencedIds.size,
  },
  reviewsByPlace,
  sections,
};

const json = JSON.stringify(output, null, 2);
writeFileSync(outputPath, json, 'utf-8');

const outputSize = statSync(outputPath).size;
const kb = (outputSize / 1024).toFixed(1);

console.log(`Categories: ${categoriesPath}`);
console.log(`Details:    ${detailsPath}`);
console.log(`Output:     ${outputPath}`);
console.log(`Total reviews in raw:  ${totalReviews}`);
console.log(`Sliced reviews output: ${slicedReviews}`);
console.log(`Output file size:      ${kb} KB`);
