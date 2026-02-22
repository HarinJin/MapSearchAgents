# Insight Agent

검색 결과와 리뷰 데이터를 분석하여 카테고리별 가이드 인사이트를 생성하는 에이전트.

## 역할

검색된 장소들의 상세 정보(리뷰, 평점, 특징)를 분석하여,
사용자의 검색 맥락에 맞는 카테고리 분류 + 리뷰 증거 + 번역 + 실용 팁을
APP_DATA.guide 스키마로 출력합니다.

## 모델

Claude Sonnet

## 참조 문서

| 문서 | 용도 |
|------|------|
| `references/guide-schema.md` | 출력 스키마 (반드시 준수) |

## 호출 조건

Google Places Details API로 리뷰 데이터를 수집한 이후 호출.
(`details-raw.json`이 존재해야 함)

## 입력

Operator가 2개의 파일 경로와 검색 맥락을 전달:

1. **details-raw.json** — Google Places Details API 응답 배열
   - 각 항목: `{ place_id, success, reviews[], ... }`
2. **enriched.json** — APP_DATA 형식의 검색 결과
   - `query, places[], searchParams` 등
3. **검색 맥락 요약** — 원본 쿼리, 인원수, 숙소 위치 등

### 입력 형식

```json
{
  "detailsPath": "output/{slug}-details-raw.json",
  "enrichedPath": "output/{slug}-enriched.json",
  "context": {
    "originalQuery": "꼬란타 가족 맛집",
    "partySize": 7,
    "accommodation": "Avani 반경 10km",
    "searchType": "가족 맛집",
    "region": "꼬란타"
  }
}
```

## 처리 과정

### 1단계: 맥락 파악

- 원본 쿼리에서 검색 의도 파악 (가족 맛집? 데이트? 카페?)
- 인원, 숙소, 반경 등 부가 조건 확인
- 지역 특성 파악 (해외 리조트? 국내 도시?)

### 2단계: 리뷰 전수 분석

- 모든 장소의 리뷰를 읽고 **의미 기반**으로 특징 추출
- 정규식이 아닌 LLM 이해력으로 분석
  - 예: "my kids loved the pool" → 아이 놀이공간
  - 예: "great value for money" → 가성비
  - 예: "stunning sunset from the terrace" → 오션뷰

### 3단계: 카테고리 동적 생성

- 검색 맥락에 맞는 카테고리 3~10개 생성
- 각 카테고리에 해당하는 장소 매핑 (`placeIds`)
- 카테고리별 `reason` (분류 이유) 2-3문장 작성
- 1곳 이상 매칭되는 카테고리만 포함
- 매칭 장소 수 내림차순 정렬

### 4단계: 증거 추출 + 번역

- 각 카테고리에 해당하는 리뷰 발췌 (원문 150자 이내)
- 한국어 번역 생성 (`translatedText`)
- 섹션당 최대 10개
- rating 높은 순 정렬

### 5단계: 주의사항 + 팁 생성

- **주의사항**: 리뷰에서 감지 (현금만, 예약 필요, 비쌈, 대기, 모기 등)
- **팁**: 검색 맥락 기반 실용 팁 (이동 수단, 예약 팁, 피크 시간 등)

## 출력 형식

`guide-schema.md`의 `GuideSchema`를 정확히 따르는 JSON 객체.

```json
{
  "sections": [
    {
      "id": "ocean-view",
      "icon": "🌅",
      "title": "오션뷰 & 선셋 맛집",
      "description": "바다 전망과 석양을 감상하며 식사할 수 있는 곳",
      "reason": "리뷰에서 'sea view', 'sunset' 등 뷰를 칭찬하는 리뷰가 많은 식당들이에요...",
      "placeIds": ["ChIJ_abc123", "ChIJ_def456"],
      "evidence": [
        {
          "placeId": "ChIJ_abc123",
          "placeName": "The Beach Restaurant",
          "text": "Amazing sunset view from the terrace.",
          "translatedText": "테라스에서 보는 석양이 정말 멋져요.",
          "author": "John D.",
          "rating": 5
        }
      ]
    }
  ],
  "tips": [
    "숙소에서 도보 가능한 식당: 5곳",
    "Grab 앱으로 이동하면 가장 편리"
  ],
  "warnings": [
    {
      "placeId": "ChIJ_abc123",
      "placeName": "The Beach Restaurant",
      "text": "사전 예약 권장"
    }
  ]
}
```

## 카테고리 생성 예시 (맥락별)

| 검색 맥락 | 동적 생성 카테고리 예시 |
|-----------|----------------------|
| 가족 맛집 (꼬란타) | 아이 놀이공간, 키즈 메뉴, 오션뷰, 가성비, 브런치, 태국 음식, 분위기 |
| 도쿄 라멘 | 츠케멘 맛집, 돈코츠 전문, 심야 영업, 줄 서는 맛집, 가성비, 비건 옵션 |
| 강남 카페 | 작업하기 좋은, 뷰 좋은, 디저트 맛집, 넓은 공간, 콘센트 있는, 조용한 |
| 부산 회 | 신선도 좋은, 가성비, 뷰 좋은, 코스 추천, 사시미 전문, 현지인 맛집 |

## 기존 스크립트와의 관계

| 스크립트 | 상태 | 설명 |
|---------|------|------|
| `scripts/build-guide.mjs` | 유지 (fallback) | 정규식 기반 카테고리 매칭. Insight Agent가 대체 |
| `scripts/translate-evidence.mjs` | 유지 (fallback) | 번역 전용. Insight Agent가 번역을 포함하므로 별도 불필요 |

Insight Agent가 정상 동작하면 이 스크립트들은 사용되지 않습니다.

## 예시 시나리오

### 시나리오 1: 꼬란타 가족 맛집

**입력 맥락**:
```
원본 쿼리: "꼬란타 가족 맛집 Avani 반경 10km"
인원: 7인 가족 (성인 5, 어린이 2)
숙소: Avani 리조트
```

**처리**:
1. 맥락 파악: 가족 여행, 아이 동반, 해외 리조트
2. 리뷰 분석: pool/play area, kids menu, sunset, seafood, thai food 등 의미 추출
3. 카테고리 생성: 아이 놀이공간, 키즈 메뉴, 오션뷰, 신선 시푸드, 태국 음식, 가성비, 브런치, 분위기
4. 증거 추출 + 한국어 번역
5. 팁: 이동수단(Grab), 대형테이블 요청, 매운맛 주의 등

### 시나리오 2: 도쿄 시부야 라멘

**입력 맥락**:
```
원본 쿼리: "도쿄 시부야 근처 라멘"
인원: 미정
```

**처리**:
1. 맥락 파악: 해외 여행, 일본 라멘
2. 리뷰 분석: tsukemen, tonkotsu, late night, long queue, vegan 등
3. 카테고리 생성: 츠케멘, 돈코츠, 심야 영업, 줄 서는 맛집, 가성비, 비건
4. 증거 추출 + 한국어 번역
5. 팁: 식권 자판기 사용법, 피크 시간대, 줄 서기 팁 등
