# 개발일지: 경로 위의 맛집을 찾는 법

*2026-02-22*

---

## 1. "가는 길에 뭐 먹을 데 없어?"

지도 검색이 자연스러워지면서 다음 질문이 나왔다. "아오낭에서 꼬란타 가는 길에 가족이랑 먹을 데 없어?" 기존 시스템은 **한 지점**을 중심으로 반경 검색만 할 수 있었다. 출발지와 도착지가 다른 쿼리 — "A에서 B 가는 길에" — 는 애초에 처리할 수 없는 구조였다.

반경 검색으로 억지로 풀 수는 있다. 출발지 주변 검색, 도착지 주변 검색, 중간 지점 검색을 각각 돌리면 된다. 하지만 이건 경로를 따라간 게 아니라 점 세 개를 찍은 거다. 실제 도로가 산을 돌아가든 해안을 따라가든 무시한다. 직선 30km 지점에 맛집이 있어도, 실제 도로로는 50km를 더 가야 할 수 있다.

**실제 도로 경로를 따라 검색해야 한다.** 이게 이번 작업의 출발점이었다.

---

## 2. Google API 세 개의 역할 분담

경로 기반 검색을 구현하려면 세 가지 질문에 답할 수 있어야 한다.

1. 출발지에서 도착지까지 **실제 도로 경로**가 어떻게 생겼는가?
2. 그 경로 위 또는 근처에 **어떤 장소**가 있는가?
3. 특정 장소까지의 **실제 이동 거리/시간**은 얼마인가?

각각 다른 API가 필요했다. Google Maps Platform 문서를 뒤졌다.

**Google Routes API** (`routes.googleapis.com/directions/v2:computeRoutes`) — 질문 1에 답한다. 출발지와 도착지 좌표를 넘기면 실제 도로를 따른 경로를 **encoded polyline** 문자열로 돌려준다. 이 polyline을 디코딩하면 경로를 따라가는 좌표 배열이 나온다. Google Maps에서 경로 안내할 때 파란 선을 그리는 데이터가 바로 이거다.

**Google Places Text Search (New) API** — 질문 2에 답한다. 여기에 `searchAlongRouteParameters.polyline.encodedPolyline`이라는 파라미터가 있다. 경로 polyline과 검색어를 같이 넘기면 경로 근처의 장소만 골라서 돌려준다. Google이 **Search Along Route (SAR)**라고 부르는 기능이다. 해외 경로 검색에서는 이 API 하나로 2번 질문이 해결된다.

**Google Distance Matrix API** (`maps.googleapis.com/api/distancematrix/json`) — 질문 3에 답한다. 기준점에서 여러 장소까지의 실제 도로 거리를 한 번에 계산해준다. "숙소에서 걸어서 10분 이내"처럼 실거리 조건이 있는 쿼리에 사용한다. 이름에 Matrix가 들어가는 이유는 N개 출발지 × M개 도착지의 거리를 행렬로 계산해주기 때문이다.

세 API를 각각 래핑하는 CLI 스크립트를 만들었다.

```
scripts/google-routes.js    → route 명령: polyline 획득 + 디코딩
scripts/google-places.js    → search-along-route 명령 추가 (기존 스크립트 확장)
scripts/google-distance.js  → filter 명령: 실거리 기반 장소 필터링
```

---

## 3. Polyline을 디코딩한다는 것

Google Routes API가 돌려주는 encoded polyline은 이런 모양이다.

