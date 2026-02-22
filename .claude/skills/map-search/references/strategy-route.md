# 경로 검색 전략

MapSearch Agent가 참조하는 경로(route) 기반 검색 전략 문서입니다.

## 개요

출발지와 도착지 사이의 **실제 도로 경로(polyline)**를 기반으로 구간화하여 각 구간에서 장소를 검색하는 전략입니다.

**국내 구현**: Kakao Mobility Directions API polyline + 적응형 간격 샘플링
**해외 구현**: Google Routes API polyline + SAR 또는 적응형 간격 샘플링
**Fallback**: 직선거리(Haversine) 기반 구간화 (polyline 획득 실패 시)

## 적용 조건

다음 패턴이 감지되면 route 전략 사용:

| 패턴 | 예시 |
|------|------|
| ~에서 ~가는 길에 | "강남에서 판교 가는 길에" |
| ~에서 ~까지 | "속초에서 광교까지 이동 중" |
| ~와 ~ 사이에 | "강남역과 역삼역 사이에" |
| 경유지 | "강남 경유해서" |
| 중간에 | "둘 사이 중간에" |
| 드라이브 코스 | "드라이브 코스 맛집" |

## 검색 계획 템플릿 (Kakao — 국내)

### 기본: Kakao Mobility Polyline 기반 (권장)

```json
{
  "strategy_type": "route",
  "provider": "kakao",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "description": "출발지 좌표 변환",
      "params": { "query": "{출발지}" }
    },
    {
      "step": 2,
      "action": "geocode",
      "description": "도착지 좌표 변환",
      "params": { "query": "{도착지}" }
    },
    {
      "step": 3,
      "action": "route_polyline",
      "description": "Kakao Mobility로 실제 도로 경로 polyline 획득",
      "params": {
        "origin": { "lat": "${step1.y}", "lng": "${step1.x}" },
        "destination": { "lat": "${step2.y}", "lng": "${step2.x}" },
        "priority": "RECOMMEND"
      },
      "script": "kakao-routes.js"
    },
    {
      "step": 4,
      "action": "sample_and_search",
      "description": "polyline 위 샘플링 후 각 지점에서 검색",
      "params": {
        "polyline": "${step3.decodedPoints}",
        "queries": ["{검색어}"],
        "searchRadius": 5000
      }
    }
  ],
  "post_processing": {
    "deduplicate": true,
    "sort_by": "distance_from_start",
    "max_results": 10
  }
}
```

### Fallback: 직선 보간 (polyline 획득 실패 시)

```json
{
  "strategy_type": "route",
  "provider": "kakao",
  "fallback": true,
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "params": { "query": "{출발지}" }
    },
    {
      "step": 2,
      "action": "geocode",
      "params": { "query": "{도착지}" }
    },
    {
      "step": 3,
      "action": "segment_route",
      "description": "직선 보간 (fallback)",
      "params": {
        "start": { "x": "${step1.x}", "y": "${step1.y}" },
        "end": { "x": "${step2.x}", "y": "${step2.y}" },
        "interval": 10000,
        "searchRadius": 5000
      }
    },
    {
      "step": 4,
      "action": "multi_point_search",
      "params": {
        "query": "{검색어}",
        "points": "${step3.segments}",
        "radius": 5000
      }
    }
  ],
  "post_processing": {
    "deduplicate": true,
    "sort_by": "distance_from_start",
    "max_results": 10
  }
}
```

## 검색 계획 템플릿 (Google — 해외)

해외 경로 검색 시 Google Search Along Route (SAR) API를 사용합니다.

```json
{
  "strategy_type": "route",
  "provider": "google",
  "search_plan": [
    {
      "step": 1,
      "action": "route_polyline",
      "description": "실제 도로 경로 polyline 획득",
      "params": {
        "origin": { "lat": "{출발 위도}", "lng": "{출발 경도}" },
        "destination": { "lat": "{도착 위도}", "lng": "{도착 경도}" },
        "mode": "DRIVE"
      }
    },
    {
      "step": 2,
      "action": "google_search_along_route",
      "description": "SAR API로 경로 근처 POI 검색 (단일 호출)",
      "params": {
        "query": "{검색어}",
        "encodedPolyline": "${step1.encodedPolyline}",
        "origin": { "lat": "${step1.origin.lat}", "lng": "${step1.origin.lng}" }
      }
    }
  ],
  "post_processing": {
    "sort_by": "route_order",
    "max_results": 10
  }
}
```

## searchRadius 결정 기준

MapSearch 에이전트가 경로 특성을 판단하여 searchRadius를 결정합니다.

| 경로 특성 | searchRadius | 판단 기준 |
|----------|-------------|----------|
| 도심 경로 | 3000m | 출발지/도착지 모두 시/구 단위 도시 지역 |
| 외곽/교외 경로 | 4000m | 출발지 또는 도착지가 군/읍 단위 |
| 고속도로/장거리 | 5000m (기본값) | 총 거리 50km 초과 또는 고속도로 경유 추정 |

