# Agentic Map Search - 프로젝트 구현 가이드

Author: HARIN (KEZ_WORKS)  
Created: 2025-01-20  
Purpose: Claude Code 기반 에이전트 시스템 구축 TODO

---

## 1. 프로젝트 개요

### 1.1 목표

자연어 기반 지도 검색 에이전트 시스템 구축.  
"노가리 까기 좋은 곳", "강남에서 판교 가는 길에 속이 편한 음식점" 같은 맥락적 검색을 처리한다.

### 1.2 핵심 차별점

| 기존 지도 검색 | 본 시스템 |
|---------------|----------|
| 키워드 매칭 | 의도 해석 |
| 단일 조건 | 복합 조건 조합 |
| 반경 검색만 | 경로 기반 구간 검색 |
| 명시적 입력만 | 은어/맥락 이해 |

### 1.3 기술 스택

- **런타임**: Claude Code (Antigravity 호환)
- **오퍼레이터**: Claude Opus
- **서브 에이전트**: Claude Sonnet, Claude Haiku
- **외부 API**: 카카오맵 REST API
- **스크립트**: Node.js

---

## 2. 폴더 트리 구조

```
agentic-map-search/
│
├── CLAUDE.md                     # [1] 메인 오퍼레이터 정의
├── README.md                     # 프로젝트 소개 및 사용법
├── package.json                  # Node.js 의존성
│
├── .env.example                  # 환경변수 템플릿
├── .env                          # 실제 API 키 (gitignore)
├── .gitignore
│
├── .claude/
│   ├── settings.json             # Claude Code 설정 (모델 지정 등)
│   │
│   └── agents/
│       ├── translator.md         # [2] 은어/맥락 해석 에이전트
│       ├── map-search.md         # [3] 검색 전략 수립 에이전트
│       └── api-picker.md         # [4] API 실행 에이전트
│
├── scripts/
│   ├── kakao-search.js           # [5] 카카오맵 API 래퍼
│   └── utils/
│       ├── geocode.js            # 주소→좌표 변환
│       ├── route-segment.js      # 경로 구간화 로직
│       └── review-filter.js      # 리뷰 키워드 필터링
│
├── data/
│   └── slang-dictionary.json     # [6] 은어 사전 데이터
│
└── docs/
    ├── PROJECT_SPECIFICATION.md  # 원본 명세서
    └── IMPLEMENTATION_GUIDE.md   # 본 문서
```

---

## 3. 에이전트 아키텍처

### 3.1 전체 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 쿼리 입력                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CLAUDE.md (메인 오퍼레이터)                      │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  1. 쿼리 분류                                        │   │
│   │     - 단순 검색 / 경로 검색 / 맥락 포함 / 복합        │   │
│   │                                                     │   │
│   │  2. 은어/맥락 포함 여부 판단                          │   │
│   │     - 감성 표현, 음식 은어, 활동 은어 감지            │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
        은어/맥락 있음                    은어/맥락 없음
              │                               │
              ▼                               │
┌─────────────────────────┐                   │
│  Translator 에이전트     │                   │
│  (Claude Sonnet)        │                   │
│                         │                   │
│  - 은어 → 검색 키워드    │                   │
│  - 맥락 → 필터 조건      │                   │
│  - 신뢰도 점수 산출      │                   │
└─────────────────────────┘                   │
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   MapSearch 에이전트                         │
│                   (Claude Sonnet)                           │
│                                                             │
│   - 검색 전략 유형 결정 (radius/route/multi_point)           │
│   - API 호출 계획 수립                                       │
│   - 후처리 방식 결정 (리뷰 필터링 여부 등)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   APIPicker 에이전트                         │
│                   (Claude Haiku)                            │
│                                                             │
│   - 검색 계획에 따라 스크립트 실행                            │
│   - bash: node scripts/kakao-search.js [command] [params]   │
│   - 결과 수집 및 정리                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              CLAUDE.md (결과 통합)                           │
│                                                             │
│   - 중복 제거                                                │
│   - 거리/평점 기준 정렬                                       │
│   - 사용자 친화적 응답 생성                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    최종 응답 출력                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 에이전트 호출 패턴

