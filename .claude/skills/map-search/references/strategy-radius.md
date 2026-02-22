# 반경 검색 전략

MapSearch Agent가 참조하는 반경(radius) 기반 검색 전략 문서입니다.

## 개요

특정 지점을 중심으로 일정 반경 내의 장소를 검색하는 전략입니다.

## 적용 조건

다음 패턴이 감지되면 radius 전략 사용:

| 패턴 | 예시 |
|------|------|
| ~역 근처 | "강남역 근처 카페" |
| ~동에서 | "역삼동에서 맛집" |
| ~주변 | "홍대입구 주변" |
| 현재 위치 | "내 근처 음식점" |

## 검색 계획 템플릿

```json
{
  "strategy_type": "radius",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "description": "중심점 좌표 변환",
      "api": "geocode",
      "params": {
        "query": "{위치}"
      }
    },
    {
      "step": 2,
      "action": "keyword_search",
      "description": "반경 내 키워드 검색",
      "api": "keyword",
      "params": {
        "query": "{검색어}",
        "x": "${step1.x}",
        "y": "${step1.y}",
        "radius": "{반경}",
        "size": 15
      }
    }
  ],
  "post_processing": {
    "sort_by": "distance",
    "max_results": 10
  }
}
```

## 반경 결정 기준

| 위치 유형 | 권장 반경 | 이유 |
|----------|----------|------|
| 지하철역 | 500-1000m | 역세권 도보 거리 |
| 랜드마크 | 500-1000m | 특정 건물 주변 |
| 동/구 단위 | 2000-3000m | 넓은 지역 커버 |
| "근처" 언급 | 1000m | 기본값 |
| "주변" 언급 | 1500m | 약간 넓게 |
| "가까운" 언급 | 500m | 좁게 |

## 복수 키워드 검색

Translator가 여러 키워드를 반환한 경우:

```json
{
  "strategy_type": "radius",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "params": { "query": "강남역" }
    },
    {
      "step": 2,
      "action": "multi_keyword_search",
      "description": "여러 키워드로 순차 검색",
      "params": {
        "queries": ["해장국", "죽", "우동"],
        "x": "${step1.x}",
        "y": "${step1.y}",
        "radius": 1000
      }
    }
  ]
}
```

## 카테고리 검색

특정 카테고리로 검색할 때:

```json
{
  "step": 2,
  "action": "category_search",
  "api": "category",
  "params": {
    "code": "CE7",
    "x": "${step1.x}",
    "y": "${step1.y}",
    "radius": 1000
  }
}
```

### 카테고리 코드

| 코드 | 설명 |
|------|------|
| FD6 | 음식점 |
| CE7 | 카페 |
| AT4 | 관광명소 |
| CT1 | 문화시설 |
| AD5 | 숙박 |

## 정렬 기준

| 상황 | 정렬 | 이유 |
|------|------|------|
| 위치 중심 | distance | 가까운 순 |
| 맥락 검색 | accuracy | 관련성 순 |
| 리뷰 필터 | relevance | 매칭 점수 순 |

## 결과 개수

| 상황 | size 파라미터 | max_results |
|------|--------------|-------------|
| 일반 검색 | 15 | 10 |
| 리뷰 필터 적용 | 30 | 10 (필터 후) |
| 복수 키워드 | 10 (키워드당) | 10 (통합 후) |

## 예시: 단순 반경 검색

**쿼리**: "강남역 근처 카페"

```json
{
  "strategy_type": "radius",
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
        "radius": 1000,
        "size": 15
      }
    }
  ],
  "post_processing": {
    "sort_by": "distance",
    "max_results": 10
  }
}
```

## 예시: 맥락 포함 반경 검색

**쿼리**: "홍대 근처 작업하기 좋은 카페"

**Translator 결과**:
```json
{
  "search_keywords": ["카페", "스터디카페"],
  "review_check_keywords": ["콘센트", "와이파이"]
}
```

