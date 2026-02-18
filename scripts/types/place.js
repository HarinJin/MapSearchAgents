/**
 * Place 데이터 타입 정의 및 정규화 함수
 *
 * 카카오 로컬 API가 실제로 제공하는 필드만 정규화합니다.
 *
 * @module types/place
 */

/**
 * 카카오 API 카테고리 코드 → 한국어 표시명 매핑
 */
export const CATEGORY_CODES = {
  MT1: '대형마트',
  CS2: '편의점',
  PS3: '어린이집/유치원',
  SC4: '학교',
  AC5: '학원',
  PK6: '주차장',
  OL7: '주유소/충전소',
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
 * Google Places API type → 한국어 표시명 매핑
 */
export const GOOGLE_TYPE_MAP = {
  restaurant: '음식점',
  cafe: '카페',
  bar: '술집',
  lodging: '숙박',
  tourist_attraction: '관광명소',
  park: '공원',
  hospital: '병원',
  pharmacy: '약국',
  convenience_store: '편의점',
  subway_station: '지하철역',
  shopping_mall: '쇼핑몰',
  gym: '헬스장',
  veterinary_care: '동물병원',
  pet_store: '반려동물용품',
  campground: '캠핑장',
};

/**
 * 카카오 API가 제공하는 필드 목록 (참고용)
 *
 * 키워드 검색 (/search/keyword.json), 카테고리 검색 (/search/category.json):
 * - id: 장소 ID
 * - place_name: 장소명
 * - category_name: 카테고리 이름 (예: "음식점 > 한식 > 해장국")
 * - category_group_code: 카테고리 그룹 코드 (FD6, CE7 등)
 * - category_group_name: 카테고리 그룹 이름
 * - phone: 전화번호
 * - address_name: 지번 주소
 * - road_address_name: 도로명 주소
 * - x: 경도 (longitude)
 * - y: 위도 (latitude)
 * - place_url: 카카오맵 장소 URL
 * - distance: 검색 중심점으로부터 거리 (m)
 *
 * ⚠️ 카카오 API가 제공하지 않는 필드:
 * - 평점/리뷰 수 (rating, userRatingCount)
 * - 영업시간 (openNow, todayHours)
 * - 사진 (photoUrl, photos)
 * - 편의 정보 (takeout, delivery, parking 등)
 * - 가격대 (priceLevel)
 *
 * 위 필드들은 place_url을 통해 카카오맵 웹페이지에서 확인 가능합니다.
 */

/**
 * Kakao API 응답을 정규화된 Place 객체로 변환
 *
 * @param {Object} rawPlace - Kakao API의 원본 장소 데이터
 * @returns {Object} 정규화된 Place 객체
 *
 * @example
 * const place = normalizeKakaoPlace(kakaoApiResponse);
 * console.log(place.displayName); // "스타벅스 강남점"
 * console.log(place.location.latitude); // 37.497
 */
export function normalizeKakaoPlace(rawPlace = {}) {
  // === 카카오 API 제공 필드 ===

  // 1) 핵심 식별자
  const id = rawPlace.id || null;

  // 2) 장소명
  const displayName = rawPlace.place_name || '';

  // 3) 주소
  const formattedAddress = rawPlace.address_name || rawPlace.address || '';
  const roadAddress = rawPlace.road_address_name || rawPlace.road_address || '';

  // 4) 좌표 (Kakao: x=경도, y=위도)
  const location = {
    latitude: rawPlace.y ? parseFloat(rawPlace.y) : null,
    longitude: rawPlace.x ? parseFloat(rawPlace.x) : null
  };
  // 편의를 위한 축약 좌표
  const lat = location.latitude;
  const lng = location.longitude;

  // 5) 카테고리
  const categoryCode = rawPlace.category_group_code || rawPlace.category_code || '';
  const categoryName = rawPlace.category_name || rawPlace.category || '';
  const categoryGroupName = rawPlace.category_group_name || CATEGORY_CODES[categoryCode] || '';

  // 세부 카테고리 추출 (예: "음식점 > 한식 > 해장국" → ["음식점", "한식", "해장국"])
  const categoryPath = categoryName ? categoryName.split(' > ') : [];
  const detailCategory = categoryPath.length > 0 ? categoryPath[categoryPath.length - 1] : '';

  // 6) 연락처
  const phone = rawPlace.phone || '';

  // 7) 링크
  const placeUrl = rawPlace.place_url || '';

  // 8) 거리 (검색 중심점으로부터)
  const distance = rawPlace.distance ? parseInt(rawPlace.distance) : null;

  return {
    // === 카카오 API 제공 필드 (확실한 데이터) ===
    id,
    displayName,
    formattedAddress,
    roadAddress,
    location,
    lat,
    lng,
    categoryCode,
    categoryName,
    categoryGroupName,
    categoryPath,
    detailCategory,
    phone,
    placeUrl,
    distance,

    // === Layer 1 추가 ===
    provider: 'kakao',
    category: categoryGroupName,  // 통합 카테고리명 (alias)

    // === Layer 2: Enrichment (API가 제공하면 채움, 아니면 null) ===
    openNow: null,
    closingTime: null,
    timeUntilClose: null,
    closingWarning: null,
    rating: null,
    reviewCount: null,
    photoUrl: null,

    // === Layer 3: Context (에이전트 해석 메타데이터) ===
    tags: [],
    suitability: [],
    priceHint: null,
    timeMatch: null,
    routeSegment: null,
    distanceFromStart: null,
    areaGroup: null,
    dayGroup: null,
    tripRole: null,
    disclaimer: null,

    // === 원본 데이터 보존 ===
    _raw: rawPlace
  };
}

/**
 * 복수의 Kakao API 응답을 정규화
 *
 * @param {Array} places - Kakao API 응답의 documents 배열
 * @returns {Array} 정규화된 Place 객체 배열
 */
export function normalizeKakaoPlaces(places = []) {
  return places.map(normalizeKakaoPlace);
}

/**
 * Google Places API 응답을 정규화된 Place 객체로 변환
 *
 * @param {Object} rawPlace - Google Places API의 원본 장소 데이터
 * @returns {Object} 정규화된 Place 객체
 *
 * @example
 * const place = normalizeGooglePlace(googleApiResponse);
 * console.log(place.displayName); // "Starbucks"
 * console.log(place.provider); // "google"
 */
export function normalizeGooglePlace(rawPlace = {}) {
  const id = rawPlace.place_id || null;
  const displayName = rawPlace.name || '';
  const formattedAddress = rawPlace.formatted_address || rawPlace.vicinity || '';
  const roadAddress = null; // Google doesn't have this concept

  // Google: lat/lng in geometry.location
  const loc = rawPlace.geometry?.location || {};
  const location = {
    latitude: loc.lat || null,
    longitude: loc.lng || null
  };
  const lat = location.latitude;
  const lng = location.longitude;

  // Category from types array
  const types = rawPlace.types || [];
  const categoryCode = types[0] || '';
  const categoryName = types.join(' > ');
  const categoryGroupName = GOOGLE_TYPE_MAP[types[0]] || types[0] || '';
  const categoryPath = types;
  const detailCategory = types[types.length - 1] || '';

  const phone = rawPlace.formatted_phone_number || '';
  const placeUrl = rawPlace.url || `https://www.google.com/maps/place/?q=place_id:${id}`;
  const distance = null; // Google doesn't return distance by default

  // Enrichment from Google
  const openNow = rawPlace.opening_hours?.open_now ?? null;
  const rating = rawPlace.rating ?? null;
  const reviewCount = rawPlace.user_ratings_total ?? null;
  const photoRef = rawPlace.photos?.[0]?.photo_reference || null;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  const photoUrl = photoRef
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${apiKey}`
    : null;

  return {
    id,
    provider: 'google',
    displayName,
    formattedAddress,
    roadAddress,
    location,
    lat,
    lng,
    category: categoryGroupName,
    categoryCode,
    categoryName,
    categoryGroupName,
    categoryPath,
    detailCategory,
    phone,
    placeUrl,
    distance,

    // Layer 2: Enrichment
    openNow,
    closingTime: null,
    timeUntilClose: null,
    closingWarning: null,
    rating,
    reviewCount,
    photoUrl,

    // Layer 3: Context (defaults)
    tags: [],
    suitability: [],
    priceHint: null,
    timeMatch: null,
    routeSegment: null,
    distanceFromStart: null,
    areaGroup: null,
    dayGroup: null,
    tripRole: null,
    disclaimer: null,

    _raw: rawPlace
  };
}

/**
 * provider에 따라 적절한 정규화 함수를 호출하는 통합 진입점
 *
 * @param {Object} rawPlace - 원본 장소 데이터
 * @param {string} provider - 'kakao' | 'google'
 * @returns {Object} 정규화된 Place 객체
 *
 * @example
 * const place = normalizePlace(rawData, 'google');
 */
export function normalizePlace(rawPlace, provider = 'kakao') {
  if (provider === 'google') {
    return normalizeGooglePlace(rawPlace);
  }
  return normalizeKakaoPlace(rawPlace);
}

/**
 * 정규화된 Place 객체에 에이전트 해석 컨텍스트(Layer 3)를 부착
 *
 * @param {Object} place - 정규화된 Place 객체
 * @param {Object} context - Layer 3 컨텍스트 필드
 * @returns {Object} 컨텍스트가 병합된 Place 객체
 *
 * @example
 * const enriched = attachContext(place, { tags: ['조용한'], suitability: ['혼밥'] });
 */
export function attachContext(place, context = {}) {
  return {
    ...place,
    tags: context.tags || place.tags || [],
    suitability: context.suitability || place.suitability || [],
    priceHint: context.priceHint ?? place.priceHint,
    timeMatch: context.timeMatch ?? place.timeMatch,
    routeSegment: context.routeSegment ?? place.routeSegment,
    distanceFromStart: context.distanceFromStart ?? place.distanceFromStart,
    areaGroup: context.areaGroup ?? place.areaGroup,
    dayGroup: context.dayGroup ?? place.dayGroup,
    tripRole: context.tripRole ?? place.tripRole,
    disclaimer: context.disclaimer ?? place.disclaimer,
  };
}

/**
 * 에이전트 응답 스키마
 * JSON 형태의 표준화된 응답 구조
 */
export const AgentResponseSchema = {
  // 쿼리 정보
  query: '',
  processedQuery: '',
  queryType: 'simple',          // simple, contextual, route, complex
  scenarios: [],                // ["일상", "시간"] — 교차 시나리오 표시
  confidence: 1.0,

  // Provider
  provider: 'kakao',            // 'kakao' | 'google'

  // 검색 조건
  searchParams: {
    location: null,             // { name, lat, lng }
    destination: null,          // { name, lat, lng } — 경로 도착지
    radius: 2000,
    keywords: [],
    categoryCode: null,
    sort: 'accuracy'
  },

  // 결과
  places: [],
  totalCount: 0,

  // AI 해석
  summary: '',
  contextNote: null,            // "'노가리'는 호프에서 수다 떠는 문화입니다"
  limitations: [],              // ["반려동물 동반 가능 여부는 직접 확인이 필요합니다"]
  followUpQuestions: [],

  // 시간 조건
  timeCondition: null,

  // 메타
  meta: {
    apiCalls: 0,
    strategyUsed: '',           // radius, route, multi_point
    duplicatesRemoved: 0,
    enrichmentStatus: 'none'    // none, partial, complete
  }
};

/**
 * 빈 에이전트 응답 생성
 *
 * @param {Object} overrides - 기본값을 덮어쓸 필드
 * @returns {Object} 에이전트 응답 객체
 */
export function createAgentResponse(overrides = {}) {
  return {
    ...AgentResponseSchema,
    ...overrides,
    scenarios: overrides.scenarios || [],
    limitations: overrides.limitations || [],
    followUpQuestions: overrides.followUpQuestions || [],
    searchParams: {
      ...AgentResponseSchema.searchParams,
      ...(overrides.searchParams || {})
    },
    meta: {
      ...AgentResponseSchema.meta,
      ...(overrides.meta || {})
    }
  };
}

/**
 * 검색 결과에 장소 목록 추가
 *
 * @param {Object} response - 에이전트 응답 객체
 * @param {Array} rawPlaces - 원본 장소 배열
 * @param {string} provider - 'kakao' | 'google'
 * @returns {Object} 업데이트된 에이전트 응답
 */
export function addPlacesToResponse(response, rawPlaces, provider = 'kakao') {
  const normalizedPlaces = rawPlaces.map(p => normalizePlace(p, provider));

  return {
    ...response,
    places: normalizedPlaces,
    totalCount: normalizedPlaces.length
  };
}

/**
 * 검색 결과 중복 제거 (placeUrl 기준)
 *
 * @param {Array} places - Place 객체 배열
 * @returns {Object} { places: 중복 제거된 배열, removedCount: 제거된 수 }
 */
export function deduplicatePlaces(places) {
  const seen = new Set();
  const deduplicated = [];
  let removedCount = 0;

  for (const place of places) {
    const key = place.placeUrl || place.id || `${place.lat}_${place.lng}`;
    if (seen.has(key)) {
      removedCount++;
      continue;
    }
    seen.add(key);
    deduplicated.push(place);
  }

  return { places: deduplicated, removedCount };
}

/**
 * 검색 결과 정렬
 *
 * @param {Array} places - Place 객체 배열
 * @param {string} sortBy - 'distance', 'relevance'
 * @returns {Array} 정렬된 Place 배열
 */
export function sortPlaces(places, sortBy = 'distance') {
  const sorted = [...places];

  switch (sortBy) {
    case 'distance':
      return sorted.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    case 'relevance':
    default:
      return sorted; // 기본 순서 유지 (API가 반환한 순서)
  }
}

/**
 * 검색 결과 필터링
 *
 * @param {Array} places - Place 객체 배열
 * @param {Object} filters - 필터 조건
 * @returns {Array} 필터링된 Place 배열
 */
export function filterPlaces(places, filters = {}) {
  return places.filter(place => {
    // 카테고리 필터
    if (filters.categoryCode && place.categoryCode !== filters.categoryCode) {
      return false;
    }

    // 거리 필터
    if (filters.maxDistance && place.distance > filters.maxDistance) {
      return false;
    }

    // 키워드 필터 (장소명 또는 카테고리에 포함)
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      const inName = place.displayName.toLowerCase().includes(keyword);
      const inCategory = place.categoryName.toLowerCase().includes(keyword);
      if (!inName && !inCategory) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 장소 목록을 프론트엔드 표시용으로 포맷팅
 *
 * @param {Array} places - 정규화된 Place 배열
 * @param {Object} options - 포맷팅 옵션
 * @returns {Array} 표시용 Place 배열
 */
export function formatPlacesForDisplay(places, options = {}) {
  const { maxResults = 10, includeRaw = false } = options;

  return places.slice(0, maxResults).map((place, index) => {
    const formatted = {
      rank: index + 1,
      name: place.displayName,
      address: place.roadAddress || place.formattedAddress,
      category: place.detailCategory || place.categoryGroupName,
      phone: place.phone || null,
      distance: place.distance ? `${place.distance}m` : null,
      url: place.placeUrl,
      provider: place.provider || 'kakao',
      coordinates: {
        lat: place.lat,
        lng: place.lng
      }
    };

    // Layer 2: Enrichment (non-null만 포함)
    if (place.openNow !== null) formatted.openNow = place.openNow;
    if (place.closingTime) formatted.closingTime = place.closingTime;
    if (place.closingWarning) formatted.closingWarning = place.closingWarning;
    if (place.rating !== null) formatted.rating = place.rating;
    if (place.reviewCount !== null) formatted.reviewCount = place.reviewCount;
    if (place.photoUrl) formatted.photoUrl = place.photoUrl;

    // Layer 3: Context (non-null/non-empty만 포함)
    if (place.tags?.length > 0) formatted.tags = place.tags;
    if (place.suitability?.length > 0) formatted.suitability = place.suitability;
    if (place.priceHint) formatted.priceHint = place.priceHint;
    if (place.timeMatch) formatted.timeMatch = place.timeMatch;
    if (place.routeSegment) formatted.routeSegment = place.routeSegment;
    if (place.distanceFromStart !== null) formatted.distanceFromStart = place.distanceFromStart;
    if (place.areaGroup) formatted.areaGroup = place.areaGroup;
    if (place.dayGroup !== null) formatted.dayGroup = place.dayGroup;
    if (place.tripRole) formatted.tripRole = place.tripRole;
    if (place.disclaimer) formatted.disclaimer = place.disclaimer;

    if (includeRaw) {
      formatted._raw = place._raw;
    }

    return formatted;
  });
}

export default {
  normalizeKakaoPlace,
  normalizeKakaoPlaces,
  normalizeGooglePlace,
  normalizePlace,
  attachContext,
  createAgentResponse,
  addPlacesToResponse,
  deduplicatePlaces,
  sortPlaces,
  filterPlaces,
  formatPlacesForDisplay,
  CATEGORY_CODES,
  GOOGLE_TYPE_MAP,
  AgentResponseSchema
};