| 쿼리 유형 | 호출 순서 |
|----------|----------|
| 단순 검색 | Operator → MapSearch → APIPicker → Operator |
| 맥락 포함 | Operator → **Translator** → MapSearch → APIPicker → Operator |
| 경로 기반 | Operator → MapSearch → APIPicker(다중) → Operator |
| 복합 검색 | Operator → **Translator** → MapSearch → APIPicker(다중) → Operator |

---

## 4. 에이전트별 역할 정의

### 4.1 CLAUDE.md (메인 오퍼레이터)

```yaml
역할: 중앙 제어 및 오케스트레이션
모델: Claude Opus
위치: /CLAUDE.md

책임:
  - 사용자 쿼리 수신 및 분류
  - 은어/맥락 포함 여부 판단
  - 적절한 에이전트 순차 호출
  - 최종 결과 통합 및 응답 생성

분류 기준:
  은어_키워드:
    - 감성: 힙한, 감성적인, 분위기 좋은, 인스타 감성
    - 음식: 속이 편한, 해장, 노가리, 가성비
    - 활동: 작업하기 좋은, 데이트 코스, 혼술, 회식
  
  경로_키워드:
    - ~에서 ~가는 길에
    - ~와 ~ 사이에
    - 경유지, 중간에

출력: 사용자에게 전달할 최종 검색 결과
```

### 4.2 Translator 에이전트

```yaml
역할: 은어/맥락을 검색 가능한 조건으로 변환
모델: Claude Sonnet
위치: /.claude/agents/translator.md

입력: 
  - 원본 사용자 쿼리
  - 해석이 필요한 표현 (오퍼레이터가 식별)

처리:
  - data/slang-dictionary.json 참조
  - 문맥 기반 의미 추론
  - 검색 키워드 및 필터 조건 생성

출력_형식:
  original: "원본 표현"
  interpretation: "해석된 의미"
  search_keywords: ["키워드1", "키워드2"]
  category_codes: ["FD6", "CE7"]
  filters:
    include: ["포함 조건"]
    exclude: ["제외 조건"]
  review_check_keywords: ["리뷰 확인 키워드"]
  confidence: 0.85

신뢰도_처리:
  - 0.9+: 사전 매칭, 바로 진행
  - 0.6~0.8: 문맥 추론, 진행하되 결과에 명시
  - 0.6-: 사용자에게 확인 요청
```

### 4.3 MapSearch 에이전트

```yaml
역할: 검색 전략 수립
모델: Claude Sonnet
위치: /.claude/agents/map-search.md

입력:
  - 원본 쿼리
  - Translator 해석 결과 (있는 경우)
  - 지리적 컨텍스트 (현재 위치 등)

처리:
  - 검색 전략 유형 결정
  - API 호출 순서 및 파라미터 계획
  - 후처리 방식 결정

전략_유형:
  radius: 특정 지점 중심 반경 검색
  route: 출발지-도착지 경로상 구간 검색
  multi_point: 여러 지점의 중심점 기준 검색
  review_filter: 1차 검색 후 리뷰 키워드로 필터링

출력_형식:
  strategy_type: "radius|route|multi_point|review_filter"
  search_plan:
    - step: 1
      action: "좌표 변환"
      api: "geocode"
      params: { query: "강남역" }
    - step: 2
      action: "키워드 검색"
      api: "keyword"
      params: { query: "카페", x: 127.027, y: 37.497, radius: 1000 }
  post_processing:
    filter_by_review: false
    review_keywords: []
    sort_by: "distance"
```

### 4.4 APIPicker 에이전트

