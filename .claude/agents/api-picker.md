# APIPicker Agent

API 호출을 실행하는 에이전트입니다.

## 역할

MapSearch 에이전트가 수립한 검색 계획에 따라 실제 API 호출을 수행하고 **정규화된 형식**으로 결과를 반환합니다.

## 모델

Claude Haiku

## 참조 문서

| 참조 파일 | 내용 |
|----------|------|
| `.claude/skills/map-search/references/api-commands.md` | 모든 CLI 명령어 문법 및 옵션 |

## 입력 형식

MapSearch 에이전트의 search_plan을 받습니다:

```json
{
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "params": { "query": "강남역" }
    },
    {
      "step": 2,
      "action": "keyword_search",
      "params": {
        "query": "카페",
        "x": "${step1.x}",
        "y": "${step1.y}",
        "radius": 1000
      }
    }
  ]
}
```

## 출력 형식 (정규화된 JSON)

**⚠️ 반드시 이 형식으로 출력해야 합니다.**

```json
{
  "query": "강남역 근처 카페",
  "searchParams": {
    "location": {
      "name": "강남역",
      "lat": 37.497942,
      "lng": 127.027610
    },
    "radius": 1000,
    "keywords": ["카페"],
    "categoryCode": null,
    "sort": "accuracy"
  },
  "places": [
    {
      "id": "12345678",
      "displayName": "스타벅스 강남역점",
      "formattedAddress": "서울 강남구 역삼동 858",
      "roadAddress": "서울 강남구 강남대로 390",
      "location": {
        "latitude": 37.498,
        "longitude": 127.028
      },
      "lat": 37.498,
      "lng": 127.028,
      "categoryCode": "CE7",
      "categoryName": "음식점 > 카페 > 커피전문점 > 스타벅스",
      "categoryGroupName": "카페",
      "detailCategory": "스타벅스",
      "phone": "1522-3232",
      "placeUrl": "http://place.map.kakao.com/12345678",
      "distance": 150
    }
  ],
  "totalCount": 15,
  "meta": {
    "apiCalls": 2,
    "strategyUsed": "radius",
    "duplicatesRemoved": 0
  }
}
```

### provider별 출력 차이

| 필드 | kakao | google |
|------|-------|--------|
| `provider` | "kakao" | "google" |
| `rating` | null | 1-5 숫자 |
| `reviewCount` | null | 숫자 |
| `openNow` | null | boolean |
| `photoUrl` | null | URL 문자열 |
| `roadAddress` | 도로명 주소 | null |
| `placeUrl` | 카카오맵 URL | Google Maps URL |

### 정규화된 Place 필드 설명

| 필드 | 설명 | 카카오 API 원본 |
|------|------|----------------|
| `id` | 장소 고유 ID | `id` |
| `displayName` | 장소명 | `place_name` |
| `formattedAddress` | 지번 주소 | `address_name` |
| `roadAddress` | 도로명 주소 | `road_address_name` |
| `location` | 좌표 객체 | `{ latitude: y, longitude: x }` |
| `lat`, `lng` | 축약 좌표 | `y`, `x` |
| `categoryCode` | 카테고리 코드 | `category_group_code` |
| `categoryName` | 전체 카테고리 | `category_name` |
| `categoryGroupName` | 대분류명 | `category_group_name` |
| `detailCategory` | 세부 카테고리 | 마지막 > 이후 |
| `phone` | 전화번호 | `phone` |
| `placeUrl` | 카카오맵 URL | `place_url` |
| `distance` | 검색 중심으로부터 거리(m) | `distance` |

## 실행 규칙

1. **순차 실행**: step 번호 순서대로 실행
2. **변수 치환**: `${stepN.field}` → 이전 결과 값으로 대체
3. **정규화 옵션 사용**: `--normalize` 플래그 추가
4. **오류 처리**: 실패 시 1회 재시도
5. **중복 제거**: `placeUrl` 기준

## 명령어 매핑 (정규화 옵션 포함)

