#!/usr/bin/env node

/**
 * Kakao Map API CLI Wrapper
 *
 * Usage:
 *   node scripts/kakao-search.js keyword "카페" --x=127.027 --y=37.497 --radius=1000
 *   node scripts/kakao-search.js category FD6 --x=127.027 --y=37.497
 *   node scripts/kakao-search.js geocode "강남역"
 *
 * --normalize 옵션 추가 시 정규화된 Place 형식으로 출력
 */

import 'dotenv/config';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  normalizeKakaoPlaces,
  createAgentResponse,
  addPlacesToResponse,
  deduplicatePlaces,
  sortPlaces
} from './types/place.js';

const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;
const BASE_URL = 'https://dapi.kakao.com/v2/local';

// Category codes reference
const CATEGORY_CODES = {
  MT1: '대형마트',
  CS2: '편의점',
  PS3: '어린이집, 유치원',
  SC4: '학교',
  AC5: '학원',
  PK6: '주차장',
  OL7: '주유소, 충전소',
  SW8: '지하철역',
  BK9: '은행',
  CT1: '문화시설',
  AG2: '중개업소',
  PO3: '공공기관',
  AT4: '관광명소',
  AD5: '숙박',
  FD6: '음식점',
  CE7: '카페',
  HP8: '병원',
  PM9: '약국'
};

/**
 * Make API request to Kakao
 */