```yaml
역할: API 호출 실행
모델: Claude Haiku
위치: /.claude/agents/api-picker.md

입력: MapSearch의 search_plan 배열

처리:
  - 계획된 순서대로 스크립트 실행
  - bash 명령어로 Node.js 스크립트 호출
  - 결과 수집 및 오류 처리

사용_명령어:
  키워드_검색: |
    node scripts/kakao-search.js keyword "검색어" --x=경도 --y=위도 --radius=반경
  
  카테고리_검색: |
    node scripts/kakao-search.js category FD6 --x=경도 --y=위도
  
  좌표_변환: |
    node scripts/kakao-search.js geocode "주소"
  
  경로_탐색: |
    node scripts/kakao-search.js directions "출발좌표" "도착좌표"

출력_형식:
  success: true
  results:
    - place_name: "장소명"
      address: "주소"
      category: "카테고리"
      phone: "전화번호"
      x: 127.027610
      y: 37.497942
      distance: 150
      place_url: "https://place.map.kakao.com/..."
  meta:
    total_count: 15
    api_calls: 3
    strategy_used: "route"
```

---

## 5. 스크립트 상세

### 5.1 kakao-search.js (메인 래퍼)

```yaml
위치: /scripts/kakao-search.js
역할: 카카오맵 API 통합 CLI 도구

명령어:
  keyword: 키워드로 장소 검색
  category: 카테고리 코드로 검색
  geocode: 주소 → 좌표 변환
  reverse: 좌표 → 주소 변환
  directions: 경로 탐색 (카카오 모빌리티)

공통_옵션:
  --x: 경도
  --y: 위도
  --radius: 검색 반경 (미터)
  --size: 결과 개수 (기본 15, 최대 45)
  --page: 페이지 번호

환경변수:
  KAKAO_REST_API_KEY: 카카오 REST API 키

출력: JSON 형식 (stdout)
```

### 5.2 유틸리티 스크립트

```yaml
route-segment.js:
  역할: 경로 좌표를 구간으로 분할
  입력: 경로 좌표 배열, 구간 간격, 버퍼 반경
  출력: 구간별 중심점 및 검색 반경
  
  예시:
    총 거리 15km, 간격 5km
    → 0km, 5km, 10km 지점에서 각각 2km 반경 검색

review-filter.js:
  역할: 장소 목록에서 리뷰 키워드로 필터링
  입력: 장소 목록, 필수 키워드, 최소 매칭 수
  출력: 조건 충족 장소만 반환
  
  주의: 카카오 API에서 리뷰 직접 조회 불가
        → place_url 스크래핑 또는 별도 처리 필요
```

---

## 6. 데이터 파일

### 6.1 slang-dictionary.json

```yaml
위치: /data/slang-dictionary.json
역할: 은어/맥락 표현 → 검색 조건 매핑

구조:
  음식:
    속이_편한:
      keywords: ["해장국", "죽", "우동", "백반", "칼국수"]
      category: "FD6"
    노가리:
      keywords: ["호프", "포차", "펍"]
      category: "FD6"
    해장:
      keywords: ["해장국", "콩나물국밥", "선지국"]
      category: "FD6"
  
  공간:
    작업하기_좋은:
      keywords: ["카페"]
      category: "CE7"
      review_check: ["콘센트", "와이파이", "오래", "노트북"]
    힙한:
      keywords: ["카페", "브런치"]
      review_check: ["인테리어", "감성"]
  
  맥락:
    30대_남자:
      preference: ["호프", "이자카야", "고기집"]
    30대_여자:
      preference: ["와인바", "감성주점"]
    대학생:
      filters: ["가성비", "저렴"]
    직장인:
      filters: ["역세권", "점심특선"]
```

---

## 7. 구현 체크리스트

### Phase 1: 기반 구축

- [ ] **1.1** 프로젝트 폴더 구조 생성
- [ ] **1.2** package.json 초기화 및 의존성 설치
  - dotenv
  - axios (API 호출용)
  - yargs (CLI 파싱용)
- [ ] **1.3** .env.example 작성
- [ ] **1.4** .gitignore 설정

### Phase 2: API 스크립트