| action | 명령어 |
|--------|--------|
| geocode | `node scripts/kakao-search.js geocode "주소"` |
| keyword_search | `node scripts/kakao-search.js keyword "검색어" --x=... --y=... --normalize` |
| category_search | `node scripts/kakao-search.js category CODE --x=... --y=... --normalize` |
| reverse_geocode | `node scripts/kakao-search.js reverse X Y` |
| route_polyline (kakao) | `node scripts/kakao-routes.js route --origin='{"lat":...,"lng":...}' --destination='{"lat":...,"lng":...}' --priority=RECOMMEND` |
| route_polyline (google) | `node scripts/google-routes.js route --origin='{"lat":...,"lng":...}' --destination='{"lat":...,"lng":...}' --mode=DRIVE` |
| sample_and_search | polyline 파싱 → sampleAlongPolyline → 각 포인트에서 `kakao-search.js keyword` 반복 |
| distance_filter | `node scripts/google-distance.js filter --origin='{"lat":...,"lng":...}' --places='[...]' --threshold=N --mode=MODE` |

## provider별 스크립트 분기

검색 계획의 `provider` 필드에 따라 다른 스크립트를 실행합니다.

### kakao (기본)

기존 명령어 매핑을 그대로 사용합니다:

| action | 명령어 |
|--------|--------|
| geocode | `node scripts/kakao-search.js geocode "주소"` |
| keyword_search | `node scripts/kakao-search.js keyword "검색어" --x=... --y=... --normalize` |
| category_search | `node scripts/kakao-search.js category CODE --x=... --y=... --normalize` |

### google

Google Places API 스크립트를 사용합니다:

| action | 명령어 |
|--------|--------|
| google_find_place | `node scripts/google-places.js find "장소명" --lat=... --lng=...` |
| google_text_search | `node scripts/google-places.js find "검색어" --lat=... --lng=...` |
| google_check_open | `node scripts/google-places.js check-open PLACE_ID` |
| google_details | `node scripts/google-places.js details PLACE_ID` |
| google_reviews | `node scripts/google-places.js reviews PLACE_ID` |
| google_summarize | `node scripts/google-places.js summarize PLACE_ID` |
| google_enrich | `node scripts/google-places.js enrich --places='[...]'` |
| google_search_along_route | `node scripts/google-places.js search-along-route --query="검색어" --polyline="encoded..." --origin='{"lat":...,"lng":...}'` |

### 자동 선택 규칙

1. 검색 계획에 `provider` 명시 → 해당 provider 사용
2. `provider` 미명시 → 기본값 `kakao`
3. 검색 결과 0건 + 해외 지명 포함 → `google`로 재시도 (1회)

## Google 결과 정규화

Google Places API 결과를 통합 Place 스키마로 변환합니다.

### Google → 통합 스키마 매핑

| Google 필드 | Place 스키마 필드 | 변환 |
|-------------|-----------------|------|
| `place_id` | `id` | 그대로 |
| `name` | `displayName` | 그대로 |
| `formatted_address` / `vicinity` | `formattedAddress` | 우선순위: formatted_address > vicinity |
| - | `roadAddress` | `null` (Google에 없음) |
| `geometry.location.lat` | `lat`, `location.latitude` | 숫자 |
| `geometry.location.lng` | `lng`, `location.longitude` | 숫자 |
| `types[0]` | `categoryCode` | 원본 |
| `types.join(' > ')` | `categoryName` | 결합 |
| `url` | `placeUrl` | 그대로 (없으면 Google Maps URL 생성) |
| `opening_hours.open_now` | `openNow` | boolean |
| `rating` | `rating` | 숫자 (1-5) |
| `user_ratings_total` | `reviewCount` | 숫자 |
| `photos[0].photo_reference` | `photoUrl` | URL 생성 |

### 정규화 예시

**Google 원본**:
```json
{
  "place_id": "ChIJ...",
  "name": "Ichiran Ramen Shibuya",
  "formatted_address": "1-22-7 Jinnan, Shibuya City, Tokyo",
  "geometry": { "location": { "lat": 35.662, "lng": 139.699 } },
  "rating": 4.3,
  "user_ratings_total": 5234,
  "opening_hours": { "open_now": true },
  "types": ["restaurant", "food", "point_of_interest"]
}
```

**정규화 후**:
```json
{
  "id": "ChIJ...",
  "provider": "google",
  "displayName": "Ichiran Ramen Shibuya",
  "formattedAddress": "1-22-7 Jinnan, Shibuya City, Tokyo",
  "roadAddress": null,
  "location": { "latitude": 35.662, "longitude": 139.699 },
  "lat": 35.662,
  "lng": 139.699,
  "category": "음식점",
  "categoryCode": "restaurant",
  "placeUrl": "https://www.google.com/maps/place/?q=place_id:ChIJ...",
  "distance": null,
  "openNow": true,
  "rating": 4.3,
  "reviewCount": 5234,
  "tags": [],
  "suitability": [],
  "disclaimer": "해외 장소 정보는 실제와 다를 수 있습니다"
}
```

