#!/usr/bin/env node

/**
 * Kakao Mobility Directions API CLI Wrapper
 *
 * Uses the same KAKAO_REST_API_KEY as kakao-search.js.
 * Returns the same output format as google-routes.js for interchangeability.
 *
 * Usage:
 *   node scripts/kakao-routes.js route \
 *     --origin='{"lat":37.497,"lng":127.028}' \
 *     --destination='{"lat":37.395,"lng":127.109}' \
 *     --priority=RECOMMEND
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const API_KEY = process.env.KAKAO_REST_API_KEY;
const NAVI_URL = 'https://apis-navi.kakaomobility.com/v1/directions';

function checkApiKey() {
  if (!API_KEY || API_KEY === 'your_rest_api_key_here') {
    console.error(JSON.stringify({
      success: false,
      error: 'KAKAO_REST_API_KEY is not set in .env file',
      help: 'Get your API key from https://developers.kakao.com'
    }, null, 2));
    process.exit(1);
  }
}

/**
 * Extract all coordinates from Kakao route sections.
 *
 * Kakao returns vertexes as a flat array [x, y, x, y, ...]
 * where x = longitude, y = latitude.
 * We convert to [{lat, lng}, ...] to match Google's format.
 */
function extractPolylineFromSections(sections) {
  const coords = [];
  const seen = new Set();

  for (const section of sections) {
    for (const road of section.roads) {
      const v = road.vertexes;
      for (let i = 0; i < v.length; i += 2) {
        const lng = v[i];
        const lat = v[i + 1];
        const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        // Deduplicate consecutive identical points
        if (seen.size === 0 || !seen.has(key)) {
          coords.push({ lat, lng });
          seen.clear();
          seen.add(key);
        }
      }
    }
  }

  return coords;
}

/**
 * Format duration from seconds to human-readable string
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m + 'm' : ''}`;
  return `${m}m`;
}

/**
 * Compute route between two points using Kakao Mobility API.
 *
 * @param {{lat: number, lng: number}} origin
 * @param {{lat: number, lng: number}} destination
 * @param {string} priority - RECOMMEND | TIME | DISTANCE
 * @param {Object} [opts] - Additional options
 * @param {string} [opts.avoid] - Pipe-separated avoid options
 * @returns {Promise<Object>} Same shape as google-routes.js computeRoute
 */
async function computeRoute(origin, destination, priority = 'RECOMMEND', opts = {}) {
  checkApiKey();

  // Kakao uses "x,y" format where x=lng, y=lat
  const params = new URLSearchParams({
    origin: `${origin.lng},${origin.lat}`,
    destination: `${destination.lng},${destination.lat}`,
    priority
  });

  if (opts.avoid) {
    params.set('avoid', opts.avoid);
  }

  try {
    const response = await fetch(`${NAVI_URL}?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `KakaoAK ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}`,
        message: data.msg || JSON.stringify(data)
      };
    }

    if (!data.routes || data.routes.length === 0) {
      return {
        success: false,
        error: 'NO_ROUTES',
        message: 'No routes found between the specified origin and destination'
      };
    }

    const route = data.routes[0];

    if (route.result_code !== 0) {
      return {
        success: false,
        error: `ROUTE_ERROR_${route.result_code}`,
        message: route.result_msg
      };
    }

    const decodedPoints = extractPolylineFromSections(route.sections);

    return {
      success: true,
      distanceMeters: route.summary.distance,
      duration: formatDuration(route.summary.duration),
      durationSeconds: route.summary.duration,
      encodedPolyline: '',  // Kakao doesn't use encoded polylines
      decodedPoints,
      meta: {
        provider: 'kakao',
        priority,
        fare: route.summary.fare,
        bound: route.summary.bound
      }
    };
  } catch (error) {
    return {
      success: false,
      error: 'Network error',
      message: error.message
    };
  }
}

// CLI
yargs(hideBin(process.argv))
  .command('route', 'Compute route between two points', (yargs) => {
    return yargs
      .option('origin', {
        describe: 'Origin as JSON string with lat/lng',
        type: 'string',
        demandOption: true
      })
      .option('destination', {
        describe: 'Destination as JSON string with lat/lng',
        type: 'string',
        demandOption: true
      })
      .option('priority', {
        describe: 'Route priority',
        type: 'string',
        default: 'RECOMMEND',
        choices: ['RECOMMEND', 'TIME', 'DISTANCE']
      })
      .option('avoid', {
        describe: 'Avoid options (pipe-separated): ferries|toll|motorway|schoolzone|uturn',
        type: 'string'
      });
  }, async (argv) => {
    let origin, destination;

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
      destination = JSON.parse(argv.destination);
    } catch (e) {
      console.error(JSON.stringify({
        success: false,
        error: 'Invalid JSON for --destination',
        message: e.message
      }, null, 2));
      process.exit(1);
    }

    const result = await computeRoute(origin, destination, argv.priority, {
      avoid: argv.avoid
    });
    console.log(JSON.stringify(result, null, 2));
  })
  .demandCommand(1, 'You need to specify a command')
  .help()
  .argv;
