#!/usr/bin/env node

/**
 * Google Distance Matrix API CLI Wrapper
 *
 * Filters places by real travel distance using Google Distance Matrix API.
 * Falls back to haversine (straight-line) distance when API is unavailable.
 *
 * Usage:
 *   node scripts/google-distance.js filter \
 *     --origin='{"lat":37.497,"lng":127.027}' \
 *     --places='[{"id":"1","name":"스타벅스","lat":37.5,"lng":127.03}]' \
 *     --threshold=5000 \
 *     --mode=walking
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const BATCH_SIZE = 25; // Google Distance Matrix max destinations per call

// Check API key
function checkApiKey() {
  if (!API_KEY || API_KEY === 'your_google_places_api_key_here') {
    console.error(JSON.stringify({
      success: false,
      error: 'GOOGLE_PLACES_API_KEY is not set in .env file',
      help: 'Get your API key from https://console.cloud.google.com'
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Calculate straight-line distance between two points using Haversine formula.
 *
 * @param {number} lat1 - Origin latitude
 * @param {number} lon1 - Origin longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters

  const toRad = (deg) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Auto-determine travel mode based on threshold distance.
 *
 * @param {number} threshold - Distance threshold in meters
 * @returns {"walking"|"driving"}
 */
function autoMode(threshold) {
  return threshold <= 2000 ? 'walking' : 'driving';
}

/**
 * Call Google Distance Matrix API for a batch of destinations.
 *
 * @param {{lat: number, lng: number}} origin
 * @param {Array<{lat: number, lng: number}>} destinations
 * @param {string} mode - "driving" | "walking"
 * @returns {Promise<Array<{distance: number, duration: number}|null>>}
 */