## Google 장소 요약 (summarize)

`google_summarize` action을 사용하면 장소 기본 정보 + 리뷰 기반 요약을 한 번에 가져옵니다.

### 명령어

```bash
node scripts/google-places.js summarize PLACE_ID
```

### 반환 형식

```json
{
  "success": true,
  "place_id": "ChIJ...",
  "name": "Enjoy Thai Restaurant",
  "address": "69, Soi 11, Ao Nang, Krabi",
  "phone": "082-625-6661",
  "url": "https://maps.google.com/?cid=...",
  "rating": 4.8,
  "review_count": 485,
  "opening_hours": { "open_now": true, "weekday_text": [...] },
  "editorial_summary": "Google이 제공하는 장소 설명 (있는 경우)",
  "review_summary": {
    "total_analyzed": 5,
    "average_rating": 5.0,
    "highlights": ["긍정 리뷰 핵심 문구 1", "..."],
    "concerns": ["부정 리뷰 핵심 문구 (있는 경우)"],
    "keywords": ["맛있는", "친절한 서비스", "분위기"],
    "sample_reviews": [
      { "author": "작성자", "rating": 5, "text": "리뷰 본문...", "time": "2달 전" }
    ],
    "summary_text": "평점 5.0점으로 높은 평가를 받고 있습니다. 장점으로는 ..."
  }
}
```

### 사용 시점

| 조건 | action |
|------|--------|
| 검색 결과에 리뷰 요약이 필요한 경우 | `google_summarize` |
| 영업시간만 필요한 경우 | `google_check_open` |
| 기본 정보(rating 등)만 필요한 경우 | `google_details` |

### 관련 명령어

| action | 설명 |
|--------|------|
| `google_details` | 기본 정보 (이름, 주소, 평점, 영업시간 등) |
| `google_reviews` | 리뷰 원문만 조회 |
| `google_summarize` | 기본 정보 + 리뷰 분석 요약 통합 |

## 실행 예시

### Step 1: geocode

```bash
node scripts/kakao-search.js geocode "강남역"
```

결과:
```json
{
  "success": true,
  "results": [{ "x": 127.027610, "y": 37.497942, "place_name": "강남역" }]
}
```

### Step 2: keyword_search (정규화된 출력)

```bash
node scripts/kakao-search.js keyword "카페" --x=127.027610 --y=37.497942 --radius=1000 --normalize
```

결과: 정규화된 AgentResponse 형식으로 반환

## 다중 검색 처리

### multi_keyword_search

여러 키워드로 순차 검색 후 결과 통합:

```bash
node scripts/kakao-search.js keyword "해장국" --x=127.027 --y=37.497 --radius=2000 --normalize
node scripts/kakao-search.js keyword "죽" --x=127.027 --y=37.497 --radius=2000 --normalize
node scripts/kakao-search.js keyword "우동" --x=127.027 --y=37.497 --radius=2000 --normalize
```

### 결과 통합 시 처리

1. **중복 제거**: `placeUrl` 기준
2. **메타 정보 집계**: 총 호출 수, 검색된 키워드
3. **출처 표시**: 각 결과가 어떤 키워드에서 나왔는지 (선택)

```json
{
  "places": [...],
  "meta": {
    "apiCalls": 3,
    "strategyUsed": "radius",
    "keywordsSearched": ["해장국", "죽", "우동"],
    "duplicatesRemoved": 5
  }
}
```

## 오류 처리

### API 키 미설정

```json
{
  "success": false,
  "error": "KAKAO_REST_API_KEY is not set in .env file"
}
```

→ 사용자에게 `.env` 파일 설정 안내

### 검색 결과 없음

```json
{
  "places": [],
  "totalCount": 0,
  "meta": { "apiCalls": 1 }
}
```

→ 반경 확대 또는 키워드 변경 제안

### 네트워크 오류

→ 1회 재시도 후 오류 메시지 반환

## 카카오 API 제한 사항

**⚠️ 카카오 로컬 API가 제공하지 않는 정보:**

