# Guide Schema - 가이드 데이터 스키마 명세

Insight Agent의 출력과 `templates/travel-planner.html`의 `renderGuide()` 함수가 공유하는 **단일 진실 원천(Single Source of Truth)**.

## GuideSchema (전체 구조)

```typescript
interface GuideSchema {
  sections: SectionSchema[];   // 카테고리별 섹션 (3~10개)
  tips: string[];              // 맥락 기반 실용 팁 (한국어)
  warnings: WarningSchema[];   // 리뷰에서 감지된 주의사항
}
```

## SectionSchema (카테고리 섹션)

```typescript
interface SectionSchema {
  id: string;              // kebab-case 고유 ID (예: "ocean-view", "kids-play")
  icon: string;            // 이모지 1개 (예: "🌅", "🎪")
  title: string;           // 한국어, 15자 이내 (예: "오션뷰 & 선셋 맛집")
  description: string;     // 한국어, 30자 이내 (예: "바다 전망과 석양을 감상하며 식사할 수 있는 곳")
  reason: string;          // 한국어, 2-3문장 — 왜 이 카테고리로 분류했는지
  placeIds: string[];      // APP_DATA.places[].id 참조 (해당 카테고리에 속하는 장소 ID들)
  evidence: EvidenceSchema[]; // 리뷰 증거 (최대 10개)
}
```

### id 명명 규칙

- kebab-case 사용 (예: `kids-play`, `ocean-view`, `budget-friendly`)
- 영문 소문자 + 하이픈만 사용
- 카테고리의 핵심 키워드를 반영

### title 작성 규칙

- 한국어로 작성
- 15자 이내
- 명사형 또는 "~한 곳" 형태
- 예: "아이 놀이공간이 있는 식당", "가성비 좋은 곳"

### reason 작성 규칙

- 한국어로 작성
- 2-3문장
- **왜 이 카테고리를 만들었는지** 설명
- **어떤 리뷰 근거**로 분류했는지 언급
- **검색 맥락과의 연관성** 포함
- 예: "리뷰에서 '수영장(pool)', '놀이공간(play area)' 등을 언급한 식당들이에요. 아이가 놀고 있는 동안 어른들은 여유롭게 식사할 수 있어서, 가족 여행에 특히 유용한 곳들이에요."

## EvidenceSchema (리뷰 증거)

```typescript
interface EvidenceSchema {
  placeId: string;         // APP_DATA.places[].id 참조
  placeName: string;       // 장소 표시 이름
  text: string;            // 리뷰 원문 (150자 이내)
  translatedText: string;  // 한국어 번역
  author: string;          // 리뷰 작성자명
  rating: number;          // 1-5 별점
}
```

## WarningSchema (주의사항)

```typescript
interface WarningSchema {
  placeId: string;         // APP_DATA.places[].id 참조
  placeName: string;       // 장소 표시 이름
  text: string;            // 한국어 주의사항 메시지
}
```

## 카테고리 생성 규칙

### 수량 제한

- 최소 3개, 최대 10개 카테고리 생성
- 1곳 이상 매칭되는 카테고리만 포함
- 매칭 장소 수 내림차순 정렬

### 동적 생성 원칙

카테고리는 **검색 맥락에 따라 동적으로 생성**한다. 하드코딩된 카테고리 목록을 사용하지 않는다.

| 검색 맥락 | 동적 생성 카테고리 예시 |
|-----------|----------------------|
| 가족 맛집 (꼬란타) | 아이 놀이공간, 키즈 메뉴, 오션뷰, 가성비, 브런치, 태국 음식, 분위기 |
| 도쿄 라멘 | 츠케멘 맛집, 돈코츠 전문, 심야 영업, 줄 서는 맛집, 가성비, 비건 옵션 |
| 강남 카페 | 작업하기 좋은, 뷰 좋은, 디저트 맛집, 넓은 공간, 콘센트 있는, 조용한 |
| 부산 회 | 신선도 좋은, 가성비, 뷰 좋은, 코스 추천, 사시미 전문, 현지인 맛집 |

### 매칭 기준

- 정규식이 아닌 **LLM 의미 기반 분석**으로 매칭
- 리뷰 원문의 의미를 파악하여 카테고리에 할당
- 예: "my kids loved the pool" → "아이 놀이공간" 카테고리

