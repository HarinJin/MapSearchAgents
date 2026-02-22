# 개발일지: 포터블 HTML과 파이프라인 경량화

*2026-02-20*

---

## 1. "HTML을 공유할 수 없다"

어제 만든 가이드 페이지를 누군가에게 보내려다 멈췄다. `.html` 파일 하나를 이메일에 첨부하거나 슬랙에 올리면 상대방이 그냥 열어볼 수 있어야 정상인데, 현재 구조로는 두 가지 문제가 동시에 터진다.

첫 번째는 **CDN 의존성**이다. 현재 `travel-planner.html`은 외부 CDN에서 JS와 CSS를 불러온다.

```
unpkg.com/leaflet@1.9.4         → JS 150KB + CSS 20KB
unpkg.com/leaflet.markercluster@1.5.3  → JS 25KB + CSS 5KB
fonts.googleapis.com            → Inter 폰트
```

파일을 받은 사람의 인터넷 환경이나 네트워크 정책에 따라 CDN 요청이 막히면 지도가 아예 뜨지 않는다. UI 스타일도 날아간다.

두 번째가 더 심각했다. **API 키 노출**이다. 원인을 추적해보니 노출 경로가 명확했다.

```
.env
  → google-places.js (normalizeGooglePlace에서 photoUrl에 &key=API_KEY 포함)
    → enriched.json
      → generate-page.js
        → HTML 소스 (API 키 약 15회 노출)
```

Google Photos URL은 `&key=AIzaSy...` 파라미터를 포함한 채 JSON에 저장된다. generate-page.js가 이 JSON을 그대로 `APP_DATA`에 주입하니, 최종 HTML 소스코드 어디서나 키를 볼 수 있는 상태였다.

해결책은 두 부분으로 나눴다.

**`scripts/vendor-download.mjs`** — CDN 파일을 `vendor/` 디렉토리에 한 번만 내려받는 스크립트다. Leaflet JS, Leaflet CSS, MarkerCluster JS, MarkerCluster CSS(기본), MarkerCluster CSS(Default) 총 5개 파일을 받는다. `.gitignore`에 `vendor/`를 추가해서 저장소에는 올라가지 않는다. 스크립트를 다시 실행하면 이미 파일이 있으면 건너뛴다.

**`generate-page.js`에 `--portable` 플래그 추가** — 포터블 모드에서는 네 가지가 달라진다.

1. CSS와 JS 인라인 삽입 — `vendor/` 파일 내용을 `<style>`과 `<script>` 태그에 직접 집어넣는다. CDN 링크가 사라진다.
2. 폰트 교체 — Google Fonts 링크를 제거하고 시스템 폰트 스택으로 대체한다. `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. 렌더링 결과는 OS마다 약간씩 다르지만, 외부 요청이 없어서 오프라인에서도 즉시 뜬다.
3. API 키 제거 — 최종 HTML 문자열에서 `key=AIza...` 패턴을 정규식으로 strip한다.
4. 카카오 Maps SDK script 태그 제거 — 현재 템플릿에서 사용하지 않지만 남아 있던 태그를 삭제한다.

결과물은 단일 `.html` 파일 약 330KB다. 인터넷 연결이 있으면 지도 타일이 정상 표시되고 (OSM 타일 서버는 CDN과 무관하게 동작), 연결이 없으면 지도 타일만 빠지고 나머지 UI는 전부 작동한다. 소스코드에 API 키가 0개다.

---

## 2. "13분짜리 에이전트를 5분으로"

Insight Agent를 실제로 돌려보면 Phase 2가 유독 오래 걸린다. 꼬란타 검색 기준으로 Phase 1(카테고리 생성)은 3분 안에 끝나는데, Phase 2(증거 추출 + 번역)가 10분을 넘어가는 경우가 생겼다.

원인을 보니 Phase 2 Agent가 매 처리 사이클마다 `details-raw.json`을 반복해서 읽고 있었다. 이 파일이 90KB다. 17개 식당의 리뷰를 전부 수집했으니 당연하다. 그런데 Phase 2가 실제로 필요한 데이터는 Phase 1이 선별한 카테고리에 **매칭된 장소들의 리뷰**뿐이다. 전체 리뷰 중 관련 있는 부분은 10KB 안팎이었다.

**`scripts/slice-reviews.mjs`** — Phase 1 결과(`categories.json`)와 `details-raw.json`을 입력으로 받아서, 카테고리별로 필요한 리뷰만 추출하는 전처리 스크립트다. Phase 2 Agent가 돌기 전에 1초 만에 실행된다.

처음 구현에서는 카테고리별로 해당 장소의 리뷰 전체를 복사해서 붙였다. 한 식당이 여러 카테고리에 속하면 리뷰가 그 수만큼 중복됐다. 출력이 45KB였다. 개선 방향은 명확했다. `reviewsByPlace` 맵 구조를 만들어서 장소당 리뷰를 한 번만 저장하고, 각 카테고리에는 place ID만 참조하게 했다.

```
변경 전: Phase 2 Agent가 파일 3개 읽기
         (categories.json + tips.json + details-raw.json 90KB) → 10분+