**검색 계획**:
```json
{
  "strategy_type": "radius",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "params": { "query": "홍대입구역" }
    },
    {
      "step": 2,
      "action": "keyword_search",
      "params": {
        "query": "카페",
        "x": "${step1.x}",
        "y": "${step1.y}",
        "radius": 1000,
        "size": 20
      }
    }
  ],
  "post_processing": {
    "filter_by_review": true,
    "review_keywords": ["콘센트", "와이파이"],
    "sort_by": "relevance",
    "max_results": 10
  }
}
```

---

## 거점 실거리 전략 (point_travel)

기준점에서 **실제 이동거리** 기반으로 장소를 필터링하는 전략입니다.

### 적용 조건

Translator가 다음을 반환하면 point_travel 전략 사용:
- `distanceMode: "point_travel"`
- `requires_distance_filter: true`

| 패턴 | 예시 |
|------|------|
| ~에서 Nkm 이내 | "숙소에서 5km 이내 맛집" |
| ~에서 N분 이내 | "호텔에서 10분 이내" |
| 걸어서 N분 | "걸어서 15분 거리 카페" |
| 차로 N분 | "차로 10분 이내 음식점" |

### 검색 계획 템플릿

```json
{
  "strategy_type": "point_travel",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "description": "기준점 좌표 변환",
      "params": { "query": "{기준점}" }
    },
    {
      "step": 2,
      "action": "keyword_search",
      "description": "확장 반경으로 후보 검색",
      "params": {
        "query": "{검색어}",
        "x": "${step1.x}",
        "y": "${step1.y}",
        "radius": "{threshold × 1.5}",
        "size": 30
      }
    },
    {
      "step": 3,
      "action": "distance_filter",
      "description": "실거리 기반 필터링",
      "params": {
        "origin": { "lat": "${step1.y}", "lng": "${step1.x}" },
        "places": "${step2.places}",
        "threshold": "{distanceThreshold}",
        "mode": "{travelMode}"
      }
    }
  ],
  "post_processing": {
    "sort_by": "travelDistance",
    "max_results": 10
  }
}
```

### 확장 반경 계산

실거리 > 직선거리이므로, 직선거리 기준 검색으로는 실거리 이내 장소를 놓칠 수 있습니다.
따라서 **threshold × 1.5**로 넉넉히 검색 후 실거리로 정밀 필터링합니다.

| threshold | 검색 반경 (radius) | 이유 |
|-----------|-------------------|------|
| 2000m | 3000m | 도보 거리, 우회로 고려 |
| 5000m | 7500m | 시내 이동, 도로 구조 고려 |
| 10000m | 15000m | 장거리, 도로 편차 클 수 있음 |

### travelMode 자동 결정

| 조건 | travelMode | 이유 |
|------|-----------|------|
| threshold ≤ 2000m | walking | 도보 거리 |
| threshold > 2000m | driving | 차량 이동 가정 |
| "도보", "걸어서" 명시 | walking | 사용자 override |
| "차로", "자동차" 명시 | driving | 사용자 override |

### distance_filter 결과 정렬

필터링 후 `travelDistance` (실거리) 기준으로 정렬합니다.

### Fallback

Distance Matrix API 실패 시:
- Haversine 직선거리로 필터링
- 결과에 경고 메시지 포함: "실거리 계산이 불가하여 직선거리로 필터링했습니다"

### 예시: 숙소에서 도보 10분 이내

**쿼리**: "숙소에서 걸어서 10분 이내 맛집"

**Translator 결과**:
```json
{
  "distanceMode": "point_travel",
  "distanceThreshold": 800,
  "travelMode": "walking",
  "requires_distance_filter": true
}
```

**검색 계획**:
```json
{
  "strategy_type": "point_travel",
  "search_plan": [
    { "step": 1, "action": "geocode", "params": { "query": "숙소 주소" } },
    {
      "step": 2, "action": "keyword_search",
      "params": {
        "query": "맛집",
        "x": "${step1.x}", "y": "${step1.y}",
        "radius": 1200,
        "size": 30
      }
    },
    {
      "step": 3, "action": "distance_filter",
      "params": {
        "origin": { "lat": "${step1.y}", "lng": "${step1.x}" },
        "places": "${step2.places}",
        "threshold": 800,
        "mode": "walking"
      }
    }
  ],
  "post_processing": {
    "sort_by": "travelDistance",
    "max_results": 10
  }
}
```
