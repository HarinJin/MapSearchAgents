---
name: map-search
description: 자연어 기반 지도 검색 에이전트 시스템. "노가리 까기 좋은 곳", "강남에서 판교 가는 길에 속이 편한 음식점" 같은 맥락적 검색을 처리합니다. 은어/맥락 해석, 검색 전략 수립, API 실행을 순차적으로 수행합니다.
triggers:
  - "근처"
  - "찾아줘"
  - "어디"
  - "맛집"
  - "카페"
  - "음식점"
  - "가는 길에"
  - "추천"
  - "이내"
  - "걸어서"
  - "차로"
  - "km"
  - "분 거리"
---

# Map Search - 자연어 지도 검색 스킬

자연어 쿼리를 받아 카카오맵 API로 장소를 검색하는 에이전트 오케스트레이터입니다.

## 처리 흐름

```
사용자 쿼리
    ↓
[1] 쿼리 분류 (단순/맥락/경로/복합/시간)
    ↓
[2] 은어/맥락/시간 감지 → Translator Agent (references/slang-*.md 참조)
    ↓
[3] 검색 전략 수립 → MapSearch Agent (references/strategy-*.md 참조)
    ↓
[4] API 실행 → APIPicker Agent (references/api-commands.md 참조)
    ↓
[5] (시간 조건 있으면) PlaceEnricher Agent (references/api-google-places.md 참조)
    ↓
[5.5] Google Places Details 수집 (리뷰 데이터)
    ↓
[6] Insight Agent — 가이드 인사이트 생성 (references/guide-schema.md 참조)
    ↓
[6.5] 결과 통합 + HTML 페이지 생성
```

## 쿼리 분류

| 유형 | 패턴 | 에이전트 호출 |
|------|------|--------------|
| simple | "강남역 근처 카페" | MapSearch → APIPicker |
| contextual | "노가리 까기 좋은 곳" | **Translator** → MapSearch → APIPicker |
| route | "강남에서 판교 가는 길에" | MapSearch → APIPicker (다중) |
| complex | "강남에서 판교 가는 길에 속이 편한" | **Translator** → MapSearch → APIPicker (다중) |

## 은어/맥락 감지 키워드

### 음식 (→ references/slang-food.md)
- 속이 편한, 해장, 노가리, 가성비, 혼밥, 회식

### 공간 (→ references/slang-space.md)
- 작업하기 좋은, 힙한, 조용한, 뷰 좋은, 감성적인

### 활동 (→ references/slang-activity.md)
- 데이트, 혼술, 2차, 브런치

### 맥락 (→ references/slang-context.md)
- 20대, 30대, 직장인, 대학생, 가족

### 경로 키워드
- ~에서 ~가는 길에, ~와 ~ 사이에, 경유지, 중간에

### ⏰ 시간 조건 (→ references/slang-time.md) - PlaceEnricher 트리거
- 지금, 현재, 영업중인, 문 연
- 오전/오후 N시, N시에
- 아침, 점심, 저녁, 밤, 새벽
- 늦게까지, 24시

## 에이전트 호출

### 1. Translator Agent

은어/맥락이 감지되면 호출:

```
Task(
  subagent_type: "translator",
  prompt: |
    다음 쿼리의 은어/맥락을 해석해주세요.

    쿼리: {query}
    감지된 표현: {expressions}

    references/slang-*.md 파일들을 참조하여 해석하세요.
)
```

**기대 출력**:
```json
{
  "interpretation": "해석된 의미",
  "search_keywords": ["키워드1", "키워드2"],
  "category_codes": ["FD6"],
  "review_check_keywords": ["리뷰 키워드"],
  "confidence": 0.85
}
```

### 2. MapSearch Agent

검색 전략 수립:

```
Task(
  subagent_type: "map-search",
  prompt: |
    검색 전략을 수립해주세요.

    원본 쿼리: {query}
    해석 결과: {translator_result}

    references/strategy-*.md 파일들을 참조하세요.
)
```

**기대 출력**:
```json
{
  "strategy_type": "radius|route",
  "search_plan": [...],
  "post_processing": {...}
}
```

### 3. APIPicker Agent

API 실행:

```
Task(
  subagent_type: "api-picker",
  prompt: |
    다음 검색 계획을 실행해주세요.

    검색 계획: {search_plan}

    references/api-commands.md를 참조하세요.
)
```

**기대 출력**:
```json
{
  "success": true,
  "results": [...],
  "meta": {...}
}
```

### 4. PlaceEnricher Agent (시간 조건 있을 때만)

Translator의 `requires_enrichment: true`일 때 호출:

```
Task(
  subagent_type: "place-enricher",
  prompt: |
    다음 장소들의 영업시간을 확인해주세요.

    장소 목록: {api_picker_results}
    시간 조건: {time_condition}

    references/api-google-places.md를 참조하세요.
)
```

**기대 출력**:
```json
{
  "enriched_places": [...],
  "filtered_out": [...],
  "warnings": [{ "place_name": "...", "message": "⚠️ 1시간 후 폐장" }],
  "meta": { "google_api_calls": 10 }
}
```

