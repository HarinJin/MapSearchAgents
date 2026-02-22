#!/usr/bin/env node

/**
 * Google Routes API CLI Wrapper
 *
 * Usage:
 *   node scripts/google-routes.js route \
 *     --origin='{"lat":38.207,"lng":128.591}' \
 *     --destination='{"lat":37.278,"lng":127.046}' \
 *     --mode=DRIVE
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

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
 * Decode Google's encoded polyline format into array of {lat, lng} objects.
 * Reference: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
function decodePolyline(encoded) {
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let result = 0;
    let shift = 0;
    let b;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 32);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    // Decode longitude
    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 32);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5
    });
  }

  return coordinates;
}

// Compute route between two points
async function computeRoute(origin, destination, travelMode = 'DRIVE') {
  checkApiKey();

  const body = {
    origin: {
      location: {
        latLng: {
          latitude: origin.lat,
          longitude: origin.lng
        }
      }
    },
    destination: {
      location: {
        latLng: {
          latitude: destination.lat,
          longitude: destination.lng
        }
      }
    },
    travelMode: travelMode,
    polylineEncoding: 'ENCODED_POLYLINE'
  };

  try {
    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.status || `HTTP ${response.status}`,
        message: data.error?.message || 'Unknown API error'
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
    const encodedPolyline = route.polyline?.encodedPolyline || '';
    const decodedPoints = encodedPolyline ? decodePolyline(encodedPolyline) : [];

    return {
      success: true,
      distanceMeters: route.distanceMeters,
      duration: route.duration,
      encodedPolyline: encodedPolyline,
      decodedPoints: decodedPoints,
      meta: {
        travelMode: travelMode
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
        describe: 'Origin as JSON string with lat/lng (e.g. \'{"lat":38.207,"lng":128.591}\')',
        type: 'string',
        demandOption: true
      })
      .option('destination', {
        describe: 'Destination as JSON string with lat/lng (e.g. \'{"lat":37.278,"lng":127.046}\')',
        type: 'string',
        demandOption: true
      })
      .option('mode', {
        describe: 'Travel mode: DRIVE, BICYCLE, WALK, TWO_WHEELER',
        type: 'string',
        default: 'DRIVE',
        choices: ['DRIVE', 'BICYCLE', 'WALK', 'TWO_WHEELER']
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

    const result = await computeRoute(origin, destination, argv.mode);
    console.log(JSON.stringify(result, null, 2));
  })
  .demandCommand(1, 'You need to specify a command')
  .help()
  .argv;