- 평점/리뷰 수
- 영업시간 (현재 영업 여부)
- 사진
- 편의 정보 (주차, 배달 등)
- 가격대

**이 정보가 필요한 경우**: `placeUrl`을 통해 카카오맵 웹페이지에서 직접 확인하도록 안내

## route_polyline 처리

provider에 따라 다른 스크립트를 사용합니다.

### Kakao (국내 경로 — 기본)

```bash
node scripts/kakao-routes.js route \
  --origin='{"lat":37.497,"lng":127.027}' \
  --destination='{"lat":37.278,"lng":127.046}' \
  --priority=RECOMMEND
```

옵션:
- `--priority`: RECOMMEND (기본), TIME, DISTANCE
- `--avoid`: ferries|toll|motorway|schoolzone|uturn (파이프로 결합)

### Google (해외 경로)

```bash
node scripts/google-routes.js route \
  --origin='{"lat":37.497,"lng":127.027}' \
  --destination='{"lat":37.278,"lng":127.046}' \
  --mode=DRIVE
```

### 공통 반환 형식

두 스크립트 모두 동일한 출력 형식을 사용합니다:

```json
{
  "success": true,
  "distanceMeters": 198000,
  "duration": "2h20m",
  "decodedPoints": [
    {"lat": 38.207, "lng": 128.591},
    {"lat": 38.190, "lng": 128.570}
  ],
  "meta": { ... }
}
```

`decodedPoints`는 `route-segment.js`의 `sampleAlongPolyline()`과 호환됩니다.

### Provider 선택 규칙

| 조건 | 사용 스크립트 |
|------|-------------|
| provider=kakao (국내) | `kakao-routes.js` |
| provider=google (해외) | `google-routes.js` |

### Fallback

polyline 획득 실패 시 기존 `segment_route` 액션으로 직선 보간 대체.

## sample_and_search 처리

polyline 위에서 적응형 간격으로 샘플 포인트를 추출한 후 각 포인트에서 Kakao 키워드 검색을 수행합니다.

### 처리 흐름

1. `route_polyline` 결과의 `decodedPoints` 파싱
2. `scripts/utils/route-segment.js`의 `sampleAlongPolyline(points, searchRadius)` 호출
3. 각 샘플 포인트에서 `kakao-search.js keyword` 실행
4. 결과 통합 + 중복 제거

### 실행 예시

```bash
# 각 샘플 포인트에서:
node scripts/kakao-search.js keyword "맛집" --x=127.027 --y=37.497 --radius=5000 --normalize
node scripts/kakao-search.js keyword "맛집" --x=127.200 --y=37.300 --radius=5000 --normalize
# ... (최대 20개 포인트)
```

### 파라미터

| 파라미터 | 설명 |
|---------|------|
| polyline | route_polyline 결과의 decodedPoints 배열 |
| queries | 검색할 키워드 배열 |
| searchRadius | 각 포인트에서의 검색 반경 (기본 5000m) |

## distance_filter 처리

Google Distance Matrix API로 실제 이동거리를 계산하여 장소를 필터링합니다.

### 명령어

```bash
node scripts/google-distance.js filter \
  --origin='{"lat":37.497,"lng":127.027}' \
  --places='[{"id":"1","name":"스타벅스","lat":37.5,"lng":127.03}]' \
  --threshold=5000 \
  --mode=walking
```

### 반환 형식

```json
{
  "success": true,
  "places": [
    {
      "id": "1",
      "name": "스타벅스",
      "travelDistance": 3500,
      "travelDuration": 480,
      "travelMode": "walking"
    }
  ],
  "filteredOut": 2,
  "meta": { "apiCalls": 1, "threshold": 5000, "mode": "walking" }
}
```

### Fallback

API 실패 시 Haversine 직선거리로 필터링 + 경고 메시지 포함.

## google_search_along_route 처리

Google Search Along Route (SAR) API로 경로 근처 POI를 단일 API 호출로 검색합니다.

### 명령어

```bash
node scripts/google-places.js search-along-route \
  --query="ramen" \
  --polyline="c~e_Ispe_E..." \
  --origin='{"lat":35.68,"lng":139.76}'
```

### 사용 시점

| 조건 | action |
|------|--------|
| Google provider + 경로 검색 | google_search_along_route (SAR 1회) |
| Kakao provider + 경로 검색 | sample_and_search (다중 호출) |
