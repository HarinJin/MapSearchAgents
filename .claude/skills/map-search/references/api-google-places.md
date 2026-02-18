# Google Places API 명령어 가이드

PlaceEnricher 에이전트가 참조하는 Google Places API CLI 명령어 문서입니다.

## 사전 조건

1. `.env`에 `GOOGLE_PLACES_API_KEY` 설정
2. Google Cloud Console에서 "Places API" 활성화

## 명령어 목록

### find - 장소 찾기

카카오 결과의 장소명으로 Google Place ID를 찾습니다.

```bash
node scripts/google-places.js find "장소명" --lat=위도 --lng=경도
```

**옵션:**
| 옵션 | 필수 | 설명 |
|------|------|------|
| `--lat` | 권장 | 위도 (위치 편향용) |
| `--lng` | 권장 | 경도 (위치 편향용) |

**예시:**
```bash
node scripts/google-places.js find "스시코우지" --lat=37.498 --lng=127.028
```

**출력:**
```json
{
  "success": true,
  "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "name": "스시코우지",
  "address": "서울특별시 강남구 역삼동 123-45",
  "location": { "lat": 37.498, "lng": 127.028 }
}
```

### details - 상세 정보 조회

Place ID로 영업시간 등 상세 정보를 조회합니다.

```bash
node scripts/google-places.js details PLACE_ID --fields=필드목록
```

**옵션:**
| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--fields` | `opening_hours,business_status` | 조회할 필드 (쉼표 구분) |

**주요 필드:**
- `opening_hours` - 영업시간
- `business_status` - 영업 상태 (OPERATIONAL, CLOSED_TEMPORARILY 등)
- `name` - 장소명
- `reviews` - 리뷰 (비용 추가)

**예시:**
```bash
node scripts/google-places.js details ChIJN1t_tDeuEmsRUsoyG83frY4 --fields=opening_hours
```

**출력:**
```json
{
  "success": true,
  "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "business_status": "OPERATIONAL",
  "opening_hours": {
    "open_now": true,
    "periods": [
      {
        "open": { "day": 1, "time": "1130" },
        "close": { "day": 1, "time": "2200" }
      }
    ],
    "weekday_text": [
      "월요일: 오전 11:30 ~ 오후 10:00",
      "화요일: 오전 11:30 ~ 오후 10:00"
    ]
  }
}
```

### check-open - 영업 여부 확인

현재 영업 중인지 확인하고 폐장 시간/경고를 반환합니다.

```bash
node scripts/google-places.js check-open PLACE_ID
```

**예시:**
```bash
node scripts/google-places.js check-open ChIJN1t_tDeuEmsRUsoyG83frY4
```

**출력:**
```json
{
  "success": true,
  "place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4",
  "open_now": true,
  "closing_time": "22:00",
  "time_until_close": 180,
  "warning": null,
  "weekday_text": ["월요일: 오전 11:30 ~ 오후 10:00", ...]
}
```

**경고 메시지:**
| time_until_close | warning |
|------------------|---------|
| > 120분 | null |
| 60~120분 | ⚠️ 2시간 내 폐장 (HH:MM) |
| 30~60분 | ⚠️ 1시간 내 폐장 (HH:MM) |
| ≤ 30분 | 🚨 N분 후 폐장! (HH:MM) |

### enrich - 일괄 보강

여러 장소의 영업시간을 한 번에 조회합니다.

```bash
node scripts/google-places.js enrich --places='JSON배열' --filter-open
```

**옵션:**
| 옵션 | 필수 | 설명 |
|------|------|------|
| `--places` | ✅ | JSON 배열 `[{name, lat, lng}]` |
| `--filter-open` | - | true면 영업 종료 장소 필터링 |

**예시:**
```bash
node scripts/google-places.js enrich \
  --places='[{"name":"스시코우지","lat":37.498,"lng":127.028},{"name":"이자카야하나","lat":37.499,"lng":127.029}]' \
  --filter-open
```

**출력:**
```json
{
  "enriched_places": [
    {
      "name": "스시코우지",
      "lat": 37.498,
      "lng": 127.028,
      "google_place_id": "ChIJ...",
      "opening_hours": { "open_now": true },
      "closing_time": "22:00",
      "time_until_close": 180,
      "enrichment_status": "success"
    }
  ],
  "filtered_out": [
    {
      "name": "이자카야하나",
      "reason": "현재 영업 종료"
    }
  ],
  "warnings": [],
  "meta": {
    "google_api_calls": 4,
    "enrichment_success": 2,
    "enrichment_failed": 0
  }
}
```

## API 비용

| API | 비용 (1000회당) |
|-----|----------------|
| Find Place | $17 |
| Place Details (Basic) | $17 |
| Place Details (Contact/Atmosphere) | $20~25 |

**월 무료 크레딧: $200** (~11,700회 Find+Details)

## 오류 코드

| 코드 | 의미 | 대응 |
|------|------|------|
| `ZERO_RESULTS` | 장소 못 찾음 | 카카오 place_url 제공 |
| `OVER_QUERY_LIMIT` | 할당량 초과 | 영업시간 없이 반환 |
| `REQUEST_DENIED` | API 키 문제 | 키 확인 안내 |
| `INVALID_REQUEST` | 파라미터 오류 | 로그 확인 |

## 카카오 → Google 매칭 팁

1. **장소명 정확히**: "스타벅스 강남점" > "스타벅스"
2. **좌표 필수**: `--lat`, `--lng`로 위치 편향
3. **한글 사용**: 영문보다 한글이 매칭률 높음
4. **체인점 주의**: 지점명까지 포함해야 정확

## 실행 흐름 예시

```
카카오 검색 결과
    ↓
[{name: "스시코우지", x: 127.028, y: 37.498, place_url: "..."}]
    ↓
enrich 명령어 실행
    ↓
[
  find "스시코우지" --lat=37.498 --lng=127.028
  details ChIJ... --fields=opening_hours
]
    ↓
{
  enriched_places: [...],
  filtered_out: [...],
  warnings: [...]
}
```