```
_p~iF~ps|U_ulLnnqC_mqNvxq`@
```

사람이 읽을 수 없는 문자열 안에 좌표가 압축되어 있다. Google이 1990년대 후반에 만든 인코딩 알고리즘으로, 위도/경도의 차분값을 5비트 청크로 쪼개서 ASCII 문자에 매핑한다. 대역폭이 비쌌던 시절의 유산이지만 아직도 표준이다.

`google-routes.js`에 `decodePolyline()` 함수를 구현했다. Google의 Polyline Algorithm 문서를 참고했다. 핵심 로직은 각 문자에서 63을 빼고, 하위 5비트를 추출하고, 6번째 비트가 0이 될 때까지 이어붙이고, 최하위 비트로 부호를 판단하는 것이다. 반복하면 `[{lat, lng}, {lat, lng}, ...]` 배열이 나온다.

이 좌표 배열이 **실제 도로의 궤적**이다. 이걸 따라 일정 간격으로 포인트를 찍으면 경로 위에서 검색할 수 있다.

---

## 4. 적응형 샘플링 — 포인트를 몇 개 찍을 것인가

polyline을 디코딩하면 수백 개의 좌표가 나온다. 이걸 전부 검색 지점으로 쓸 수는 없다. 검색 포인트 하나당 카카오 API를 한 번 호출하니까, 200개 포인트면 API를 200번 때리는 거다.

반대로 너무 적게 찍으면 경로 사이사이에 빈 구간이 생긴다. 서울에서 부산까지 포인트 3개면, 대전과 대구 사이 100km 구간에서는 아무것도 못 찾는다.

`route-segment.js`에 적응형 간격 공식을 구현했다.

```
interval = min(2 × searchRadius, ceil(totalDistance / 20))
```

원칙은 세 가지다.

1. **검색 원이 겹치거나 접해야 한다.** interval이 searchRadius의 2배를 넘으면 원 사이에 빈 공간이 생긴다. 그래서 `2 × searchRadius`로 상한을 건다.
2. **최대 20포인트.** API 호출 비용을 제어하기 위한 하드캡이다.
3. **최소 interval = searchRadius.** 원이 지나치게 겹치면 중복 결과만 늘어난다.

실제로 계산해보면 강남→판교(20km, 도심)는 4포인트, 서울→대전(160km)은 16포인트, 서울→부산(400km)은 20포인트에서 간격이 넓어진다. 초장거리에서도 API 호출이 20을 넘지 않는다.

`sampleAlongPolyline()` 함수가 디코딩된 polyline 좌표 위에서 실제 경로 거리를 누적하면서 interval마다 포인트를 추출한다. 직선 보간이 아니라 **polyline의 실제 곡선 위**에서 찍기 때문에, 도로가 산을 돌아가면 포인트도 산을 따라간다.

---

## 5. 두 가지 거리 모드

경로 검색을 구현하면서 "거리 조건"이 두 종류라는 걸 인식했다.

**route 모드**: "A에서 B 가는 길에." 경로 전체를 따라 검색한다. 출발지와 도착지가 있고, 그 사이의 도로 위에서 장소를 찾는다. 핵심 도구는 Routes API + polyline 샘플링이다.

**point_travel 모드**: "숙소에서 걸어서 10분 이내." 한 지점을 기준으로 **실제 이동 거리**를 기준으로 필터링한다. 반경 검색과 비슷하지만 직선거리가 아니라 실거리를 쓴다. 핵심 도구는 Distance Matrix API다.

```
route:        geocode → Routes API → polyline → 적응형 샘플링 → 다중 검색
point_travel: geocode → 확장 반경 검색 → Distance Matrix → 실거리 필터링
```

Translator Agent에 거리 키워드 사전(`slang-distance.md`)을 추가했다. "~에서 ~가는 길에"가 감지되면 `distanceMode: "route"`, "숙소에서 10분 이내"가 감지되면 `distanceMode: "point_travel"`을 반환한다. "걸어서 15분"은 `threshold: 1200` (15분 × 도보 분속 80m), "차로 10분"은 `threshold: 5000` (10분 × 차량 분속 500m)으로 변환한다.

point_travel에서 Distance Matrix API를 쓸 때 한 가지 함정이 있었다. 이 API는 한 번에 최대 25개 목적지만 받는다. 검색 결과가 30개면 두 번 호출해야 한다. `google-distance.js`에 배치 분할 로직을 넣었다. 그리고 국내 일부 경로에서 API가 `ZERO_RESULTS`를 반환하는 경우가 있었다 — 이때는 Haversine 직선거리로 fallback한다.

---

## 6. 해외 경로: Search Along Route

국내 경로 검색은 polyline 샘플링 → 카카오 다중 검색으로 풀었다. 해외는 더 깔끔하게 풀린다. Google Places의 **Search Along Route (SAR)** API가 polyline을 직접 받아서 경로 근처 POI를 한 번에 돌려주기 때문이다.

```
국내: Routes API → polyline 디코딩 → 20포인트 샘플링 → 카카오 20회 호출
해외: Routes API → encoded polyline 그대로 → SAR API 1회 호출
```

해외가 API 호출 횟수에서 압도적으로 효율적이다. 카카오가 경로 기반 검색을 지원하지 않으니 국내에서는 샘플링으로 우회할 수밖에 없다.

SAR API는 `routingSummaries`라는 필드를 같이 돌려주는데, 여기에 출발지에서 각 장소까지의 예상 이동 시간과 거리가 들어 있다. 별도로 Distance Matrix를 호출할 필요가 없다. 이 값으로 경로상 순서대로 정렬하면 "출발지에서 가까운 식당부터" 자연스러운 결과가 나온다.

실전 테스트는 "Ao Nang에서 Koh Lanta 가는 길에 가족 맛집"이었다. SAR API가 8개 식당을 찾았고, Ao Nang, Krabi Town, Klong Muang, Koh Lanta 구간별로 `areaGroup`이 붙어서 나왔다.

---

## 7. 지도에 경로가 안 보인다

검색은 잘 됐다. 8개 식당이 지도 위에 마커로 찍혔다. 그런데 막상 보니 **왜 이 식당들이 여기에 있는지** 직관적으로 이해가 안 됐다. 마커만 덩그러니 놓여 있었다. 출발지가 어디고 도착지가 어디인지, 어느 방향으로 이동하는 건지 지도만 봐서는 알 수 없었다.

경로 검색이니까 경로가 보여야 한다. 출발지에서 도착지까지 선이 그어져 있고, 그 선 위에 장소들이 놓여 있어야 "아, 이동하면서 들를 수 있는 곳이구나"라는 맥락이 생긴다.

`travel-planner.html`에 `drawSearchRoute()` 함수를 추가했다. `APP_DATA.route`에 출발지/도착지 좌표가 있으면, 장소들을 출발지로부터의 거리순으로 정렬한 뒤 **출발지 → 장소들 → 도착지**를 주황색 실선으로 잇는다. 각 구간 중간에 `▼` 모양 화살표 마커를 배치해서 이동 방향을 표시한다. 출발지에는 녹색 "출발" 라벨, 도착지에는 빨간색 "도착" 라벨을 붙였다.

Leaflet에는 polyline decorator 같은 화살표 기능이 내장되어 있지 않다. 외부 플러그인(`leaflet-polylinedecorator`)을 쓸 수도 있었지만, 포터블 모드에서 또 하나의 CDN 의존성을 추가하고 싶지 않았다. 대신 각 세그먼트의 중간 지점에 `L.divIcon`으로 회전된 화살표를 배치하는 방식으로 처리했다. 세그먼트의 방향 각도를 `atan2`로 계산해서 화살표를 회전시킨다. 의존성 0개.

`init()`에서 `fitBounds`도 확장했다. 기존에는 장소들의 좌표만으로 지도 범위를 잡았는데, 경로 검색에서는 출발지와 도착지가 장소들보다 더 바깥에 있을 수 있다. 출발지/도착지 좌표를 bounds에 포함시켜서 전체 경로가 한눈에 보이도록 했다.

---

## 8. 필드명이 안 맞는다 — 근본적으로

경로 시각화보다 더 짜증났던 문제가 있었다. HTML 페이지를 열었더니 장소 카드가 텅 비어 있었다. 이름도 없고 주소도 없고 링크도 없다. 마커는 찍히는데 카드에 아무것도 안 나온다.

원인은 **필드명 불일치**였다. 에이전트가 직접 조립한 JSON은 카카오/구글 API의 원시 필드명을 사용한다.

```json
{ "name": "Chilli Restaurant", "address": "Krabi Town", "place_url": "https://..." }
```

그런데 템플릿의 `renderPlaceCard()`는 정규화된 필드명을 기대한다.

```javascript
place.displayName    // ← name 아님
place.formattedAddress  // ← address 아님
place.placeUrl       // ← place_url 아님
```

`generate-page.js`에서 `transformToAppData()`가 세 가지 입력 형식을 처리하는데, 그중 첫 번째 경로 — `query + places[]`가 이미 있는 경우 — 가 문제였다. "이미 APP_DATA 형식이니까 그대로 쓰면 된다"고 판단해서 정규화를 건너뛰고 있었다.

```javascript
if (input.query && Array.isArray(input.places)) {
    return input;  // ← 정규화 없이 그대로 반환
}
```

이 경로를 타는 데이터가 실제로는 정규화되지 않은 상태로 들어올 수 있다. 에이전트가 검색 결과를 조합할 때 `normalizeKakaoPlace()`나 `normalizeGooglePlace()`를 거치지 않으면 원시 필드명 그대로 남는다.

처음에는 `_fix-data.mjs`라는 일회성 스크립트로 JSON 파일을 수동으로 고쳐서 HTML을 만들었다. 하지만 이건 다음 검색에서도 같은 문제가 반복된다는 뜻이다.

근본 수정은 간단했다. `ensureNormalizedFields()` 함수를 만들어서 `query + places[]` 경로에서도 각 place를 순회하며 필드를 보정한다. 이미 정규화된 place(`displayName`과 `placeUrl`이 둘 다 있으면)는 건너뛰고, 안 된 것만 매핑한다.

```javascript
function ensureNormalizedFields(place, provider) {
  if (place.displayName && place.placeUrl) return place;

  return {
    ...place,
    displayName: place.displayName || place.name || '',
    formattedAddress: place.formattedAddress || place.address || '',
    placeUrl: place.placeUrl || place.place_url || '',
    // ...
  };
}
```

이제 어떤 경로로 데이터가 들어오든 템플릿이 기대하는 필드명이 보장된다.

---

## 9. 경로선이 그려졌다가 사라지는 버그

경로 시각화를 붙이고 HTML을 열었더니 경로선이 안 보였다. 코드는 맞는데 화면에 아무것도 안 나온다. polyline 데이터가 APP_DATA에 들어가 있는 것도 확인했고, `drawSearchRoute()`가 호출되는 것도 확인했다. 그런데 지도 위에 주황색 선은 없고, 출발/도착 마커와 화살표만 떠 있었다.

Playwright로 브라우저를 띄워서 검증해보니 JS 에러는 0개였다. SVG path도 안 보인다. 뭔가가 polyline을 **지우고** 있었다.

범인은 `init()` 함수 안의 호출 순서였다.

```javascript
function init() {
  // ...
  drawSearchRoute();           // ← 여기서 경로선을 그림
  // ...
  MapAdapter.drawItineraryRoute(AppState.activeDay);  // ← 여기서 전부 지움
}
```

`drawItineraryRoute()`는 일정(itinerary) 경로를 그리기 전에 `clearRouteLines()`를 호출한다. 이 함수가 `mapRouteLines` 배열에 있는 **모든 polyline을 지도에서 제거**한다. `drawSearchRoute()`가 `MapAdapter.addRouteLine()`을 써서 경로를 그렸기 때문에, 그 polyline들이 `mapRouteLines`에 들어갔고, 바로 다음 줄에서 `clearRouteLines()`가 전부 날려버린 것이다.

검색 경로와 일정 경로가 같은 배열을 공유해서 생긴 문제였다. 해결은 **레이어 분리**.

```javascript
let mapRouteLines = [];        // 일정 경로용 (clearRouteLines가 관리)
let searchRouteLines = [];     // 검색 경로용 (절대 자동 삭제 안 됨)
```

`drawSearchRoute()` 안에서는 `MapAdapter.addRouteLine()` 대신 별도 함수 `addSearchRouteLine()`을 만들어서 `searchRouteLines` 배열에만 추가한다. `clearRouteLines()`는 `mapRouteLines`만 건드린다. 두 레이어가 독립적이 되면서 일정 탭을 전환해도 검색 경로선은 유지된다.

이 버그의 교훈: **"그려진다"와 "보인다"는 다른 문제다.** 코드가 polyline을 정상적으로 생성했더라도, 같은 init 사이클 안에서 다른 코드가 지워버리면 사용자는 결코 볼 수 없다. Playwright 같은 도구로 실제 렌더링 결과를 검증하는 게 중요한 이유다.

---

## 10. encoded polyline을 데이터에 저장해야 했다

경로선이 안 보이는 문제에는 사실 하나가 더 있었다. 처음 구현에서는 `drawSearchRoute()`가 장소 좌표를 직선으로 연결하는 방식이었다. `APP_DATA.route`에 출발지/도착지만 있고 **polyline 자체**가 없었기 때문이다.

Routes API의 encoded polyline은 검색 단계에서만 사용되고 버려졌다. SAR 검색할 때 polyline을 파라미터로 넘기고, 결과를 받으면 polyline은 더 이상 필요 없다고 생각했다. 하지만 시각화 단계에서 다시 필요해졌다.

polyline 없이 장소 좌표만 연결하면 직선이 바다 위를 가로지른다. Ao Nang의 식당 6개가 뭉쳐 있고, 그 다음 좌표가 Koh Lanta 근처이니 바다 한가운데를 직선으로 긋는 거다. 경로라고 부를 수 없다.

수정은 두 단계였다.

1. **데이터에 polyline 저장**: `aonang-lanta-family-v2-final.json`의 `route` 객체에 `polyline` 필드를 추가. Routes API에서 받은 encoded polyline 문자열을 그대로 저장한다.

2. **템플릿에서 polyline 디코딩**: `travel-planner.html`에 `decodePolyline()` 함수를 추가. APP_DATA에 `route.polyline`이 있으면 이걸 디코딩해서 실제 도로를 따른 좌표 배열로 경로를 그린다.

추가로 Ao Nang → Koh Lanta 경로는 **섬**이 도착지다. Routes API는 육로만 계산하므로 polyline이 본토 페리 터미널 근처에서 끝난다. Koh Lanta 섬의 리조트까지는 도로가 없다. 이 갭을 **점선**으로 연결했다. 실선은 도로, 점선은 해로(페리). polyline 마지막 좌표와 도착지 좌표의 거리가 0.003도(~300m) 이상이면 점선을 추가한다.

---

## 11. 화살표는 버렸다

방향을 표시하겠다고 화살표(▼)를 polyline 위에 배치했었다. 여러 차례 수정했지만 결과는 매번 어색했다.

- 처음에는 **모든 세그먼트 중간점**에 화살표를 배치했다. polyline이 수백 개의 좌표를 가지고 있으니 화살표가 수십 개 생겼다. 경로 위에 화살표가 다다다다다 붙어서 오히려 경로선을 가렸다.
- 4개로 줄여봤지만 화살표 방향 계산이 틀려서 출발→도착이 아니라 반대 방향을 가리켰다. `atan2` 인자 순서와 CSS rotate의 기준 방향을 잘못 매칭한 문제였다. 수식을 `atan2(-dlat, dlng) - 90`으로 수정해서 방향은 맞췄다.
- 방향을 맞춰도 화살표가 어색했다. 경로선과 화살표의 스타일이 따로 놀았다. 연속된 선 위에 뜬금없이 삼각형이 박혀 있으면 오히려 시각적 노이즈가 된다.

결국 화살표를 전부 제거했다. 출발(녹색)과 도착(빨간색) 마커의 색상 차이와 라벨 텍스트만으로 방향은 충분히 전달된다. 시각적 요소는 **없는 게 나을 때**도 있다.

---

## 오늘의 작업 요약

| 단계 | 작업 | 핵심 파일 |
|------|------|----------|
| 1 | Google Routes API 래퍼 | `scripts/google-routes.js` |
| 2 | Google Distance Matrix API 래퍼 | `scripts/google-distance.js` |
| 3 | Google SAR (Search Along Route) 확장 | `scripts/google-places.js` |
| 4 | Polyline 유틸리티 (디코딩, 샘플링, 적응형 간격) | `scripts/utils/route-segment.js` |
| 5 | 거리 키워드 사전 | `references/slang-distance.md` |
| 6 | 경로 검색 전략 문서 | `references/strategy-route.md` |
| 7 | 에이전트 업데이트 (Translator, MapSearch, APIPicker) | `.claude/agents/*.md` |
| 8 | 경로 시각화 (polyline 디코딩 + 실선/점선 + 출발/도착 라벨) | `templates/travel-planner.html` |
| 9 | APP_DATA 필드 정규화 근본 수정 | `scripts/generate-page.js` |
| 10 | 경로선 레이어 분리 (`searchRouteLines` ↔ `mapRouteLines`) | `templates/travel-planner.html` |
| 11 | encoded polyline 데이터 저장 + 템플릿 디코더 | `output/*.json`, `templates/travel-planner.html` |

**추가된 스크립트**: `google-routes.js` (Routes API), `google-distance.js` (Distance Matrix API)

**확장된 스크립트**: `google-places.js` (`search-along-route`, `summarize` 명령 추가)

**추가된 유틸**: `route-segment.js` — `decodePolyline`, `sampleAlongPolyline`, `calculateOptimalInterval`

**추가된 레퍼런스**: `slang-distance.md` (거리/이동수단 키워드 사전), `strategy-route.md` (경로 검색 전략)

**수정된 템플릿**: `travel-planner.html` — `drawSearchRoute()`, `addEndpointMarker()`, fitBounds 확장

**근본 수정**: `generate-page.js` — `ensureNormalizedFields()`로 모든 입력 경로에서 필드 정규화 보장
