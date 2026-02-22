# 개발일지: 카카오와 구글, 하나의 경험으로

*2026-02-22*

---

## 1. 마커가 하나도 안 찍힌다

어제 완성한 카카오 경로 검색으로 "강남에서 판교 가는 길에 맛집"을 돌렸다. 검색은 잘 됐다. JSON에 10개 장소가 들어 있었다. `generate-page.js`로 HTML을 만들어서 브라우저에서 열었다.

지도가 텅 비어 있었다. 마커가 하나도 없었다.

JS 콘솔을 보니 에러가 있었다. `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`. 스택 트레이스를 따라가니 `renderMapMarkers()` 안의 forEach 루프였다. 장소 10개를 순회하면서 마커를 찍는 코드인데, 루프 자체가 중간에 터지면 이후 장소들은 전부 처리되지 않는다.

범인은 `templates/travel-planner.html`의 이 코드였다.

```javascript
if (place.reviewCount !== null) {
  html += `(${place.reviewCount.toLocaleString()})`;
}
```

카카오 API는 `reviewCount`를 제공하지 않는다. 그래서 이 필드는 `undefined`다. 문제는 조건문이다. JavaScript에서 `undefined !== null`은 `true`다. `null`이 아니니까 코드 블록이 실행되고, `undefined.toLocaleString()`을 호출하다가 터진다.

같은 패턴이 세 군데 있었다.

```javascript
if (place.reviewCount !== null)  // reviewCount 출력
if (place.rating !== null)       // "⭐ undefined" 렌더링
if (place.rating !== null)       // 카드 헤더
```

수정은 단순했다. `!== null`을 `!= null`로 바꾸면 `null`과 `undefined` 둘 다 걸러낸다. 세 곳 전부 수정했다.

HTML을 다시 만들었다. 마커 10개가 지도에 올라왔다.

---

## 2. 경로선이 나타나지 않는다

마커는 찍혔는데 경로선이 없었다. 출발지(강남역)에서 도착지(판교역)까지 경로를 그려주는 `drawSearchRoute()` 함수가 있는데, 호출은 되는데 아무 선도 안 그려졌다.

코드를 보니 원인이 바로 보였다.

```javascript
function drawSearchRoute(route) {
  if (!route) return;

  if (route.polyline) {
    // encoded polyline 디코딩 후 그리기
    const points = decodePolyline(route.polyline);
    drawLine(points);
  }
}
```

`route.polyline`만 체크하고 있었다. 그런데 카카오 Routes API가 돌려주는 데이터는 encoded polyline이 아니다. `scripts/kakao-routes.js`는 polyline을 내려받은 후 `decodePolyline()`을 즉시 실행해서 `decodedPoints` 배열로 저장한다. APP_DATA에 들어가는 건 `route.decodedPoints`다.

해외(Google)는 encoded polyline 문자열을 저장하고 템플릿에서 디코딩하는 방식이고, 국내(Kakao)는 미리 디코딩된 좌표 배열을 저장하는 방식이다. 같은 `route` 객체 안에 두 형식이 혼재하는 구조인데, 함수가 하나만 처리하고 있었다.

수정은 분기 추가였다.

```javascript
function drawSearchRoute(route) {
  if (!route) return;

  const hasEncodedPolyline = route.polyline;
  const hasDecodedPoints   = route.decodedPoints && route.decodedPoints.length > 0;

  if (hasEncodedPolyline) {
    const points = decodePolyline(route.polyline);
    drawLine(points);
  } else if (hasDecodedPoints) {
    const points = route.decodedPoints.map(p => [p.lat, p.lng]);
    drawLine(points);
  }
}
```

`decodedPoints`가 있으면 그대로 좌표 배열로 변환해서 그린다. 강남에서 판교까지 주황색 경로선이 그려졌다.

---

## 3. 카카오 결과에 평점도 사진도 없다

경로선까지 완성하고 나서 결과 페이지를 사용자에게 보여줬다. 반응은 냉정했다. "평점이 없으니까 어디가 좋은지 모르겠어요. 사진도 없고, 리뷰 요약도 없어요."

카카오 Places API의 한계다. 카카오는 장소 기본 정보(이름, 주소, 좌표, place_url)와 카테고리 정도만 준다. 평점, 리뷰 수, 영업시간, 사진, 한줄 설명 — 사용자가 장소를 고르는 데 필요한 핵심 정보들이 전부 없다.

기존에는 이 한계를 그냥 받아들이고 있었다. 국내 검색은 카카오, 해외 검색은 구글이라는 이분법으로 운영해서, 국내 결과는 평점 없이 보여줬다.

하지만 생각해보면 이건 설계 결정이 아니라 회피였다. 두 API가 서로 다른 장점을 가지고 있다면, 둘을 조합해서 더 나은 결과를 만들 수 있다.

카카오가 잘하는 것: 국내 장소 검색의 정확도, 한국어 처리, 지역 맥락 이해.
구글이 잘하는 것: 리뷰 데이터, 사진, 영업시간, 글로벌 POI 인덱스.

카카오로 찾고, 구글로 보강하면 된다.

---

## 4. Google Places 보강 파이프라인을 만들다

구상은 간단했다. 카카오 검색 결과로 나온 장소 10개에 대해, 각각 구글에서 같은 장소를 찾아서 평점/사진/리뷰를 가져온다. 장소명과 좌표로 Google Places Find API를 호출하면 `place_id`가 나오고, 그 `place_id`로 Details API를 호출하면 세부 정보가 나온다.

`/tmp/enrich-places.mjs`에 임시로 구현했다.