## 증거(evidence) 추출 규칙

### 원문 처리

- 리뷰 원문 150자 초과 시 잘라서 `"..."` 붙임
- 같은 리뷰에서 중복 추출 금지

### 번역 규칙

- `translatedText`는 **반드시 한국어**
- 원문이 한국어이면 원문을 그대로 복사
- 원문이 영어/태국어 등이면 자연스러운 한국어로 번역

### 수량 제한

- 섹션당 최대 10개

### 정렬

- rating 높은 순으로 정렬 (같은 rating이면 텍스트 길이가 긴 것 우선)

## 주의사항(warnings) 규칙

### 감지 대상

리뷰에서 다음 패턴을 감지하여 주의사항을 생성:

| 패턴 | 주의사항 메시지 |
|------|----------------|
| 현금만 가능 | "현금만 가능 (Cash Only)" |
| 사전 예약 필요 | "사전 예약 권장" |
| 대기 시간 김 | "대기 시간이 길 수 있음" |
| 특정 요일 휴무 | "X요일 휴무 가능" |
| 가격 높음 | "가격이 다소 높은 편" |
| 모기/벌레 | "야외석 모기 주의" |
| 에어컨 없음 | "에어컨 없음 (야외/선풍기)" |

### 중복 방지

- 같은 장소 + 같은 메시지 조합은 1개만 포함

## 팁(tips) 규칙

### 생성 기준

- 검색 맥락(쿼리, 인원수, 숙소, 지역)을 기반으로 **실용적인 팁** 생성
- 이동 수단, 예약 팁, 피크 시간대, 현지 관습 등
- 한국어로 작성
- 5~10개 권장

### 팁 유형

| 유형 | 예시 |
|------|------|
| 이동 수단 | "Grab 앱으로 이동하면 가장 편리" |
| 예약 | "저녁 6~8시가 피크타임 — 인기 식당은 예약 권장" |
| 인원 관련 | "N인 가족이면 대형 테이블 사전 요청 필수" |
| 현지 팁 | "태국 음식 매운맛 주의 — 'not spicy' 요청 가능" |
| 결제 | "대부분 현금+카드 가능하지만 소규모 식당은 현금 준비" |
| 도보 가능 | "숙소에서 도보 가능한 식당: N곳" |

## 출력 예시

```json
{
  "sections": [
    {
      "id": "ocean-view",
      "icon": "🌅",
      "title": "오션뷰 & 선셋 맛집",
      "description": "바다 전망과 석양을 감상하며 식사할 수 있는 곳",
      "reason": "리뷰에서 'sea view', 'sunset', 'beachside' 등 뷰를 칭찬하는 리뷰가 많은 식당들이에요. 꼬란타의 아름다운 석양을 감상하며 식사할 수 있는 특별한 경험을 원한다면 추천해요.",
      "placeIds": ["ChIJ_abc123", "ChIJ_def456"],
      "evidence": [
        {
          "placeId": "ChIJ_abc123",
          "placeName": "The Beach Restaurant",
          "text": "Amazing sunset view from the terrace. We had dinner while watching the sun go down.",
          "translatedText": "테라스에서 보는 석양이 정말 멋져요. 해가 지는 걸 보며 저녁 식사를 했어요.",
          "author": "John D.",
          "rating": 5
        }
      ]
    }
  ],
  "tips": [
    "숙소에서 도보 가능한 식당: 5곳",
    "Grab 앱으로 이동하면 가장 편리 (꼬란타는 일반 택시 없음)",
    "저녁 6~8시가 피크타임 — 인기 식당은 예약 권장"
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

## 템플릿 호환성

이 스키마는 `templates/travel-planner.html`의 `renderGuide()` 함수와 직접 호환됩니다:

| 스키마 필드 | 템플릿 렌더링 |
|------------|-------------|
| `section.reason` | 파란색 박스로 표시 |
| `evidence.translatedText` | 기본 표시, 원문 접기/펼치기 |
| `evidence.text` | 접기/펼치기로 원문 확인 |
| `tips[]` | 팁 섹션 렌더링 |
| `warnings[]` | 주의사항 섹션 렌더링 |
| `section.placeIds` | 3패널 연동 (지도↔좌측↔우측) |
