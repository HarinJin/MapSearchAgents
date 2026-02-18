/**
 * Review Filtering Utilities
 *
 * Note: Kakao API does not provide direct access to review text.
 * This module provides:
 * 1. Placeholder for future review filtering
 * 2. place_url based approach for user verification
 * 3. Basic keyword matching in available fields
 */

/**
 * Filter places by matching keywords in available fields
 * (place_name, category, address)
 *
 * @param {Array} places - Array of place objects
 * @param {Object} options - Filter options
 * @param {string[]} options.includeKeywords - Keywords that should be present
 * @param {string[]} options.excludeKeywords - Keywords that should NOT be present
 * @returns {Array} Filtered places
 */
export function filterByKeywords(places, options = {}) {
  const includeKeywords = options.includeKeywords || [];
  const excludeKeywords = options.excludeKeywords || [];

  return places.filter(place => {
    const searchText = [
      place.place_name,
      place.category,
      place.address
    ].filter(Boolean).join(' ').toLowerCase();

    // Check exclude keywords first
    const hasExcluded = excludeKeywords.some(keyword =>
      searchText.includes(keyword.toLowerCase())
    );
    if (hasExcluded) return false;

    // If no include keywords, accept all remaining
    if (includeKeywords.length === 0) return true;

    // Check if any include keyword matches
    return includeKeywords.some(keyword =>
      searchText.includes(keyword.toLowerCase())
    );
  });
}

/**
 * Prepare place URLs for user to manually check reviews
 *
 * @param {Array} places - Array of place objects with place_url
 * @param {string[]} reviewKeywords - Keywords user should look for in reviews
 * @returns {Array} Places with review check instructions
 */
export function prepareReviewCheck(places, reviewKeywords = []) {
  return places.map(place => ({
    ...place,
    review_check: {
      url: place.place_url,
      keywords_to_check: reviewKeywords,
      instruction: reviewKeywords.length > 0
        ? `Please check reviews for: ${reviewKeywords.join(', ')}`
        : 'Please check the place reviews'
    }
  }));
}

/**
 * Sort places by relevance score based on keyword matching
 *
 * @param {Array} places - Array of place objects
 * @param {string[]} keywords - Keywords to match
 * @returns {Array} Sorted places with relevance scores
 */
export function sortByRelevance(places, keywords) {
  return places.map(place => {
    const searchText = [
      place.place_name,
      place.category,
      place.address
    ].filter(Boolean).join(' ').toLowerCase();

    const matchCount = keywords.reduce((count, keyword) => {
      return count + (searchText.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);

    return {
      ...place,
      relevance_score: matchCount / keywords.length
    };
  }).sort((a, b) => b.relevance_score - a.relevance_score);
}

/**
 * Remove duplicate places by place_url or coordinates
 *
 * @param {Array} places - Array of place objects
 * @returns {Array} Deduplicated places
 */
export function removeDuplicates(places) {
  const seen = new Set();

  return places.filter(place => {
    // Use place_url as primary key, fallback to coordinates
    const key = place.place_url || `${place.x},${place.y}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/**
 * Sort places by distance from a reference point
 *
 * @param {Array} places - Array of place objects with distance field
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array} Sorted places
 */
export function sortByDistance(places, order = 'asc') {
  return [...places].sort((a, b) => {
    const distA = a.distance || Infinity;
    const distB = b.distance || Infinity;
    return order === 'asc' ? distA - distB : distB - distA;
  });
}

export default {
  filterByKeywords,
  prepareReviewCheck,
  sortByRelevance,
  removeDuplicates,
  sortByDistance
};
