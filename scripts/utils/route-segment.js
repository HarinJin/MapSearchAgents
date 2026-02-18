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

export default {
  haversineDistance,
  interpolatePoint,
  segmentRoute,
  generateSearchPlans
};