변경 후: slice-reviews.mjs 실행 1초
         → Phase 2 Agent가 파일 2개 읽기
         (sliced-reviews.json 24KB + tips.json 2KB) → 2~3분
```

93KB가 24KB로 줄었다. 파일 하나 읽는 횟수가 줄어든 것만큼, 컨텍스트 창 점유도 줄고, 에이전트가 불필요한 리뷰를 훑는 시간도 없어졌다.

---

## 3. "사진을 왜 다운로드하고 있었지?"

`--portable` 플래그를 처음 구현할 때 사진 처리도 같이 넣었다. Google Photos URL은 그대로 두면 API 키가 노출되니, 각 사진을 fetch해서 base64로 변환한 뒤 data URI로 교체하는 방식이었다. `fetchPhotoAsBase64()` 함수를 만들고, `embedPhotos()`가 모든 장소를 순회하면서 비동기로 사진을 받아왔다. generatePage()도 async 함수가 됐다.

그런데 이 사진 다운로드가 30초 이상 걸렸다. 17개 식당에 사진이 여러 장씩 있으니 HTTP 요청이 수십 번 나가는 거다.

사용자가 물었다. "매번 사진을 가져와도 어쩔 수 없지. 그런데 막상 네가 만들어준 페이지들을 보면 사진이 안 보이던데, 언제 불러온다는 거야?"

그 말을 듣고 바로 확인했다.

```bash
grep -n "photoUrl\|photo" templates/travel-planner.html
```

매칭: **0건**.

템플릿에 사진을 렌더링하는 코드 자체가 없었다. `enriched.json`과 `final.json`에는 `photoUrl` 필드가 있는데, 템플릿의 `renderPlaceCard()` 함수는 이 필드를 읽지 않는다. 카드에는 장소명, 주소, 평점, 거리, 카테고리 태그만 표시된다.

30초짜리 사진 다운로드가 처음부터 아무 효과 없는 작업이었다.

정리는 간단했다.

- `fetchPhotoAsBase64()` 함수 삭제
- `embedPhotos()` (async) → `stripApiKeysFromData()` (sync)로 교체 — photoUrl 필드에서 `key=...` 파라미터만 잘라낸다. 사진 URL 자체는 남겨두되 키만 제거한다.
- `generatePage()`를 async에서 sync로 복원
- `--portable` 기본값을 `true`로 변경 — 추가 오버헤드가 거의 없으니 기본으로 켜두는 게 맞다

---

## 오늘의 작업 요약

| 단계 | 작업 | 핵심 파일 |
|------|------|----------|
| 1 | CDN 벤더 로컬화 | `scripts/vendor-download.mjs`, `vendor/` |
| 2 | 포터블 HTML 패키징 | `scripts/generate-page.js` (--portable) |
| 3 | Insight 파이프라인 전처리 | `scripts/slice-reviews.mjs` |
| 4 | 사진 다운로드 파이프라인 제거 | `scripts/generate-page.js` |
| 5 | 포터블 모드 기본값 변경 | `scripts/generate-page.js` (default: true) |

**추가된 스크립트**: `vendor-download.mjs` (CDN 로컬화), `slice-reviews.mjs` (Insight Phase 2 전처리)

**변경된 스크립트**: `generate-page.js` — 포터블 모드 구현, `fetchPhotoAsBase64()`/`embedPhotos()` 삭제, `stripApiKeysFromData()` 추가, 기본값 `--portable=true`

**업데이트된 문서**: `memory/insight-agent-patterns.md` — Phase 2 전처리 플로우(slice-reviews.mjs 실행 단계), 포터블 모드 사용법 추가

**삭제된 코드**: `fetchPhotoAsBase64()`, `embedPhotos()` — 사진 다운로드 파이프라인 전체
