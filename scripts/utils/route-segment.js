/**
 * Route Segmentation Utilities
 *
 * Divides a route into segments for multi-point search
 * Uses straight-line distance (Haversine formula) for MVP
 */

/**
 * Calculate distance between two points using Haversine formula
 *
 * @param {number} lat1 - Start latitude
 * @param {number} lon1 - Start longitude
 * @param {number} lat2 - End latitude
 * @param {number} lon2 - End longitude
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
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
 * Interpolate a point along a straight line between two points
 *
 * @param {Object} start - Start point {x, y}
 * @param {Object} end - End point {x, y}
 * @param {number} fraction - Fraction of the distance (0 to 1)
 * @returns {Object} Interpolated point {x, y}
 */
export function interpolatePoint(start, end, fraction) {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction
  };
}

/**
 * Segment a route into multiple search points
 *
 * @param {Object} start - Start point {x, y} (longitude, latitude)
 * @param {Object} end - End point {x, y} (longitude, latitude)
 * @param {Object} options - Options
 * @param {number} options.interval - Interval between segments in meters (default: 5000)
 * @param {number} options.searchRadius - Search radius at each point in meters (default: 2000)
 * @returns {Array<{point: {x, y}, searchRadius: number, distanceFromStart: number}>}
 */
export function segmentRoute(start, end, options = {}) {
  const interval = options.interval || 5000; // 5km default
  const searchRadius = options.searchRadius || 2000; // 2km default

  // Calculate total distance
  const totalDistance = haversineDistance(start.y, start.x, end.y, end.x);

  // Calculate number of segments
  const numSegments = Math.max(1, Math.floor(totalDistance / interval));

  const segments = [];

  // Add start point
  segments.push({
    point: { x: start.x, y: start.y },
    searchRadius,
    distanceFromStart: 0,
    label: 'start'
  });

  // Add intermediate points
  for (let i = 1; i < numSegments; i++) {
    const fraction = i / numSegments;
    const point = interpolatePoint(start, end, fraction);

    segments.push({
      point,
      searchRadius,
      distanceFromStart: Math.round(totalDistance * fraction),
      label: `segment_${i}`
    });
  }

  // Add end point
  segments.push({
    point: { x: end.x, y: end.y },
    searchRadius,
    distanceFromStart: Math.round(totalDistance),
    label: 'end'
  });

  return {
    totalDistance: Math.round(totalDistance),
    numSegments: segments.length,
    interval,
    searchRadius,
    segments
  };
}

/**
 * Generate search plans for each segment
 *
 * @param {Array} segments - Segments from segmentRoute
 * @param {Object} searchParams - Additional search parameters
 * @returns {Array} Array of search plans
 */
export function generateSearchPlans(segments, searchParams = {}) {
  return segments.segments.map((segment, index) => ({
    step: index + 1,
    action: 'keyword_search',
    params: {
      x: segment.point.x,
      y: segment.point.y,
      radius: segment.searchRadius,
      ...searchParams
    },
    meta: {
      label: segment.label,
      distanceFromStart: segment.distanceFromStart
    }
  }));
}

/**
 * Calculate total length of a polyline
 *
 * @param {Array<{lat, lng}>} polylineCoords - Array of coordinate objects
 * @returns {number} Total distance in meters
 */
export function calculatePolylineLength(polylineCoords) {
  let total = 0;
  for (let i = 1; i < polylineCoords.length; i++) {
    const prev = polylineCoords[i - 1];
    const curr = polylineCoords[i];
    total += haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
  }
  return total;
}

/**
 * Calculate the optimal sampling interval along a polyline
 *
 * @param {number} totalDistance - Total polyline length in meters
 * @param {number} searchRadius - Search radius per sample point in meters
 * @returns {number} Interval in meters
 */
export function calculateOptimalInterval(totalDistance, searchRadius) {
  const maxCoverage = 2 * searchRadius;
  const minPoints = Math.ceil(totalDistance / maxCoverage);
  if (minPoints <= 20) {
    return maxCoverage;
  }
  return Math.ceil(totalDistance / 20);
}

/**
 * Sample points along a polyline at a coverage-optimal interval
 *
 * @param {Array<{lat, lng}>} polylineCoords - Array of coordinate objects
 * @param {number} [searchRadius=5000] - Search radius per sample in meters
 * @returns {Array<{lat, lng, distanceFromStart, label}>}
 */
export function sampleAlongPolyline(polylineCoords, searchRadius = 5000) {
  const totalDistance = calculatePolylineLength(polylineCoords);
  const interval = calculateOptimalInterval(totalDistance, searchRadius);

  const samples = [];
  let accumulated = 0;
  let segmentIndex = 1;

  // Always include the first point
  samples.push({
    lat: polylineCoords[0].lat,
    lng: polylineCoords[0].lng,
    distanceFromStart: 0,
    label: 'start'
  });

  for (let i = 1; i < polylineCoords.length; i++) {
    const prev = polylineCoords[i - 1];
    const curr = polylineCoords[i];
    const segDist = haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    accumulated += segDist;

    if (accumulated >= interval) {
      // Only add if it's not the last point (we add that separately)
      if (i < polylineCoords.length - 1) {
        samples.push({
          lat: curr.lat,
          lng: curr.lng,
          distanceFromStart: Math.round(accumulated),
          label: `segment_${segmentIndex}`
        });
        segmentIndex++;
        // Reset accumulator so next interval is measured from this point
        accumulated = 0;
      }
    }
  }

  // Always include the last point
  const last = polylineCoords[polylineCoords.length - 1];
  samples.push({
    lat: last.lat,
    lng: last.lng,
    distanceFromStart: Math.round(totalDistance),
    label: 'end'
  });

  return samples;
}

/**
 * Segment a route based on actual polyline coordinates
 *
 * Returns the same structure as segmentRoute for API compatibility.
 *
 * @param {Array<{lat, lng}>} polylineCoords - Array of coordinate objects
 * @param {Object} [options={}]
 * @param {number} [options.searchRadius=5000] - Search radius per sample in meters
 * @returns {{ totalDistance, numSegments, interval, searchRadius, segments }}
 */
export function segmentRouteByPolyline(polylineCoords, options = {}) {
  const searchRadius = options.searchRadius !== undefined ? options.searchRadius : 5000;
  const totalDistance = calculatePolylineLength(polylineCoords);
  const interval = calculateOptimalInterval(totalDistance, searchRadius);
  const points = sampleAlongPolyline(polylineCoords, searchRadius);

  return {
    totalDistance: Math.round(totalDistance),
    numSegments: points.length,
    interval,
    searchRadius,
    segments: points.map(p => ({
      point: { x: p.lng, y: p.lat },
      searchRadius,
      distanceFromStart: p.distanceFromStart,
      label: p.label
    }))
  };
}

/**
 * Generate search plans from a polyline segment result
 *
 * Delegates to generateSearchPlans since the output structure is identical.
 *
 * @param {Object} segmentResult - Result from segmentRouteByPolyline
 * @param {Object} [searchParams={}] - Additional search parameters
 * @returns {Array} Array of search plans
 */
export function generateSearchPlansFromPolyline(segmentResult, searchParams = {}) {
  return generateSearchPlans(segmentResult, searchParams);
}

export default {
  haversineDistance,
  interpolatePoint,
  segmentRoute,
  generateSearchPlans,
  calculatePolylineLength,
  calculateOptimalInterval,
  sampleAlongPolyline,
  segmentRouteByPolyline,
  generateSearchPlansFromPolyline
};
