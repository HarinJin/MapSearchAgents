# 거리/이동수단 키워드 사전

Translator Agent가 쿼리에서 거리/이동수단 관련 표현을 감지할 때 참조하는 사전입니다.

## 경로 모드 (distanceMode: "route") 감지

| 키워드 | 예시 | 해석 |
|--------|------|------|
| ~에서 ~가는 길에 | "서울에서 부산 가는 길에" | 경로 검색 |
| ~에서 ~까지 | "강남에서 판교까지" | 경로 검색 |
| ~와 ~ 사이에 | "강남역과 역삼역 사이" | 경로 검색 |
| 이동 중 | "이동 중에 들를 곳" | 경로 검색 |
| 경유지 | "강남 경유" | 경로 검색 |
| 중간에 | "둘 사이 중간에" | 경로 검색 |
| 드라이브 코스 | "드라이브 코스 맛집" | 경로 검색 |

## 거점 실거리 모드 (distanceMode: "point_travel") 감지

| 키워드 패턴 | 예시 | 해석 |
|------------|------|------|
| ~에서 N분 이내 | "숙소에서 10분 이내" | 실거리 기반 필터링 |
| ~에서 Nkm 이내 | "집에서 5km 이내" | threshold=5000 |
| ~에서 N미터 이내 | "여기서 500미터 이내" | threshold=500 |
| ~까지 N분 거리 | "차로 10분 거리" | 실거리 기반 필터링 |
| 걸어서 N분 | "걸어서 15분" | threshold=1200, walking |
| 차로 N분 | "차로 10분" | threshold=5000, driving |

### threshold 추출 규칙

| 표현 | threshold | 비고 |
|------|-----------|------|
| Nkm | N × 1000 | "5km" → 5000 |
| N킬로 | N × 1000 | "3킬로" → 3000 |
| Nm, N미터 | N | "500m" → 500 |
| N분 (도보) | N × 80 | 도보 분속 80m 기준 |
| N분 (차) | N × 500 | 차량 분속 500m 기준 (시내) |
| 걸어서 N분 | N × 80 | 도보 명시 |
| 차로 N분 | N × 500 | 차량 명시 |

### 일반 거리 표현 (point_travel 아님)

다음은 radius 전략의 반경 파라미터로만 사용 (point_travel 트리거 아님):
- "근처", "주변", "가까운" → 기본 radius 전략
- 거리 수치 없이 막연한 표현

## 이동수단 감지 (travelMode)

| 키워드 | travelMode | 예시 |
|--------|-----------|------|
| 도보, 걸어서, 걸어갈 수 있는 | walking | "걸어서 갈 수 있는 맛집" |
| 산책, 산책 거리 | walking | "산책 거리 카페" |
| 차로, 자동차, 드라이브 | driving | "차로 10분" |
| 운전, 자차 | driving | "자차로 이동" |
| 택시 | driving | "택시비 만원 이내" (약 5km) |

### 자동 결정 규칙

travelMode가 명시되지 않은 경우:
- threshold ≤ 2000m → walking
- threshold > 2000m → driving

## 복합 표현

| 표현 | distanceMode | threshold | travelMode |
|------|-------------|-----------|------------|
| "숙소에서 걸어서 10분" | point_travel | 800 (10×80) | walking |
| "호텔에서 차로 15분 이내 맛집" | point_travel | 7500 (15×500) | driving |
| "강남에서 판교 가는 길에" | route | - | - |
| "역에서 도보 5분" | point_travel | 400 (5×80) | walking |

## Translator 출력 필드

거리 관련 키워드가 감지되면 다음 필드를 출력에 추가:

```json
{
  "distanceMode": "route" | "point_travel" | null,
  "distanceThreshold": 5000,
  "travelMode": "driving" | "walking" | null,
  "requires_distance_filter": true
}
```

- `distanceMode`: null이면 거리 관련 없음 (기존 방식)
- `distanceThreshold`: point_travel 모드일 때만 사용 (meters)
- `travelMode`: 이동수단 (null이면 자동 결정)
- `requires_distance_filter`: true이면 Distance Matrix API 호출 필요
