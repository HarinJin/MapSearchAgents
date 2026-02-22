#!/usr/bin/env node

/**
 * Google Places API CLI Wrapper
 *
 * Usage:
 *   node scripts/google-places.js find "장소명" --lat=37.5 --lng=127.0
 *   node scripts/google-places.js details PLACE_ID --fields=opening_hours,rating
 *   node scripts/google-places.js check-open PLACE_ID
 *   node scripts/google-places.js reviews PLACE_ID
 *   node scripts/google-places.js summarize PLACE_ID
 *   node scripts/google-places.js enrich --places='[{"name":"...", "lat":..., "lng":...}]'
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

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

// Find place by text query
async function findPlace(query, lat, lng) {
  checkApiKey();

  const params = new URLSearchParams({
    input: query,
    inputtype: 'textquery',
    fields: 'place_id,name,formatted_address,geometry',
    key: API_KEY
  });

  // Add location bias if coordinates provided
  if (lat && lng) {
    params.append('locationbias', `point:${lat},${lng}`);
  }

  const url = `${BASE_URL}/findplacefromtext/json?${params}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.candidates.length > 0) {
      const place = data.candidates[0];
      return {
        success: true,
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        location: place.geometry?.location
      };
    } else if (data.status === 'ZERO_RESULTS') {
      return {
        success: false,
        error: 'Place not found',
        query: query
      };
    } else {
      return {
        success: false,
        error: data.status,
        message: data.error_message
      };
    }
  } catch (error) {
    return {
      success: false,
      error: 'Network error',
      message: error.message
    };
  }
}

// Get place details - returns all requested fields dynamically
async function getPlaceDetails(placeId, fields = 'name,formatted_address,rating,user_ratings_total,opening_hours,business_status,url,types,formatted_phone_number,reviews,photos,editorial_summary') {
  checkApiKey();

  const params = new URLSearchParams({
    place_id: placeId,
    fields: fields,
    language: 'ko',
    key: API_KEY
  });

  const url = `${BASE_URL}/details/json?${params}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK') {
      const result = data.result;

      // Build response dynamically from available fields
      const response_obj = {
        success: true,
        place_id: placeId
      };

      // Core fields
      if (result.name !== undefined) response_obj.name = result.name;
      if (result.formatted_address !== undefined) response_obj.address = result.formatted_address;
      if (result.formatted_phone_number !== undefined) response_obj.phone = result.formatted_phone_number;
      if (result.url !== undefined) response_obj.url = result.url;
      if (result.types !== undefined) response_obj.types = result.types;
      if (result.business_status !== undefined) response_obj.business_status = result.business_status;

      // Rating
      if (result.rating !== undefined) response_obj.rating = result.rating;
      if (result.user_ratings_total !== undefined) response_obj.review_count = result.user_ratings_total;

      // Opening hours
      if (result.opening_hours) {
        response_obj.opening_hours = {
          open_now: result.opening_hours.open_now,
          periods: result.opening_hours.periods,
          weekday_text: result.opening_hours.weekday_text
        };
      }

      // Photos
      if (result.photos?.length > 0) {
        response_obj.photos = result.photos.slice(0, 3).map(p => ({
          photo_reference: p.photo_reference,
          width: p.width,
          height: p.height,
          url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${API_KEY}`
        }));
      }

      // Editorial summary (Google's own description)
      if (result.editorial_summary) {
        response_obj.editorial_summary = result.editorial_summary.overview;
      }

      // Reviews
      if (result.reviews?.length > 0) {
        response_obj.reviews = result.reviews.map(r => ({
          author: r.author_name,
          rating: r.rating,
          text: r.text,
          time: r.relative_time_description,
          language: r.language
        }));
      }

      return response_obj;
    } else {
      return {
        success: false,
        error: data.status,
        message: data.error_message
      };
    }
  } catch (error) {
    return {
      success: false,
      error: 'Network error',
      message: error.message
    };
  }
}

// Check if place is currently open and get closing time
async function checkOpen(placeId) {
  const details = await getPlaceDetails(placeId, 'opening_hours,business_status,name');

  if (!details.success) {
    return details;
  }

  const openingHours = details.opening_hours;

  if (!openingHours) {
    return {
      success: true,
      place_id: placeId,
      open_now: null,
      message: 'Opening hours not available'
    };
  }

  // Calculate time until close
  let timeUntilClose = null;
  let closingTime = null;

  if (openingHours.open_now && openingHours.periods) {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday
    const currentTime = now.getHours() * 100 + now.getMinutes();

    // Find today's closing time
    const todayPeriod = openingHours.periods.find(p => p.open?.day === currentDay);
    if (todayPeriod?.close) {
      const closeTime = parseInt(todayPeriod.close.time);
      const closeHour = Math.floor(closeTime / 100);
      const closeMinute = closeTime % 100;

      closingTime = `${String(closeHour).padStart(2, '0')}:${String(closeMinute).padStart(2, '0')}`;

      // Calculate minutes until close
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const closeMinutes = closeHour * 60 + closeMinute;
      timeUntilClose = closeMinutes - nowMinutes;

      // Handle overnight
      if (timeUntilClose < 0) {
        timeUntilClose += 24 * 60;
      }
    }
  }

  // Generate warning if closing soon
  let warning = null;
  if (timeUntilClose !== null) {
    if (timeUntilClose <= 30) {
      warning = `🚨 ${timeUntilClose}분 후 폐장! (${closingTime})`;
    } else if (timeUntilClose <= 60) {
      warning = `⚠️ 1시간 내 폐장 (${closingTime})`;
    } else if (timeUntilClose <= 120) {
      warning = `⚠️ 2시간 내 폐장 (${closingTime})`;
    }
  }

  return {
    success: true,
    place_id: placeId,
    open_now: openingHours.open_now,
    closing_time: closingTime,
    time_until_close: timeUntilClose,
    warning: warning,
    weekday_text: openingHours.weekday_text
  };
}

// Enrich multiple places with opening hours
async function enrichPlaces(places, filterOpenNow = false) {
  checkApiKey();

  const results = {
    enriched_places: [],
    filtered_out: [],
    warnings: [],
    meta: {
      google_api_calls: 0,
      enrichment_success: 0,
      enrichment_failed: 0
    }
  };

  for (const place of places) {
    // Step 1: Find place in Google
    const findResult = await findPlace(place.name, place.lat, place.lng);
    results.meta.google_api_calls++;

    if (!findResult.success) {
      results.enriched_places.push({
        ...place,
        opening_hours: null,
        enrichment_status: 'not_found',
        fallback_message: '영업시간을 확인하려면 카카오맵에서 확인하세요'
      });
      results.meta.enrichment_failed++;
      continue;
    }

    // Step 2: Get opening hours
    const checkResult = await checkOpen(findResult.place_id);
    results.meta.google_api_calls++;

    if (!checkResult.success) {
      results.enriched_places.push({
        ...place,
        opening_hours: null,
        enrichment_status: 'details_failed'
      });
      results.meta.enrichment_failed++;
      continue;
    }

    results.meta.enrichment_success++;

    const enrichedPlace = {
      ...place,
      google_place_id: findResult.place_id,
      google_name: findResult.name,
      opening_hours: {
        open_now: checkResult.open_now,
        weekday_text: checkResult.weekday_text
      },
      closing_time: checkResult.closing_time,
      time_until_close: checkResult.time_until_close,
      enrichment_status: 'success'
    };

    // Filter or warn
    if (filterOpenNow && checkResult.open_now === false) {
      results.filtered_out.push({
        ...enrichedPlace,
        reason: '현재 영업 종료'
      });
    } else {
      results.enriched_places.push(enrichedPlace);

      if (checkResult.warning) {
        results.warnings.push({
          place_name: place.name,
          message: checkResult.warning
        });
      }
    }
  }

  return results;
}

// Summarize a place with basic info + review-based insights
async function summarizePlace(placeId) {
  const details = await getPlaceDetails(placeId,
    'name,formatted_address,rating,user_ratings_total,opening_hours,business_status,url,types,formatted_phone_number,reviews,editorial_summary,price_level'
  );

  if (!details.success) {
    return details;
  }

  // Build review-based summary
  const reviewSummary = buildReviewSummary(details.reviews || []);

  return {
    success: true,
    place_id: placeId,
    name: details.name,
    address: details.address,
    phone: details.phone || null,
    url: details.url || null,
    rating: details.rating || null,
    review_count: details.review_count || null,
    business_status: details.business_status || null,
    opening_hours: details.opening_hours || null,
    editorial_summary: details.editorial_summary || null,
    review_summary: reviewSummary,
    price_level: details.price_level || null
  };
}

// Build structured summary from reviews
function buildReviewSummary(reviews) {
  if (!reviews || reviews.length === 0) {
    return {
      total_analyzed: 0,
      average_rating: null,
      highlights: [],
      concerns: [],
      keywords: [],
      sample_reviews: [],
      summary_text: '리뷰 정보가 없습니다.'
    };
  }

  const totalAnalyzed = reviews.length;
  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalAnalyzed;

  // Separate positive (4-5) and negative (1-2) reviews
  const positive = reviews.filter(r => r.rating >= 4);
  const negative = reviews.filter(r => r.rating <= 2);

  // Extract highlights from positive reviews
  const highlights = positive
    .filter(r => r.text && r.text.length > 10)
    .slice(0, 3)
    .map(r => extractKeyPhrase(r.text));

  // Extract concerns from negative reviews
  const concerns = negative
    .filter(r => r.text && r.text.length > 10)
    .slice(0, 2)
    .map(r => extractKeyPhrase(r.text));

  // Extract common keywords from all reviews
  const keywords = extractKeywords(reviews.map(r => r.text).filter(Boolean));

  // Sample reviews (top 3 most useful)
  const sampleReviews = reviews
    .filter(r => r.text && r.text.length > 20)
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 3)
    .map(r => ({
      author: r.author,
      rating: r.rating,
      text: r.text.length > 200 ? r.text.substring(0, 200) + '...' : r.text,
      time: r.time
    }));

  // Generate summary text
  const summaryParts = [];

  if (avgRating >= 4.0) {
    summaryParts.push(`평점 ${avgRating.toFixed(1)}점으로 높은 평가를 받고 있습니다.`);
  } else if (avgRating >= 3.0) {
    summaryParts.push(`평점 ${avgRating.toFixed(1)}점으로 보통 수준의 평가입니다.`);
  } else {
    summaryParts.push(`평점 ${avgRating.toFixed(1)}점으로 다소 낮은 평가입니다.`);
  }

  if (highlights.length > 0) {
    summaryParts.push(`장점으로는 "${highlights.join('", "')}" 등이 언급됩니다.`);
  }

  if (concerns.length > 0) {
    summaryParts.push(`일부 리뷰에서 "${concerns.join('", "')}" 등의 의견이 있습니다.`);
  }

  if (keywords.length > 0) {
    summaryParts.push(`자주 언급되는 키워드: ${keywords.join(', ')}`);
  }

  return {
    total_analyzed: totalAnalyzed,
    average_rating: parseFloat(avgRating.toFixed(1)),
    highlights,
    concerns,
    keywords,
    sample_reviews: sampleReviews,
    summary_text: summaryParts.join(' ')
  };
}

// Extract a key phrase from review text (first meaningful sentence)
function extractKeyPhrase(text) {
  if (!text) return '';
  // Split by sentence endings and take the first substantial one
  const sentences = text.split(/[.!?。！？\n]+/).filter(s => s.trim().length > 5);
  const phrase = sentences[0]?.trim() || text.trim();
  return phrase.length > 80 ? phrase.substring(0, 80) + '...' : phrase;
}

// Extract frequently mentioned keywords from review texts
function extractKeywords(texts) {
  const allText = texts.join(' ').toLowerCase();

  // Common keywords to detect (Korean + English)
  const keywordPatterns = [
    { pattern: /맛있|맛집|delicious|tasty/g, label: '맛있는' },
    { pattern: /분위기|atmosphere|ambiance|vibe/g, label: '분위기' },
    { pattern: /친절|friendly|kind|서비스/g, label: '친절한 서비스' },
    { pattern: /가성비|저렴|cheap|affordable|value/g, label: '가성비' },
    { pattern: /뷰|view|전망|경치|scenery/g, label: '뷰/전망' },
    { pattern: /깨끗|clean|청결/g, label: '깨끗한' },
    { pattern: /넓|spacious|wide/g, label: '넓은 공간' },
    { pattern: /주차|parking/g, label: '주차' },
    { pattern: /웨이팅|waiting|줄|queue|wait/g, label: '웨이팅' },
    { pattern: /추천|recommend/g, label: '추천' },
    { pattern: /사진|photo|인스타|instagram/g, label: '포토스팟' },
    { pattern: /조용|quiet|calm/g, label: '조용한' },
    { pattern: /fresh|신선/g, label: '신선한' },
    { pattern: /amazing|wonderful|great|excellent|awesome|fantastic|beautiful/g, label: 'great' },
    { pattern: /climbing|rock|boulder/gi, label: '클라이밍' },
    { pattern: /sunset|일몰|석양/g, label: '석양' },
    { pattern: /seafood|해산물|시푸드/g, label: '시푸드' },
  ];

  const found = [];
  for (const { pattern, label } of keywordPatterns) {
    const matches = allText.match(pattern);
    if (matches && matches.length >= 1) {
      found.push({ label, count: matches.length });
    }
  }

  return found
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(k => k.label);
}

// Search places along a route using Google Places Text Search (New) API
async function searchAlongRoute(query, encodedPolyline, options = {}) {
  checkApiKey();

  const NEW_API_URL = 'https://places.googleapis.com/v1/places:searchText';

  const body = {
    textQuery: query,
    searchAlongRouteParameters: {
      polyline: {
        encodedPolyline: encodedPolyline
      }
    },
    languageCode: 'ko'
  };

  if (options.origin) {
    body.routingParameters = {
      origin: {
        latitude: options.origin.lat,
        longitude: options.origin.lng
      }
    };
  }

  try {
    const response = await fetch(NEW_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.types,places.googleMapsUri,places.photos,routingSummaries'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.status || `HTTP ${response.status}`,
        message: data.error?.message || 'Unknown error'
      };
    }

    const places = (data.places || []).map((place, idx) => {
      const mapped = {
        place_id: place.id ? place.id.replace(/^places\//, '') : null,
        name: place.displayName?.text || null,
        address: place.formattedAddress || null,
        location: place.location
          ? { lat: place.location.latitude, lng: place.location.longitude }
          : null,
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        openNow: place.currentOpeningHours?.openNow ?? null,
        types: place.types || [],
        url: place.googleMapsUri || null
      };

      // Attach per-place routing summary if available
      if (data.routingSummaries && data.routingSummaries[idx]) {
        mapped.routingSummary = data.routingSummaries[idx];
      } else {
        mapped.routingSummary = null;
      }

      return mapped;
    });

    return {
      success: true,
      places,
      totalCount: places.length,
      meta: { apiCalls: 1 }
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
  .command('find <query>', 'Find place by text query', (yargs) => {
    return yargs
      .positional('query', { describe: 'Place name to search', type: 'string' })
      .option('lat', { describe: 'Latitude for location bias', type: 'number' })
      .option('lng', { describe: 'Longitude for location bias', type: 'number' });
  }, async (argv) => {
    const result = await findPlace(argv.query, argv.lat, argv.lng);
    console.log(JSON.stringify(result, null, 2));
  })
  .command('details <placeId>', 'Get place details', (yargs) => {
    return yargs
      .positional('placeId', { describe: 'Google Place ID', type: 'string' })
      .option('fields', {
        describe: 'Fields to retrieve',
        type: 'string',
        default: 'name,formatted_address,rating,user_ratings_total,opening_hours,business_status,url,types,formatted_phone_number,editorial_summary'
      });
  }, async (argv) => {
    const result = await getPlaceDetails(argv.placeId, argv.fields);
    console.log(JSON.stringify(result, null, 2));
  })
  .command('check-open <placeId>', 'Check if place is open now', (yargs) => {
    return yargs
      .positional('placeId', { describe: 'Google Place ID', type: 'string' });
  }, async (argv) => {
    const result = await checkOpen(argv.placeId);
    console.log(JSON.stringify(result, null, 2));
  })
  .command('enrich', 'Enrich multiple places with opening hours', (yargs) => {
    return yargs
      .option('places', {
        describe: 'JSON array of places [{name, lat, lng}]',
        type: 'string',
        demandOption: true
      })
      .option('filter-open', {
        describe: 'Filter out closed places',
        type: 'boolean',
        default: false
      });
  }, async (argv) => {
    try {
      const places = JSON.parse(argv.places);
      const result = await enrichPlaces(places, argv.filterOpen);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(JSON.stringify({
        success: false,
        error: 'Invalid JSON for places',
        message: e.message
      }, null, 2));
    }
  })
  .command('reviews <placeId>', 'Get reviews for a place', (yargs) => {
    return yargs
      .positional('placeId', { describe: 'Google Place ID', type: 'string' });
  }, async (argv) => {
    const result = await getPlaceDetails(argv.placeId, 'name,rating,user_ratings_total,reviews');
    console.log(JSON.stringify(result, null, 2));
  })
  .command('summarize <placeId>', 'Get place summary with review insights', (yargs) => {
    return yargs
      .positional('placeId', { describe: 'Google Place ID', type: 'string' });
  }, async (argv) => {
    const result = await summarizePlace(argv.placeId);
    console.log(JSON.stringify(result, null, 2));
  })
  .command('search-along-route', 'Search places along a route using encoded polyline', (yargs) => {
    return yargs
      .option('query', {
        describe: 'Search query',
        type: 'string',
        demandOption: true
      })
      .option('polyline', {
        describe: 'Encoded polyline string representing the route',
        type: 'string',
        demandOption: true
      })
      .option('origin', {
        describe: 'JSON string with lat/lng for routing origin, e.g. \'{"lat":35.68,"lng":139.76}\'',
        type: 'string'
      });
  }, async (argv) => {
    try {
      let origin;
      if (argv.origin) {
        origin = JSON.parse(argv.origin);
      }
      const result = await searchAlongRoute(argv.query, argv.polyline, { origin });
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(JSON.stringify({
        success: false,
        error: 'Invalid arguments',
        message: e.message
      }, null, 2));
    }
  })
  .demandCommand(1, 'You need to specify a command')
  .help()
  .argv;
