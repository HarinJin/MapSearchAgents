# 개발일지: 검색에서 인사이트까지 — 파이프라인 확장기

*2026-02-19*

---

## 1. "검색은 되는데, 그래서 어디를 가라는 건데?"

이 프로젝트의 파이프라인은 원래 **탐색**에 집중되어 있었다. 사용자가 "꼬란타 가족 맛집"이라고 치면 Translator가 맥락을 해석하고, MapSearch가 전략을 짜고, APIPicker가 API를 때려서 장소 목록을 뽑아주는 구조. 여기까지는 잘 돌아갔다.

문제는 **그 다음**이었다. 검색 결과로 17개 레스토랑이 나왔는데, 사용자 입장에서 보이는 건 장소명, 주소, 평점, 거리뿐이었다. "이 중에 아이랑 가기 좋은 곳이 어디야?", "바다 보이는 데는?", "현금만 받는 곳은 없어?" 같은 실질적인 판단 기준이 빠져 있었다.

그래서 **HTML 페이지 생성 모듈**(`generate-page.js`)을 먼저 만들었다. 검색 결과 JSON을 넣으면 Leaflet 지도 + 3패널 레이아웃의 HTML을 자동으로 찍어내는 도구다. `templates/travel-planner.html`을 템플릿으로 쓰고, `APP_DATA` placeholder에 데이터를 주입하는 방식이라 UI 수정은 템플릿 하나만 건드리면 된다. CLI로 `--file`, `--data`, stdin 파이프 세 가지 입력 방식을 지원하고, `--open` 플래그로 브라우저에서 바로 열 수 있게 했다.

여기까지가 오전 작업. 지도에 마커 찍히고, 좌측 패널에 목록 뜨고, 클릭하면 연동되는 기본 뷰는 완성됐다.

---

## 2. 하드코딩의 벽 — build-guide.mjs와 translate-evidence.mjs

실제로 "꼬란타 7인 가족 맛집"을 검색해서 HTML을 뽑아보니, 기본 정보만으로는 의사결정에 도움이 안 됐다. 사용자도 같은 피드백을 줬다. "어떤 종류의 식당인지, 리뷰에서 공통적으로 언급하는 게 뭔지 전혀 없다"는 거였다.

그래서 Google Places Details API로 17개 식당의 리뷰를 전부 수집한 뒤, 오른쪽 패널에 **가이드 탭**을 만들었다. "아이 놀이공간이 있는 식당", "오션뷰 & 선셋 맛집", "가성비 좋은 곳" 같은 카테고리로 식당을 분류하고, 근거가 되는 리뷰를 발췌해서 보여주는 구조다. 지도 마커, 좌측 목록, 우측 가이드 3패널이 전부 연동되게 했다 — 지도에서 Seagull Kitchen을 클릭하면 좌측 리스트와 우측 가이드에서 동시에 해당 식당으로 스크롤된다.

여기서 두 개의 스크립트가 만들어졌다.

**`build-guide.mjs`** — 리뷰 텍스트에서 정규식으로 카테고리를 매칭하는 스크립트. "pool", "play area", "kids zone" 같은 패턴이 있으면 "아이 놀이공간" 카테고리에 넣는 식이다. 10개 카테고리를 하드코딩했고, 각 카테고리의 `reason`(분류 이유)도 한국어로 직접 작성했다.

**`translate-evidence.mjs`** — 발췌한 영어 리뷰를 한국어로 번역하는 스크립트. 번역 방식이 압권인데, 리뷰 원문 앞 80자를 키로 쓰는 `Map` 자료구조에 번역문을 하나씩 수동으로 넣어놨다. 약 40개의 번역 쌍이 하드코딩되어 있다.

이 두 스크립트는 **꼬란타 맛집이라는 한 번의 검색에 특화된 도구**였다. 다음에 "도쿄 시부야 라멘"을 검색하면? 정규식 패턴이 전부 다시 만들어져야 하고, 번역 맵도 처음부터 새로 채워야 한다. 재사용이 불가능한 구조였다.

---

## 3. Insight Agent — 하드코딩에서 의미 분석으로

문제의 본질은 명확했다. 파이프라인에 **탐색 에이전트**는 있지만 **분석 에이전트**가 없었다. 정보를 수집하는 단계까지는 자동화되어 있는데, 수집된 정보에서 인사이트를 추출하는 단계는 수동 스크립트에 의존하고 있었던 것이다.