- [ ] **2.1** scripts/kakao-search.js 기본 구조
- [ ] **2.2** keyword 명령어 구현
- [ ] **2.3** category 명령어 구현
- [ ] **2.4** geocode 명령어 구현
- [ ] **2.5** directions 명령어 구현 (카카오 모빌리티)
- [ ] **2.6** 단독 테스트 (터미널에서 직접 실행)

### Phase 3: 에이전트 정의

- [ ] **3.1** CLAUDE.md 오퍼레이터 작성
- [ ] **3.2** .claude/settings.json 설정
- [ ] **3.3** translator.md 에이전트 작성
- [ ] **3.4** map-search.md 에이전트 작성
- [ ] **3.5** api-picker.md 에이전트 작성

### Phase 4: 데이터 및 유틸리티

- [ ] **4.1** slang-dictionary.json 초기 데이터
- [ ] **4.2** route-segment.js 구현
- [ ] **4.3** review-filter.js 구현 (기본 구조만)

### Phase 5: 통합 테스트

- [ ] **5.1** 단순 검색 테스트: "강남역 근처 카페"
- [ ] **5.2** 맥락 검색 테스트: "노가리 까기 좋은 곳"
- [ ] **5.3** 경로 검색 테스트: "강남에서 판교 가는 길에 음식점"
- [ ] **5.4** 복합 검색 테스트: "강남에서 판교 가는 길에 속이 편한 음식점"

### Phase 6: 문서화

- [ ] **6.1** README.md 작성
- [ ] **6.2** 사용 예시 추가
- [ ] **6.3** GitHub 저장소 생성 및 푸시

---

## 8. API 설정 가이드

### 8.1 카카오 개발자 등록

1. https://developers.kakao.com 접속
2. 내 애플리케이션 → 애플리케이션 추가
3. 앱 이름: agentic-map-search (또는 원하는 이름)
4. 앱 키 → REST API 키 복사

### 8.2 카카오 모빌리티 (경로 탐색용)

1. https://developers.kakaomobility.com 접속
2. 별도 앱 등록 필요
3. 자동차 길찾기 API 사용 신청

### 8.3 .env 설정

```bash
# 필수
KAKAO_REST_API_KEY=your_kakao_rest_api_key

# 선택 (경로 탐색 사용 시)
KAKAO_MOBILITY_API_KEY=your_mobility_api_key

# 설정값
DEFAULT_SEARCH_RADIUS=2000
MAX_RESULTS=15
ROUTE_SEGMENT_DISTANCE=5000
```

---

## 9. 예상 이슈 및 대응

### 9.1 리뷰 필터링 한계

**문제**: 카카오맵 API는 리뷰 텍스트를 직접 제공하지 않음

**대응 옵션**:
1. place_url 반환 → 사용자가 직접 확인하도록 안내
2. 웹 스크래핑 (카카오맵 이용약관 확인 필요)
3. 네이버 플레이스 API 병행 (리뷰 요약 제공)

### 9.2 경로 API 쿼터

**문제**: 카카오 모빌리티 무료 쿼터 제한

**대응**:
- 테스트 단계에서는 직선 거리 기반 구간화로 대체
- 실제 경로가 필요한 경우만 API 호출

### 9.3 은어 사전 확장

**문제**: 초기 사전으로 커버 안 되는 표현

**대응**:
- Translator 에이전트가 사전에 없으면 LLM 추론으로 처리
- confidence 낮게 반환하여 사용자 확인 유도
- 피드백 기반으로 사전 점진적 확장

---

## 10. 다음 단계 (웹앱 연동)

본 문서의 Phase 1~5 완료 후:

1. **검증된 로직을 웹 API로 감싸기**
   - Express.js 서버 추가
   - POST /search 엔드포인트

2. **프론트엔드 구축**
   - 검색 입력창
   - 결과 리스트 + 지도 표시
   - 에이전트 처리 과정 시각화 (선택)

3. **Antigravity 브라우저 연동**
   - 에이전트가 검색 결과를 브라우저에서 확인
   - 스크린샷/녹화로 Artifact 생성

---

*문서 끝*