### 5. Google Places 보강 (별점 + 사진 + 리뷰)

**자동 트리거 조건**: 검색 결과가 **5개 이상**이면 자동 실행

APIPicker 결과의 장소들에 대해 Google Places API로 보강:

1. **Find + Details**: 각 장소를 Google에서 찾아 `rating`, `reviewCount`, `photoUrl` 추가
2. **Reviews 수집**: 각 장소의 리뷰 텍스트 수집 (Insight Agent 입력용)

```
# Step 1: 장소별 Google Place ID 찾기 + 상세 정보 (rating, photo)
google-places.js find "{displayName}" --lat={lat} --lng={lng}
google-places.js details {PLACE_ID} --fields=name,rating,user_ratings_total,photos,editorial_summary

# Step 2: 리뷰 수집
google-places.js details {PLACE_ID} --fields=name,rating,user_ratings_total,reviews,editorial_summary
```

보강 결과를 `enriched.json`에, 리뷰를 `details-raw.json`에 저장합니다.

### 6. Insight Agent (자동 트리거)

**자동 트리거 조건**: 검색 결과가 **5개 이상**이고 리뷰 데이터가 수집된 경우 자동 실행

Google Places Details로 리뷰를 수집한 후 호출:

```
Task(
  subagent_type: "insight",
  prompt: |
    다음 검색 결과를 분석하여 가이드 인사이트를 생성해주세요.

    검색 맥락: {query + 조건}
    장소 데이터: output/{slug}-enriched.json
    리뷰 데이터: output/{slug}-details-raw.json

    references/guide-schema.md를 참조하여 출력하세요.
)
```

**기대 출력**: `guide-schema.md`의 `GuideSchema`를 따르는 JSON 객체
```json
{
  "sections": [
    {
      "id": "ocean-view",
      "icon": "🌅",
      "title": "오션뷰 & 선셋 맛집",
      "description": "바다 전망과 석양을 감상하며 식사할 수 있는 곳",
      "reason": "리뷰에서 뷰를 칭찬하는 리뷰가 많은 식당들이에요...",
      "placeIds": ["ChIJ_abc123"],
      "evidence": [...]
    }
  ],
  "tips": ["숙소에서 도보 가능한 식당: 5곳", ...],
  "warnings": [{ "placeId": "...", "placeName": "...", "text": "사전 예약 권장" }]
}
```

Insight Agent 출력은 `APP_DATA.guide`에 병합하여 `generate-page.js`로 HTML을 생성합니다.

## 결과 통합

1. **중복 제거**: place_url 기준
2. **정렬**: 거리순 또는 관련성순
3. **상위 10개** 선별
4. **형식화**: 사용자 친화적 응답

## 응답 형식

```markdown
📍 "{쿼리}" 검색 결과

1. **{장소명}**
   - 주소: {주소}
   - 카테고리: {카테고리}
   - 거리: {거리}m
   - [상세보기]({place_url})

2. ...

---
총 {n}개 장소를 찾았습니다.
```

## 신뢰도 처리

| confidence | 처리 |
|------------|------|
| 0.9+ | 바로 진행 |
| 0.7-0.89 | 진행, 해석 명시 |
| 0.5-0.69 | 진행, 불확실성 안내 |
| 0.5 미만 | 사용자 확인 요청 |

## References

- `references/slang-food.md` - 음식 관련 은어 사전
- `references/slang-space.md` - 공간 관련 은어 사전
- `references/slang-activity.md` - 활동 관련 은어 사전
- `references/slang-context.md` - 맥락(연령대, 직업) 사전
- `references/slang-time.md` - ⏰ 시간 조건 감지 사전
- `references/slang-distance.md` - 📏 거리/이동수단 키워드 사전
- `references/strategy-radius.md` - 반경 검색 전략 + 거점 실거리 전략
- `references/strategy-route.md` - 경로 검색 전략
- `references/api-commands.md` - 카카오맵 API 명령어
- `references/api-google-places.md` - Google Places API 명령어 (영업시간)
- `references/guide-schema.md` - 가이드 데이터 스키마 (Insight Agent 출력 계약)

## 사용 예시

```
/map-search 강남역 근처 작업하기 좋은 카페
/map-search 노가리 까기 좋은 곳
/map-search 강남에서 판교 가는 길에 속이 편한 음식점
```

또는 자연어로:
```
"홍대 근처 힙한 카페 추천해줘"
"회식 장소 찾아줘 역삼역 근처"
```

### 📏 거리/경로 조건 예시 (Distance Mode)

```
"숙소에서 5km 이내 맛집"
"걸어서 10분 이내 카페"
"차로 15분 거리 음식점"
"속초에서 광교까지 이동 중 맛집"
"서울에서 부산 가는 길에 휴게소 맛집"
```

### ⏰ 시간 조건 예시 (PlaceEnricher 호출)

```
"지금 갈 수 있는 일식집 찾아줘"
"오후 4시인데 어디에서 저녁을 먹을까?"
"현재 영업중인 카페 추천해줘"
"늦게까지 하는 술집 없나?"
```
