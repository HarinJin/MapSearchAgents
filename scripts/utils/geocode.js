/**
 * Geocoding Utilities
 *
 * Address-coordinate conversion helpers
 */

import 'dotenv/config';

const KAKAO_API_KEY = process.env.KAKAO_REST_API_KEY;
const BASE_URL = 'https://dapi.kakao.com/v2/local';

/**
 * Make API request to Kakao
 */
async function kakaoRequest(endpoint, params = {}) {
  if (!KAKAO_API_KEY) {
    throw new Error('KAKAO_REST_API_KEY is not set');
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
    throw new Error(`Kakao API Error: ${response.status}`);
  }

  return response.json();
}

/**
 * Convert address or landmark to coordinates
 *
 * @param {string} address - Address or landmark name (e.g., "강남역", "서울시 강남구")
 * @returns {Promise<{x: number, y: number, address: string} | null>}
 */
export async function addressToCoord(address) {
  // First try address search
  const addressResult = await kakaoRequest('/search/address.json', { query: address });

  if (addressResult.documents.length > 0) {
    const doc = addressResult.documents[0];
    return {
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      address: doc.address_name,
      type: 'address'
    };
  }

  // Fallback to keyword search (for landmarks)
  const keywordResult = await kakaoRequest('/search/keyword.json', { query: address, size: 1 });

  if (keywordResult.documents.length > 0) {
    const doc = keywordResult.documents[0];
    return {
      x: parseFloat(doc.x),
      y: parseFloat(doc.y),
      address: doc.address_name,
      place_name: doc.place_name,
      type: 'landmark'
    };
  }

  return null;
}

/**
 * Convert coordinates to address
 *
 * @param {number} x - Longitude
 * @param {number} y - Latitude
 * @returns {Promise<{address: string, road_address: string | null} | null>}
 */
export async function coordToAddress(x, y) {
  const result = await kakaoRequest('/geo/coord2address.json', { x, y });

  if (result.documents.length === 0) {
    return null;
  }

  const doc = result.documents[0];
  return {
    address: doc.address?.address_name || null,
    road_address: doc.road_address?.address_name || null
  };
}

/**
 * Convert multiple addresses to coordinates in batch
 *
 * @param {string[]} addresses - Array of addresses
 * @returns {Promise<Array<{address: string, coord: {x: number, y: number} | null}>>}
 */
export async function batchAddressToCoord(addresses) {
  const results = await Promise.all(
    addresses.map(async (address) => {
      const coord = await addressToCoord(address);
      return {
        address,
        coord: coord ? { x: coord.x, y: coord.y } : null
      };
    })
  );
  return results;
}

export default {
  addressToCoord,
  coordToAddress,
  batchAddressToCoord
};
