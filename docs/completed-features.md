# 완료된 기능 - 에이전트 응답 형식 표준화

## 개요

Google Maps GPT Extension 프로젝트를 분석하여 MapSearchAgents 프로젝트에 적용할 패턴을 추출하고, 카카오 API 기반의 표준화된 에이전트 응답 형식을 구축했습니다.

## 배경

### 분석 대상
- **프로젝트**: Google Maps GPT Extension (Chrome Extension)
- **위치**: `/Users/jinharin/Desktop/Harin-projects/programming/Chrome Extension Test/Google Map Extension`

### 분석에서 얻은 인사이트

| 항목 | Google Maps Extension | MapSearchAgents 적용 |
|------|----------------------|---------------------|
| 데이터 정규화 | `parsePlaceData()` 함수 | `normalizeKakaoPlace()` 함수 |
| 응답 구조 | 프론트엔드 템플릿 투영용 JSON | `AgentResponseSchema` |
| API 필드 관리 | Google Places API v1 필드 정의 | 카카오 API 제공 필드만 명시 |

## 완료된 작업

### 1. 타입 정의 시스템 (`scripts/types/`)

#### place.js - 장소 데이터 정규화

```javascript
// 카카오 API 응답 → 정규화된 Place 객체
export function normalizeKakaoPlace(rawPlace) {
  return {
    id,                    // 장소 고유 ID
    displayName,           // 장소명
    formattedAddress,      // 지번 주소
    roadAddress,           // 도로명 주소
    location: { latitude, longitude },
    lat, lng,              // 축약 좌표
    categoryCode,          // CE7, FD6 등
    categoryName,          // "음식점 > 카페 > 커피전문점"
    categoryGroupName,     // "카페"
    categoryPath,          // ["음식점", "카페", "커피전문점"]
    detailCategory,        // "커피전문점"
    phone,
    placeUrl,              // 카카오맵 링크
    distance,              // 검색 중심점으로부터 거리(m)
    _raw                   // 원본 데이터 보존
  };
}
```

#### enrichment.js - 시간 조건 처리

```javascript
// 시간 조건 파싱 (실제 필터링 불가, 안내 메시지 생성)
export function parseTimeCondition(text) {
  // "지금 영업중인" → { type: 'now', userGuidance: '...' }
  // "오후 3시에" → { type: 'specific_time', hour: 15, userGuidance: '...' }
}
```

### 2. CLI 도구 개선 (`scripts/kakao-search.js`)

#### --normalize 옵션 추가

```bash
# 기존 형식 (하위 호환)
node scripts/kakao-search.js keyword "카페" --x=127.027 --y=37.497

# 정규화된 형식 (에이전트용)
node scripts/kakao-search.js keyword "카페" --x=127.027 --y=37.497 --normalize
```

### 3. 에이전트 명세 업데이트

#### APIPicker (`.claude/agents/api-picker.md`)
- 정규화된 JSON 출력 형식 명세
- `--normalize` 플래그 사용 규칙
- 카카오 API 제한 사항 문서화

#### PlaceEnricher (`.claude/agents/place-enricher.md`)
- Google/Naver API 참조 완전 제거
- `placeUrl` 기반 사용자 안내로 전환
- `timeInfo.checkUrl`로 카카오맵 확인 유도

## 카카오 API 필드 명세

### 제공되는 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `id` | 장소 고유 ID | "7961654" |
| `place_name` | 장소명 | "스타벅스 강남역점" |
| `address_name` | 지번 주소 | "서울 강남구 역삼동 858" |
| `road_address_name` | 도로명 주소 | "서울 강남구 강남대로 390" |
| `category_name` | 전체 카테고리 | "음식점 > 카페 > 커피전문점" |
| `category_group_code` | 대분류 코드 | "CE7" |
| `category_group_name` | 대분류명 | "카페" |
| `phone` | 전화번호 | "1522-3232" |
| `x` | 경도 | "127.027610" |
| `y` | 위도 | "37.497942" |
| `place_url` | 카카오맵 URL | "http://place.map.kakao.com/7961654" |
| `distance` | 거리(m) | "150" |

### 제공되지 않는 필드 (카카오맵 웹에서 확인 필요)

| 필드 | 대안 |
|------|------|
| 평점/리뷰 수 | `placeUrl`로 카카오맵 확인 |
| 영업시간 | `placeUrl`로 카카오맵 확인 |
| 사진 | `placeUrl`로 카카오맵 확인 |
| 편의정보 (주차, 배달 등) | `placeUrl`로 카카오맵 확인 |
| 가격대 | `placeUrl`로 카카오맵 확인 |

## AgentResponseSchema

```javascript
{
  // 메타 정보
  query: "강남역 근처 카페",
  processedQuery: "",           // 은어 해석 후
  confidence: 1.0,
  queryType: "simple",          // simple, contextual, route, complex

  // 검색 조건
  searchParams: {
    location: { name, lat, lng },
    radius: 2000,
    keywords: ["카페"],
    categoryCode: "CE7",
    sort: "accuracy"
  },

  // 검색 결과
  places: [/* 정규화된 Place 배열 */],
  totalCount: 15,

  // 시간 조건 (있는 경우)
  timeCondition: {
    type: "now",
    userGuidance: "⏰ 현재 영업 여부는 카카오맵에서 확인해주세요."
  },

  // 메타
  meta: {
    apiCalls: 2,
    strategyUsed: "radius",
    duplicatesRemoved: 0
  }
}
```

## 테스트

```bash
npm run test:normalize
```

## 다음 단계

- [ ] 프론트엔드 UI/UX 설계
- [ ] 지도 마커 표시 시스템
- [ ] 사이드 패널 장소 목록
- [ ] 경로 표시 기능
- [ ] 조건 강조 UX

---

*작성일: 2026-01-25*