그래서 **Insight Agent**를 설계했다. 핵심 설계 원칙은 세 가지였다.

**동적 카테고리 생성.** build-guide.mjs는 10개 카테고리가 고정이었지만, Insight Agent는 검색 맥락에 따라 카테고리를 동적으로 만든다. "꼬란타 가족 맛집"이면 "아이 놀이공간", "키즈 메뉴"가 나오고, "도쿄 라멘"이면 "츠케멘 맛집", "심야 영업"이 나오는 식이다.

**의미 기반 분석.** 정규식 패턴 매칭이 아니라 LLM의 언어 이해력으로 리뷰를 분석한다. "my kids loved the pool"을 정규식으로 잡으려면 `pool|play\s*area|kids?\s*zone` 같은 패턴을 미리 나열해야 하지만, LLM은 맥락을 이해하고 "아이 놀이공간" 카테고리에 알아서 매핑한다.

**번역 내장.** 별도의 번역 스크립트 없이 증거 추출과 한국어 번역을 한 번에 처리한다. translate-evidence.mjs의 수동 번역 맵이 필요 없어진다.

구현한 파일은 4개다.

- **`references/guide-schema.md`** — Insight Agent의 출력과 HTML 템플릿의 입력이 일치해야 하므로, 공식 스키마를 먼저 정의했다. `GuideSchema`, `SectionSchema`, `EvidenceSchema`, `WarningSchema`의 타입과 규칙이 여기에 있다. 이 파일이 에이전트와 템플릿 사이의 **데이터 계약서** 역할을 한다.

- **`.claude/agents/insight.md`** — 에이전트 정의. 5단계 처리 과정(맥락 파악 → 리뷰 전수 분석 → 카테고리 생성 → 증거 추출+번역 → 팁/주의사항 생성)을 명세했다. 기존 에이전트들(translator.md, place-enricher.md)과 동일한 형식을 따른다.

- **`CLAUDE.md`** 와 **`SKILL.md`** — 파이프라인에 5.5단계(Details 수집)와 6단계(Insight Agent)를 삽입했다. 호출 조건과 입출력 규칙도 추가했다.

변경 후 파이프라인은 이렇게 된다:

```
Translator → MapSearch → APIPicker → (PlaceEnricher)
                                          ↓
                                   Details 수집 (Google Places Details API)
                                          ↓
                                   Insight Agent ← NEW
                                          ↓
                                   generate-page.js → HTML
```

기존의 `build-guide.mjs`와 `translate-evidence.mjs`는 삭제하지 않고 fallback으로 남겨뒀다. Insight Agent가 정상 동작하면 자연스럽게 사용되지 않게 된다.

템플릿 변경은 **없다**. 기존 `travel-planner.html`의 `renderGuide()` 함수가 이미 `APP_DATA.guide` 스키마를 렌더링하고 있고, guide-schema.md가 이 스키마를 정확히 따르도록 설계했기 때문이다. reason 표시, 번역문/원문 토글, tips/warnings 렌더링, 3패널 연동까지 전부 그대로 동작한다.

---

## 오늘의 작업 요약

| 단계 | 작업 | 핵심 파일 |
|------|------|----------|
| 오전 | HTML 페이지 생성 모듈 구현 | `scripts/generate-page.js`, `templates/travel-planner.html` |
| 오전 | 실제 검색 수행 + 결과 확인 | 꼬란타 가족 맛집 17곳 |
| 낮 | 가이드 탭 구현 (리뷰 분석 + 카테고리 분류) | `build-guide.mjs`, `translate-evidence.mjs`, 템플릿 가이드 탭 |
| 낮 | 3패널 연동 (지도↔목록↔가이드) | 템플릿 JS 수정 |
| 오후 | Insight Agent 설계 + 구현 | `insight.md`, `guide-schema.md`, `CLAUDE.md`, `SKILL.md` |

**추가된 에이전트**: Insight Agent (Claude Sonnet) — 검색 결과 + 리뷰 데이터에서 카테고리 분류, 증거 추출, 번역, 팁/주의사항을 한 번에 생성

**추가된 모듈**: generate-page.js — 검색 결과 JSON → 지도 기반 HTML 페이지 자동 생성

**추가된 데이터 계약**: guide-schema.md — Insight Agent 출력 ↔ HTML 템플릿 입력의 단일 진실 원천
