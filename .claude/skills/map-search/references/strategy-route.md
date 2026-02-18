# 경로 검색 전략

MapSearch Agent가 참조하는 경로(route) 기반 검색 전략 문서입니다.

## 개요

출발지와 도착지 사이의 경로를 구간화하여 각 구간에서 장소를 검색하는 전략입니다.

**현재 구현**: 직선거리(Haversine) 기반 구간화 (카카오 모빌리티 API 미사용)

## 적용 조건

다음 패턴이 감지되면 route 전략 사용:

| 패턴 | 예시 |
|------|------|
| ~에서 ~가는 길에 | "강남에서 판교 가는 길에" |
| ~와 ~ 사이에 | "강남역과 역삼역 사이에" |
| 경유지 | "강남 경유해서" |
| 중간에 | "둘 사이 중간에" |

## 검색 계획 템플릿

```json
{
  "strategy_type": "route",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "description": "출발지 좌표 변환",
      "api": "geocode",
      "params": { "query": "{출발지}" }
    },
    {
      "step": 2,
      "action": "geocode",
      "description": "도착지 좌표 변환",
      "api": "geocode",
      "params": { "query": "{도착지}" }
    },
    {
      "step": 3,
      "action": "segment_route",
      "description": "경로 구간화",
      "params": {
        "start": { "x": "${step1.x}", "y": "${step1.y}" },
        "end": { "x": "${step2.x}", "y": "${step2.y}" },
        "interval": 5000,
        "searchRadius": 2000
      }
    },
    {
      "step": 4,
      "action": "multi_point_search",
      "description": "각 구간에서 검색",
      "params": {
        "query": "{검색어}",
        "points": "${step3.segments}",
        "radius": 2000
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

## 구간화 파라미터

### interval (구간 간격)

| 총 거리 | 권장 간격 | 구간 수 |
|---------|----------|---------|
| ~5km | 2000m | 2-3개 |
| 5-15km | 5000m | 3-4개 |
| 15-30km | 7000m | 4-5개 |
| 30km+ | 10000m | 적정 유지 |

### searchRadius (검색 반경)

| 상황 | 반경 | 이유 |
|------|------|------|
| 도심 경로 | 1500-2000m | 밀집도 높음 |
| 외곽 경로 | 2000-3000m | 밀집도 낮음 |
| 고속도로 | 3000-5000m | 휴게소/톨게이트 고려 |

## 구간 중심점 계산

직선거리 기반 선형 보간:

```javascript
// 시작점과 끝점 사이의 fraction 지점 계산
function interpolatePoint(start, end, fraction) {
  return {
    x: start.x + (end.x - start.x) * fraction,
    y: start.y + (end.y - start.y) * fraction
  };
}

// 구간 생성
// interval = 5000m, 총 거리 = 15000m
// → fraction: 0, 0.33, 0.66, 1.0
// → 4개 구간 (시작, 1/3, 2/3, 끝)
```

## 복수 키워드 경로 검색

Translator가 여러 키워드를 반환한 경우:

```json
{
  "step": 4,
  "action": "multi_point_multi_keyword_search",
  "params": {
    "queries": ["해장국", "죽", "우동"],
    "points": "${step3.segments}",
    "radius": 2000
  }
}
```

각 구간에서 각 키워드로 검색 → 결과 통합

## 결과 정렬

### distance_from_start

출발지로부터의 거리순 정렬:

```
출발지 ----[구간1]----[구간2]----[구간3]---- 도착지
        장소A(2km)  장소B(8km)  장소C(12km)
```

### route_order

경로 순서대로 그룹화:

```
📍 출발지 근처
  - 장소A, 장소B

📍 중간 지점
  - 장소C, 장소D

📍 도착지 근처
  - 장소E, 장소F
```

## 후처리

### 중복 제거 (deduplicate)

여러 구간에서 동일 장소가 검색될 수 있음:

```javascript
// place_url 기준 중복 제거
// 중복 시 출발지에 가까운 구간 결과 유지
```

### 거리 정보 추가

```json
{
  "place_name": "해장국집",
  "distance_from_start": 5200,
  "segment_label": "중간 지점",
  "route_position": "33%"
}
```

## 예시: 기본 경로 검색

**쿼리**: "강남에서 판교 가는 길에 음식점"

```json
{
  "strategy_type": "route",
  "search_plan": [
    {
      "step": 1,
      "action": "geocode",
      "params": { "query": "강남역" }
    },
    {
      "step": 2,
      "action": "geocode",
      "params": { "query": "판교역" }
    },
    {
      "step": 3,
      "action": "segment_route",
      "params": {
        "start": "${step1}",
        "end": "${step2}",
        "interval": 5000,
        "searchRadius": 2000
      }
    },
    {
      "step": 4,
      "action": "multi_point_search",
      "params": {
        "query": "음식점",
        "points": "${step3.segments}",
        "radius": 2000,
        "size": 5
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
  "search_plan": [
    { "step": 1, "action": "geocode", "params": { "query": "강남역" } },
    { "step": 2, "action": "geocode", "params": { "query": "판교역" } },
    {
      "step": 3,
      "action": "segment_route",
      "params": {
        "start": "${step1}",
        "end": "${step2}",
        "interval": 5000
      }
    },
    {
      "step": 4,
      "action": "multi_point_multi_keyword_search",
      "params": {
        "queries": ["해장국", "죽", "우동", "백반"],
        "points": "${step3.segments}",
        "radius": 2000,
        "size": 3
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
📍 강남에서 판교 가는 길에 속이 편한 음식점

🚩 출발지 근처 (강남)
1. 본죽 강남점 - 죽 전문점 (500m)
2. 신선설농탕 - 설렁탕 (800m)

🚩 중간 지점 (양재)
3. 청진동해장국 - 해장국 (5.2km)

🚩 도착지 근처 (판교)
4. 판교손칼국수 - 칼국수 (12km)
```