async function kakaoRequest(endpoint, params = {}) {
  if (!KAKAO_API_KEY) {
    throw new Error('KAKAO_REST_API_KEY is not set in .env file');
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `KakaoAK ${KAKAO_API_KEY}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Kakao API Error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Keyword search
 */
async function keywordSearch(query, options = {}) {
  const params = {
    query,
    x: options.x,
    y: options.y,
    radius: options.radius || 2000,
    size: options.size || 15,
    page: options.page || 1,
    sort: options.sort || 'accuracy'
  };

  const result = await kakaoRequest('/search/keyword.json', params);

  // 원본 결과
  const rawResults = result.documents.map(doc => ({
    id: doc.id,
    place_name: doc.place_name,
    address_name: doc.address_name,
    road_address_name: doc.road_address_name,
    category_name: doc.category_name,
    category_group_code: doc.category_group_code,
    phone: doc.phone,
    x: doc.x,
    y: doc.y,
    distance: doc.distance,
    place_url: doc.place_url
  }));

  // 정규화 옵션이 있으면 정규화된 형식 반환
  if (options.normalize) {
    const response = createAgentResponse({
      query,
      searchParams: {
        location: options.x && options.y ? { lat: options.y, lng: options.x } : null,
        radius: options.radius || 2000,
        keywords: [query],
        sort: options.sort || 'accuracy'
      }
    });

    return addPlacesToResponse(response, rawResults);
  }

  // 기존 형식 반환 (하위 호환성)
  return {
    success: true,
    results: rawResults.map(doc => ({
      place_name: doc.place_name,
      address: doc.address_name,
      road_address: doc.road_address_name,
      category: doc.category_name,
      category_code: doc.category_group_code,
      phone: doc.phone,
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      distance: doc.distance ? parseInt(doc.distance) : null,
      place_url: doc.place_url
    })),
    meta: {
      total_count: result.meta.total_count,
      pageable_count: result.meta.pageable_count,
      is_end: result.meta.is_end
    }
  };
}

/**
 * Category search
 */
async function categorySearch(categoryCode, options = {}) {
  if (!CATEGORY_CODES[categoryCode]) {
    console.warn(`Warning: Unknown category code '${categoryCode}'. Known codes:`, Object.keys(CATEGORY_CODES).join(', '));
  }

  const params = {
    category_group_code: categoryCode,
    x: options.x,
    y: options.y,
    radius: options.radius || 2000,
    size: options.size || 15,
    page: options.page || 1,
    sort: options.sort || 'accuracy'
  };

  const result = await kakaoRequest('/search/category.json', params);

  // 원본 결과
  const rawResults = result.documents.map(doc => ({
    id: doc.id,
    place_name: doc.place_name,
    address_name: doc.address_name,
    road_address_name: doc.road_address_name,
    category_name: doc.category_name,
    category_group_code: doc.category_group_code,
    phone: doc.phone,
    x: doc.x,
    y: doc.y,
    distance: doc.distance,
    place_url: doc.place_url
  }));

  // 정규화 옵션이 있으면 정규화된 형식 반환
  if (options.normalize) {
    const response = createAgentResponse({
      query: CATEGORY_CODES[categoryCode] || categoryCode,
      searchParams: {
        location: options.x && options.y ? { lat: options.y, lng: options.x } : null,
        radius: options.radius || 2000,
        categoryCode,
        sort: options.sort || 'accuracy'
      }
    });

    return addPlacesToResponse(response, rawResults);
  }

  // 기존 형식 반환 (하위 호환성)
  return {
    success: true,
    results: rawResults.map(doc => ({
      place_name: doc.place_name,
      address: doc.address_name,
      road_address: doc.road_address_name,
      category: doc.category_name,
      category_code: doc.category_group_code,
      phone: doc.phone,
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      distance: doc.distance ? parseInt(doc.distance) : null,
      place_url: doc.place_url
    })),
    meta: {
      total_count: result.meta.total_count,
      pageable_count: result.meta.pageable_count,
      is_end: result.meta.is_end
    }
  };
}

/**
 * Geocode (address to coordinates)
 */
async function geocode(address) {
  const result = await kakaoRequest('/search/address.json', { query: address });

  if (result.documents.length === 0) {
    // Try keyword search as fallback (for landmarks like "강남역")
    const keywordResult = await kakaoRequest('/search/keyword.json', { query: address, size: 1 });

    if (keywordResult.documents.length === 0) {
      return {
        success: false,
        error: `No results found for: ${address}`
      };
    }

    const doc = keywordResult.documents[0];
    return {
      success: true,
      results: [{
        address: doc.address_name,
        road_address: doc.road_address_name,
        place_name: doc.place_name,
        x: parseFloat(doc.x),
        y: parseFloat(doc.y),
        type: 'keyword_match'
      }]
    };
  }

  return {
    success: true,
    results: result.documents.map(doc => ({
      address: doc.address_name,
      road_address: doc.road_address?.address_name || null,
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      type: doc.address_type
    }))
  };
}

/**
 * Reverse geocode (coordinates to address)
 */
async function reverseGeocode(x, y) {
  const result = await kakaoRequest('/geo/coord2address.json', { x, y });

  if (result.documents.length === 0) {
    return {
      success: false,
      error: `No address found for coordinates: ${x}, ${y}`
    };
  }

  return {
    success: true,
    results: result.documents.map(doc => ({
      address: doc.address?.address_name || null,
      road_address: doc.road_address?.address_name || null,
      region: {
        region_1depth: doc.address?.region_1depth_name,
        region_2depth: doc.address?.region_2depth_name,
        region_3depth: doc.address?.region_3depth_name
      }
    }))
  };
}

// CLI setup
const argv = yargs(hideBin(process.argv))
  .command('keyword <query>', 'Search places by keyword', (yargs) => {
    return yargs
      .positional('query', {
        describe: 'Search keyword',
        type: 'string'
      });
  })
  .command('category <code>', 'Search places by category code', (yargs) => {
    return yargs
      .positional('code', {
        describe: 'Category code (e.g., FD6 for restaurants, CE7 for cafes)',
        type: 'string'
      });
  })
  .command('geocode <address>', 'Convert address to coordinates', (yargs) => {
    return yargs
      .positional('address', {
        describe: 'Address or landmark name',
        type: 'string'
      });
  })
  .command('reverse <x> <y>', 'Convert coordinates to address', (yargs) => {
    return yargs
      .positional('x', {
        describe: 'Longitude',
        type: 'number'
      })
      .positional('y', {
        describe: 'Latitude',
        type: 'number'
      });
  })
  .command('categories', 'List available category codes')
  .option('x', {
    describe: 'Longitude for search center',
    type: 'number'
  })
  .option('y', {
    describe: 'Latitude for search center',
    type: 'number'
  })
  .option('radius', {
    describe: 'Search radius in meters',
    type: 'number',
    default: 2000
  })
  .option('size', {
    describe: 'Number of results',
    type: 'number',
    default: 15
  })
  .option('page', {
    describe: 'Page number',
    type: 'number',
    default: 1
  })
  .option('sort', {
    describe: 'Sort order (accuracy or distance)',
    type: 'string',
    default: 'accuracy'
  })
  .option('normalize', {
    describe: 'Output in normalized Place format (for agent use)',
    type: 'boolean',
    default: false
  })
  .demandCommand(1, 'You need to specify a command')
  .help()
  .argv;

// Execute command
async function main() {
  try {
    const command = argv._[0];
    let result;

    switch (command) {
      case 'keyword':
        result = await keywordSearch(argv.query, argv);
        break;

      case 'category':
        result = await categorySearch(argv.code, argv);
        break;

      case 'geocode':
        result = await geocode(argv.address);
        break;

      case 'reverse':
        result = await reverseGeocode(argv.x, argv.y);
        break;

      case 'categories':
        result = {
          success: true,
          categories: CATEGORY_CODES
        };
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
    process.exit(1);
  }
}

main();