**기본값은 5000m**. 확실한 도심 단거리가 아니면 5000m 사용.

## 적응형 간격 공식

polyline 위에서 샘플 포인트를 추출할 때의 간격(interval) 계산:

```
interval = min(2 × searchRadius, ceil(totalDistance / 20))
```

| 원칙 | 설명 |
|------|------|
| interval ≤ 2 × radius | 검색 원들이 겹치거나 접함 (완전 커버리지) |
| 최대 포인트 수 = 20 | API 호출 상한 (비용 제어) |
| 최소 interval = radius | 과도한 오버랩 방지 |

### 경로 길이별 예상 호출 수

| 경로 | 거리 | radius | interval | 포인트 수 | API 호출 |
|------|------|--------|----------|----------|---------|
| 강남→판교 (도심) | 20km | 3km | 6km | 4 | 4 |
| 서울→수원 | 45km | 4km | 8km | 6 | 6 |
| 서울→대전 (장거리) | 160km | 5km | 10km | 16 | 16 |
| 속초→광교 (장거리) | 200km | 5km | 10km | 20 | 20 |
| 서울→부산 (초장거리) | 400km | 5km | 20km | 20 | 20 (간격↑) |

## 복수 키워드 경로 검색

Translator가 여러 키워드를 반환한 경우:

```json
{
  "step": 4,
  "action": "sample_and_search",
  "params": {
    "polyline": "${step3.decodedPoints}",
    "queries": ["해장국", "죽", "우동"],
    "searchRadius": 5000
  }
}
```

각 샘플 포인트에서 각 키워드로 검색 → 결과 통합

## 결과 정렬

### distance_from_start

경로 시작점으로부터의 경로상 거리순:

```
출발지 ━━[구간1]━━[구간2]━━[구간3]━━ 도착지
        장소A(2km)  장소B(50km) 장소C(120km)
```

### route_order (Google SAR 결과)

routingSummaries에서 origin→place 시간 순 정렬

## 후처리

### 중복 제거 (deduplicate)

여러 구간에서 동일 장소가 검색될 수 있음:
- `placeUrl` 기준 중복 제거
- 중복 시 출발지에 가까운 구간 결과 유지

### 거리 정보 추가

```json
{
  "place_name": "해장국집",
  "distance_from_start": 52000,
  "segment_label": "중간 지점",
  "route_position": "26%"
}
```

## 예시: Polyline 기반 경로 검색

**쿼리**: "속초에서 광교까지 이동 중 맛집"

```json
{
  "strategy_type": "route",
  "provider": "kakao",
  "search_plan": [
    { "step": 1, "action": "geocode", "params": { "query": "속초" } },
    { "step": 2, "action": "geocode", "params": { "query": "광교" } },
    {
      "step": 3,
      "action": "route_polyline",
      "params": {
        "origin": { "lat": "${step1.y}", "lng": "${step1.x}" },
        "destination": { "lat": "${step2.y}", "lng": "${step2.x}" },
        "mode": "DRIVE"
      }
    },
    {
      "step": 4,
      "action": "sample_and_search",
      "params": {
        "polyline": "${step3.decodedPoints}",
        "queries": ["맛집"],
        "searchRadius": 5000
      }
    }
  ],
  "post_processing": {
    "deduplicate": true,
    "sort_by": "distance_from_start",
    "max_results": 10
  }
}
```

## 예시: 맥락 포함 경로 검색

**쿼리**: "강남에서 판교 가는 길에 속이 편한 음식점"

**Translator 결과**:
```json
{
  "search_keywords": ["해장국", "죽", "우동", "백반"],
  "category_codes": ["FD6"]
}
```

**검색 계획**:
```json
{
  "strategy_type": "route",
  "provider": "kakao",
  "search_plan": [
    { "step": 1, "action": "geocode", "params": { "query": "강남역" } },
    { "step": 2, "action": "geocode", "params": { "query": "판교역" } },
    {
      "step": 3,
      "action": "route_polyline",
      "params": {
        "origin": { "lat": "${step1.y}", "lng": "${step1.x}" },
        "destination": { "lat": "${step2.y}", "lng": "${step2.x}" },
        "mode": "DRIVE"
      }
    },
    {
      "step": 4,
      "action": "sample_and_search",
      "params": {
        "polyline": "${step3.decodedPoints}",
        "queries": ["해장국", "죽", "우동", "백반"],
        "searchRadius": 3000
      }
    }
  ],
  "post_processing": {
    "deduplicate": true,
    "sort_by": "distance_from_start",
    "group_by_segment": true,
    "max_results": 10
  }
}
```

## 응답 형식 제안

경로 검색 결과는 구간별로 그룹화하여 표시:

```markdown
📍 속초에서 광교까지 이동 중 맛집

🚩 출발지 근처 (속초)
1. 속초 중앙시장 - 해산물 (2km)
2. 속초해장국 - 해장국 (3km)

🚩 중간 지점 (원주)
3. 원주 손두부 - 두부 (98km)

🚩 도착지 근처 (광교)
4. 광교 한우촌 - 한식 (195km)
```