```javascript
import { execSync } from 'child_process';

async function enrichPlace(place) {
  // 1. Google에서 장소 찾기
  const findResult = execSync(
    `node scripts/google-places.js find "${place.displayName}" --lat=${place.lat} --lng=${place.lng}`
  );
  const { placeId } = JSON.parse(findResult);
  if (!placeId) return place;

  // 2. 상세 정보 가져오기
  const detailsResult = execSync(
    `node scripts/google-places.js details ${placeId}`
  );
  const details = JSON.parse(detailsResult);

  return {
    ...place,
    rating: details.rating,
    reviewCount: details.reviewCount,
    photoUrl: details.photoUrl,
    editorialSummary: details.editorialSummary,
    googlePlaceId: placeId,
  };
}

// 10개 동시 처리
const enriched = await Promise.all(places.map(enrichPlace));
```

`Promise.all`로 병렬 실행했다. 10개 장소를 순서대로 처리하면 30초 이상 걸리지만, 동시에 돌리니까 8초 만에 끝났다.

10개 중 9개가 성공적으로 매칭됐다. 1개는 구글에서 같은 이름의 장소를 못 찾아서 원본 데이터가 그대로 남았다. 매칭된 장소들은 평점 4.0~4.6, 리뷰 수 200~3000개, 사진 URL이 생겼다.

---

## 5. 리뷰가 있으면 Insight Agent를 자동으로 돌린다

Google Places Details API를 호출하면 리뷰도 같이 받을 수 있다. 장소당 최대 5개, 10개 장소면 최대 50개의 실제 방문자 리뷰가 생긴다.

이 데이터가 있는데 보여주지 않는 건 낭비다.

Insight Agent(devlog-02에서 만든)를 호출했다. 강남→판교 경로 맥락과 50개 리뷰를 넘겼더니 7개 주제 섹션이 나왔다.

- 강남 출발: 강남역 10번 출구 근처 출발 전 추천
- 경로 중간: 서울 강남구-성남 경계 구간 맛집
- 판교 도착: 판교테크노밸리 점심/저녁 추천
- 가성비 런치: 직장인 점심 2만원 이하
- 데이트 코스: 조용하고 분위기 있는 곳
- 비즈니스 미팅: 테이블 간격, 소음 수준
- 현금/주차: 주차 가능 여부, 결제 방식

10개의 실용적인 팁과 8개의 주의사항도 나왔다. 리뷰 원문 영어, 번역 한국어 토글도 전부 정상 동작.

최종 HTML 파일: `output/강남에서-판교-가는-길에-맛집-2026-02-22.html` (479.5KB).

---

## 6. 5개 이상이면 자동 보강 — 임계값 설계

임시 스크립트로 한 번 돌리고 나니 이걸 항상 자동으로 해야겠다는 생각이 들었다. 매번 `/tmp/enrich-places.mjs`를 만드는 건 다음 번에도 똑같은 작업을 반복하는 거다.

파이프라인에 자동 트리거 조건을 추가했다. 임계값은 5개 장소.

결과 5개 미만이면 보강할 데이터 자체가 빈약하다. 10개 API 호출해서 사진 2~3개 얻는 건 비용 대비 효과가 낮다. 5개 이상이면 보강할 가치가 있고, Insight Agent도 충분한 리뷰를 가지고 분석할 수 있다.

규칙을 `.claude/skills/map-search/SKILL.md`에 명문화했다.

```
검색 결과 ≥ 5개 AND provider가 kakao인 경우:
  → 각 장소에 대해 Google Places find + details 호출
  → rating, reviewCount, photoUrl, editorialSummary 병합
  → details-raw.json 생성

details-raw.json 존재 시:
  → Insight Agent 자동 호출
  → guide-schema.md 형식으로 분석 결과 생성
  → generate-page.js로 HTML 생성 (portable 모드)
```

`CLAUDE.md`의 파이프라인 흐름도도 업데이트했다. "4.5단계 (카카오 결과인 경우) Google Places 보강"이라는 단계가 추가됐다.

카카오와 구글이 이제 하나의 파이프라인 안에서 협력한다. 카카오가 정확하게 찾고, 구글이 풍부하게 설명한다.

---

## 오늘의 작업 요약

| 단계 | 작업 | 핵심 파일 |
|------|------|----------|
| 1 | 마커 렌더링 버그 수정 (`!== null` → `!= null`) | `templates/travel-planner.html` |
| 2 | 카카오 경로선 렌더링 버그 수정 (`decodedPoints` 분기 추가) | `templates/travel-planner.html` |
| 3 | 카카오 결과 한계 파악 (평점/사진/리뷰 없음) | — |
| 4 | Google Places 보강 파이프라인 구현 | `/tmp/enrich-places.mjs` (임시) |
| 5 | Insight Agent로 리뷰 분석 + 가이드 생성 | `.claude/agents/insight.md` |
| 6 | 자동 보강 트리거 조건 설계 (결과 ≥ 5개) | `.claude/skills/map-search/SKILL.md`, `CLAUDE.md` |

**수정된 템플릿**: `travel-planner.html` — `!= null` 조건 3곳, `drawSearchRoute()`에 `decodedPoints` 분기

**업데이트된 문서**: `SKILL.md` — Google 보강 자동 트리거 조건, `CLAUDE.md` — 파이프라인 4.5단계 추가

**생성된 결과물**: `output/강남에서-판교-가는-길에-맛집-2026-02-22.html` (479.5KB, 포터블, 사진 + 가이드 포함)

**핵심 교훈**: `!== null`과 `!= null`의 차이는 사소해 보이지만, forEach 루프 안에서 터지면 이후 모든 작업이 조용히 멈춘다. 그리고 두 API를 경쟁 관계로 보면 한쪽의 한계를 그냥 받아들이게 되지만, 협력 관계로 보면 둘을 조합해서 더 나은 결과를 만들 수 있다.