async function callDistanceMatrix(origin, destinations, mode) {
  const originsParam = `${origin.lat},${origin.lng}`;
  const destinationsParam = destinations
    .map(d => `${d.lat},${d.lng}`)
    .join('|');

  const params = new URLSearchParams({
    origins: originsParam,
    destinations: destinationsParam,
    mode,
    language: 'ko',
    key: API_KEY
  });

  const url = `${DISTANCE_MATRIX_URL}?${params}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK') {
    throw new Error(`Distance Matrix API error: ${data.status} - ${data.error_message || ''}`);
  }

  const row = data.rows[0];
  if (!row) {
    throw new Error('Distance Matrix API returned no rows');
  }

  return row.elements.map((element) => {
    if (element.status !== 'OK') {
      return null;
    }
    return {
      distance: element.distance.value,   // meters
      duration: element.duration.value    // seconds
    };
  });
}

/**
 * Filter places by real travel distance using Google Distance Matrix API.
 * Falls back to haversine distance on API failure.
 *
 * @param {{lat: number, lng: number}} origin
 * @param {Array<{id: string, name: string, lat: number, lng: number}>} places
 * @param {number} threshold - Distance threshold in meters
 * @param {string|null} modeOverride - Explicit mode ("driving"|"walking"), or null for auto
 * @returns {Promise<object>}
 */
async function filterByDistance(origin, places, threshold, modeOverride) {
  const mode = modeOverride || autoMode(threshold);
  const meta = { apiCalls: 0, threshold, mode };

  // Attempt Google Distance Matrix API
  try {
    checkApiKey();

    const results = []; // {place, distance, duration}

    // Batch requests (max 25 destinations per call)
    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      const elements = await callDistanceMatrix(origin, batch, mode);
      meta.apiCalls++;

      for (let j = 0; j < batch.length; j++) {
        results.push({
          place: batch[j],
          travel: elements[j]  // null if element status was not OK
        });
      }
    }

    // Check if ALL results failed (e.g. Korea routes → ZERO_RESULTS)
    const allFailed = results.every(({ travel }) => !travel);
    if (allFailed) {
      return filterByHaversine(
        origin, places, threshold, mode,
        'Distance Matrix API returned ZERO_RESULTS for all places (한국 내 경로는 Google에서 지원하지 않아 직선거리로 대체합니다)'
      );
    }

    // Filter and annotate
    const passed = [];
    let filteredOut = 0;

    for (const { place, travel } of results) {
      if (!travel) {
        // API couldn't compute distance for this place — use haversine for this one
        const dist = Math.round(haversineDistance(origin.lat, origin.lng, place.lat, place.lng));
        if (dist <= threshold) {
          passed.push({
            ...place,
            travelDistance: dist,
            travelDuration: null,
            travelMode: mode
          });
        } else {
          filteredOut++;
        }
        continue;
      }

      if (travel.distance <= threshold) {
        passed.push({
          ...place,
          travelDistance: travel.distance,
          travelDuration: travel.duration,
          travelMode: mode
        });
      } else {
        filteredOut++;
      }
    }

    // Sort by travel distance ascending
    passed.sort((a, b) => a.travelDistance - b.travelDistance);

    return {
      success: true,
      places: passed,
      filteredOut,
      meta,
      ...(results.some(({ travel }) => !travel) && {
        partialFallback: true,
        partialFallbackMessage: '일부 장소는 직선거리로 계산되었습니다'
      })
    };

  } catch (err) {
    // Fallback to haversine
    return filterByHaversine(origin, places, threshold, mode, err.message);
  }
}

/**
 * Fallback: filter by straight-line haversine distance.
 */
function filterByHaversine(origin, places, threshold, mode, errorMessage) {
  const passed = [];
  let filteredOut = 0;

  for (const place of places) {
    const dist = Math.round(haversineDistance(origin.lat, origin.lng, place.lat, place.lng));

    if (dist <= threshold) {
      passed.push({
        ...place,
        travelDistance: dist,
        travelDuration: null,
        travelMode: mode
      });
    } else {
      filteredOut++;
    }
  }

  passed.sort((a, b) => a.travelDistance - b.travelDistance);

  return {
    success: true,
    places: passed,
    filteredOut,
    fallback: true,
    fallbackMessage: '실거리 계산이 불가하여 직선거리로 필터링했습니다',
    fallbackError: errorMessage,
    meta: { apiCalls: 0, threshold, mode }
  };
}

// CLI
yargs(hideBin(process.argv))
  .command(
    'filter',
    'Filter places by travel distance using Google Distance Matrix API',
    (yargs) => {
      return yargs
        .option('origin', {
          describe: 'Origin point as JSON string {"lat":..., "lng":...}',
          type: 'string',
          demandOption: true
        })
        .option('places', {
          describe: 'JSON array of places [{id, name, lat, lng}]',
          type: 'string',
          demandOption: true
        })
        .option('threshold', {
          describe: 'Maximum travel distance in meters',
          type: 'number',
          demandOption: true
        })
        .option('mode', {
          describe: 'Travel mode: "driving" or "walking" (auto-determined if omitted)',
          type: 'string',
          choices: ['driving', 'walking']
        });
    },
    async (argv) => {
      let origin, places;

      try {
        origin = JSON.parse(argv.origin);
      } catch (e) {
        console.error(JSON.stringify({
          success: false,
          error: 'Invalid JSON for --origin',
          message: e.message
        }, null, 2));
        process.exit(1);
      }

      try {
        places = JSON.parse(argv.places);
      } catch (e) {
        console.error(JSON.stringify({
          success: false,
          error: 'Invalid JSON for --places',
          message: e.message
        }, null, 2));
        process.exit(1);
      }

      if (typeof origin.lat !== 'number' || typeof origin.lng !== 'number') {
        console.error(JSON.stringify({
          success: false,
          error: '--origin must have numeric "lat" and "lng" fields'
        }, null, 2));
        process.exit(1);
      }

      if (!Array.isArray(places) || places.length === 0) {
        console.error(JSON.stringify({
          success: false,
          error: '--places must be a non-empty JSON array'
        }, null, 2));
        process.exit(1);
      }

      const result = await filterByDistance(
        origin,
        places,
        argv.threshold,
        argv.mode || null
      );

      console.log(JSON.stringify(result, null, 2));
    }
  )
  .demandCommand(1, 'You need to specify a command')
  .help()
  .argv;
