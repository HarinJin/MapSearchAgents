# 시간 조건 감지 사전

Translator Agent가 시간 관련 쿼리를 감지하기 위한 참조 문서입니다.

## 시간 조건 감지 키워드

### 명시적 시간 표현

| 패턴 | 예시 | time_condition |
|------|------|----------------|
| 지금/현재 | "지금 갈 수 있는", "현재 영업중인" | `{ "type": "now" }` |
| 오전/오후 N시 | "오후 4시에", "오전 11시쯤" | `{ "type": "specific", "hour": N }` |
| N시 | "3시에 갈 건데", "8시까지" | `{ "type": "specific", "hour": N }` |
| 아침/점심/저녁/밤 | "저녁에 갈", "점심 먹을" | `{ "type": "period", "period": "..." }` |

### 암시적 시간 표현

| 패턴 | 해석 | time_condition |
|------|------|----------------|
| 영업중인 | 현재 시간 기준 | `{ "type": "now", "filter": "open_now" }` |
| 문 연 | 현재 시간 기준 | `{ "type": "now", "filter": "open_now" }` |
| 늦게까지 하는 | 22시 이후 영업 | `{ "type": "late_night" }` |
| 24시/새벽 | 심야 영업 | `{ "type": "overnight" }` |
| 일찍 여는 | 08시 이전 오픈 | `{ "type": "early_morning" }` |

### 시간대 매핑

| 표현 | 시간 범위 |
|------|----------|
| 아침 | 06:00 - 10:00 |
| 점심 | 11:00 - 14:00 |
| 오후 | 14:00 - 17:00 |
| 저녁 | 17:00 - 21:00 |
| 밤 | 21:00 - 24:00 |
| 새벽 | 00:00 - 06:00 |

## 출력 형식

시간 조건이 감지되면 Translator 결과에 포함:

```json
{
  "search_keywords": ["일식", "초밥"],
  "category_codes": ["FD6"],
  "time_condition": {
    "type": "now",
    "filter": "open_now",
    "check_closing_soon": true
  },
  "requires_enrichment": true
}
```

### time_condition 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| type | string | "now", "specific", "period", "late_night", "overnight", "early_morning" |
| hour | number | 특정 시간 (type=specific일 때) |
| period | string | 시간대 (type=period일 때) |
| filter | string | "open_now" - 현재 영업중만 필터링 |
| check_closing_soon | boolean | true면 폐장 2시간 이내 알림 |

### requires_enrichment

- `true`: PlaceEnricher 호출 필요 (Google API로 영업시간 조회)
- `false` 또는 없음: 카카오 결과만 반환

## 감지 예시

### 예시 1: 명시적 현재 시간

**입력**: "지금 갈 수 있는 일식집 찾아줘"

**감지**:
- 키워드: "지금"
- 시간 조건: 현재 영업중

**출력**:
```json
{
  "search_keywords": ["일식", "초밥", "스시"],
  "time_condition": {
    "type": "now",
    "filter": "open_now",
    "check_closing_soon": true
  },
  "requires_enrichment": true
}
```

### 예시 2: 특정 시간

**입력**: "오후 4시인데 어디에서 저녁을 먹을까?"

**감지**:
- 키워드: "오후 4시"
- 시간 조건: 16:00 기준

**출력**:
```json
{
  "search_keywords": ["음식점", "저녁"],
  "time_condition": {
    "type": "specific",
    "hour": 16,
    "check_closing_soon": true
  },
  "requires_enrichment": true
}
```

### 예시 3: 시간 조건 없음

**입력**: "강남역 근처 카페 추천해줘"

**감지**:
- 시간 관련 키워드 없음

**출력**:
```json
{
  "search_keywords": ["카페"],
  "requires_enrichment": false
}
```

## 폐장 임박 알림 규칙

`check_closing_soon: true`일 때:

| 남은 시간 | 알림 |
|----------|------|
| 2시간 이내 | ⚠️ "곧 문 닫아요 (N시 폐장)" |
| 1시간 이내 | 🚨 "1시간 내 폐장! 서두르세요" |
| 30분 이내 | 결과에서 제외 또는 맨 뒤로 |

## 신뢰도

| 표현 유형 | 신뢰도 |
|----------|--------|
| 명시적 시간 ("오후 3시") | 0.98 |
| 현재 키워드 ("지금", "현재") | 0.95 |
| 시간대 ("저녁에") | 0.90 |
| 암시적 ("영업중인") | 0.85 |
