# 카카오맵 API 명령어 레퍼런스

APIPicker Agent가 참조하는 API 명령어 문서입니다.

## CLI 도구 경로

```bash
node scripts/kakao-search.js [command] [options]
```

## 명령어 목록

### 1. geocode - 주소/랜드마크 → 좌표

주소나 장소명을 좌표로 변환합니다.

**문법**:
```bash
node scripts/kakao-search.js geocode "주소 또는 장소명"
```

**예시**:
```bash
node scripts/kakao-search.js geocode "강남역"
node scripts/kakao-search.js geocode "서울시 강남구 역삼동"
node scripts/kakao-search.js geocode "스타벅스 강남점"
```

**출력**:
```json
{
  "success": true,
  "results": [{
    "x": 127.027610,
    "y": 37.497942,
    "address": "서울 강남구 역삼동 858",
    "place_name": "강남역 2호선",
    "type": "landmark"
  }]
}
```

**필드 설명**:
- `x`: 경도 (longitude)
- `y`: 위도 (latitude)
- `type`: "address" (주소 매칭) 또는 "landmark" (장소명 매칭)

---

### 2. keyword - 키워드 검색

키워드로 장소를 검색합니다.

**문법**:
```bash
node scripts/kakao-search.js keyword "검색어" [options]
```

**옵션**:
| 옵션 | 설명 | 기본값 |
|------|------|--------|
| --x | 경도 (중심점) | - |
| --y | 위도 (중심점) | - |
| --radius | 반경 (미터) | 2000 |
| --size | 결과 개수 | 15 |
| --page | 페이지 번호 | 1 |
| --sort | 정렬 (accuracy/distance) | accuracy |

**예시**:
```bash
# 기본 검색
node scripts/kakao-search.js keyword "카페"

# 위치 기반 검색
node scripts/kakao-search.js keyword "카페" --x=127.027610 --y=37.497942

# 반경 지정
node scripts/kakao-search.js keyword "해장국" --x=127.027 --y=37.497 --radius=1000

# 거리순 정렬
node scripts/kakao-search.js keyword "음식점" --x=127.027 --y=37.497 --sort=distance

# 결과 개수 지정
node scripts/kakao-search.js keyword "카페" --x=127.027 --y=37.497 --size=30
```

**출력**:
```json
{
  "success": true,
  "results": [
    {
      "place_name": "스타벅스 강남역점",
      "address": "서울 강남구 역삼동 858",
      "road_address": "서울 강남구 강남대로 396",
      "category": "카페 > 커피전문점 > 스타벅스",
      "category_code": "CE7",
      "phone": "02-555-1234",
      "x": 127.028123,
      "y": 37.498234,
      "distance": 150,
      "place_url": "https://place.map.kakao.com/12345678"
    }
  ],
  "meta": {
    "total_count": 45,
    "pageable_count": 45,
    "is_end": false
  }
}
```

---

### 3. category - 카테고리 검색

카테고리 코드로 장소를 검색합니다.

**문법**:
```bash
node scripts/kakao-search.js category CODE [options]
```

**카테고리 코드**:
| 코드 | 설명 |
|------|------|
| MT1 | 대형마트 |
| CS2 | 편의점 |
| PS3 | 어린이집, 유치원 |
| SC4 | 학교 |
| AC5 | 학원 |
| PK6 | 주차장 |
| OL7 | 주유소, 충전소 |
| SW8 | 지하철역 |
| BK9 | 은행 |
| CT1 | 문화시설 |
| AG2 | 중개업소 |
| PO3 | 공공기관 |
| AT4 | 관광명소 |
| AD5 | 숙박 |
| **FD6** | **음식점** |
| **CE7** | **카페** |
| HP8 | 병원 |
| PM9 | 약국 |

**예시**:
```bash
# 음식점 검색
node scripts/kakao-search.js category FD6 --x=127.027 --y=37.497

# 카페 검색
node scripts/kakao-search.js category CE7 --x=127.027 --y=37.497 --radius=500
```

---

### 4. reverse - 좌표 → 주소

좌표를 주소로 변환합니다.

**문법**:
```bash
node scripts/kakao-search.js reverse X Y
```

**예시**:
```bash
node scripts/kakao-search.js reverse 127.027610 37.497942
```

**출력**:
```json
{
  "success": true,
  "results": [{
    "address": "서울 강남구 역삼동 858",
    "road_address": "서울 강남구 강남대로 396",
    "region": {
      "region_1depth": "서울",
      "region_2depth": "강남구",
      "region_3depth": "역삼동"
    }
  }]
}
```

---

### 5. categories - 카테고리 코드 목록

사용 가능한 카테고리 코드를 출력합니다.

**문법**:
```bash
node scripts/kakao-search.js categories
```

**출력**:
```json
{
  "success": true,
  "categories": {
    "MT1": "대형마트",
    "CS2": "편의점",
    "FD6": "음식점",
    "CE7": "카페",
    ...
  }
}
```

---

## 변수 치환 규칙

검색 계획의 `${stepN.field}` 형식을 실제 값으로 치환합니다.

**예시**:
```json
{
  "step": 2,
  "params": {
    "x": "${step1.x}",
    "y": "${step1.y}"
  }
}
```

Step 1 결과가 `{ x: 127.027, y: 37.497 }`이면:
```bash
node scripts/kakao-search.js keyword "카페" --x=127.027 --y=37.497
```

---

## 다중 검색 실행

### 복수 키워드

```bash
# 순차 실행
node scripts/kakao-search.js keyword "해장국" --x=127.027 --y=37.497
node scripts/kakao-search.js keyword "죽" --x=127.027 --y=37.497
node scripts/kakao-search.js keyword "우동" --x=127.027 --y=37.497
```

### 복수 지점

```bash
# 구간 1
node scripts/kakao-search.js keyword "음식점" --x=127.027 --y=37.497 --radius=2000
# 구간 2
node scripts/kakao-search.js keyword "음식점" --x=127.050 --y=37.450 --radius=2000
# 구간 3
node scripts/kakao-search.js keyword "음식점" --x=127.100 --y=37.400 --radius=2000
```

---

## 오류 처리

### API 키 미설정

```json
{
  "success": false,
  "error": "KAKAO_REST_API_KEY is not set in .env file"
}
```

**대응**: `.env` 파일에 API 키 설정 안내

### 검색 결과 없음

```json
{
  "success": true,
  "results": [],
  "meta": { "total_count": 0 }
}
```

**대응**: 검색 반경 확대 또는 키워드 변경 제안

### API 호출 오류

```json
{
  "success": false,
  "error": "Kakao API Error (401): Unauthorized"
}
```

**대응**: API 키 유효성 확인

---

## 결과 통합

여러 API 호출 결과를 통합할 때:

1. **중복 제거**: `place_url` 기준
2. **거리 정보 보존**: 각 결과의 `distance` 유지
3. **출처 표시**: 어떤 키워드/구간에서 검색되었는지

```json
{
  "success": true,
  "results": [...],
  "meta": {
    "total_count": 25,
    "api_calls": 3,
    "strategy_used": "route",
    "keywords_searched": ["해장국", "죽"],
    "segments_searched": 3
  }
}
```
