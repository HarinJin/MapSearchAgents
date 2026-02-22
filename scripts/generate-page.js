#!/usr/bin/env node

/**
 * HTML 페이지 생성기
 *
 * 검색 결과 JSON을 받아 지도 기반 HTML 페이지를 생성합니다.
 * templates/travel-planner.html을 템플릿으로 사용합니다.
 *
 * Usage:
 *   node scripts/generate-page.js --file=results.json --open
 *   node scripts/generate-page.js --data='{"query":"...","places":[...]}' --open
 *   cat results.json | node scripts/generate-page.js --open
 *   node scripts/generate-page.js --file=results.json --output=my-search.html
 *   node scripts/generate-page.js --file=results.json --portable --open
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  normalizeKakaoPlace,
  normalizeGooglePlace,
  createAgentResponse,
  deduplicatePlaces,
} from './types/place.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const TEMPLATE_PATH = join(PROJECT_ROOT, 'templates', 'travel-planner.html');
const OUTPUT_DIR = join(PROJECT_ROOT, 'output');
const VENDOR_DIR = join(PROJECT_ROOT, 'vendor');

/** System font stack to replace Google Fonts Inter */
const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif";

/** Vendor files mapping: CDN URL pattern → local filename */
const VENDOR_FILES = {
  'leaflet.css': 'leaflet.min.css',
  'leaflet.js': 'leaflet.min.js',
  'MarkerCluster.css': 'MarkerCluster.css',
  'MarkerCluster.Default.css': 'MarkerCluster.Default.css',
  'leaflet.markercluster.js': 'leaflet.markercluster.min.js',
};

/**
 * APP_DATA places[] 내 개별 장소의 필드명을 템플릿 기대 형식으로 보정
 * 이미 정규화된 place(displayName + placeUrl 존재)는 그대로 통과
 */
function ensureNormalizedFields(place, provider) {
  if (place.displayName && place.placeUrl) return place;

  return {
    ...place,
    displayName: place.displayName || place.name || '',
    formattedAddress: place.formattedAddress || place.address || '',
    roadAddress: place.roadAddress || place.address || '',
    categoryCode: place.categoryCode || place.areaGroup || place.category || 'default',
    categoryGroupName: place.categoryGroupName || place.category || '',
    detailCategory: place.detailCategory || place.category || '',
    placeUrl: place.placeUrl || place.place_url || '',
    provider: place.provider || provider || 'kakao',
    location: place.location || { lat: place.lat, lng: place.lng },
  };
}

/**
 * 입력 데이터를 APP_DATA 형식으로 변환
 *
 * 지원 포맷:
 * 1. APP_DATA (정상): query + places[] 존재 → 필드 정규화 후 사용
 * 2. Kakao raw 결과: success + results[] 존재 → 정규화 후 래핑
 * 3. Place 배열: Array.isArray() → 정규화 후 래핑
 */
function transformToAppData(input) {
  // 1. 이미 APP_DATA 형식인 경우 → 필드 정규화 적용
  if (input.query && Array.isArray(input.places)) {
    input.places = input.places.map(p => ensureNormalizedFields(p, input.provider));
    if (!input.scenarios) {
      input.scenarios = input.context?.scenarios || [];
    }
    return input;
  }

  // 2. Kakao raw 결과 (kakao-search.js 출력)
  if (input.success !== undefined && Array.isArray(input.results)) {
    const provider = input.provider || 'kakao';
    const normalizer = provider === 'google' ? normalizeGooglePlace : normalizeKakaoPlace;
    const places = input.results.map(r => normalizer(r));
    const { places: deduped } = deduplicatePlaces(places);

    return createAgentResponse({
      query: input.query || input.keyword || '검색 결과',
      processedQuery: input.query || input.keyword || '',
      provider,
      places: deduped,
      totalCount: deduped.length,
      searchParams: {
        location: input.center || null,
        radius: input.radius || 2000,
        keywords: input.keyword ? [input.keyword] : [],
      },
      meta: {
        apiCalls: 1,
        strategyUsed: 'keyword',
        duplicatesRemoved: places.length - deduped.length,
        enrichmentStatus: 'none',
      },
    });
  }

  // 3. Place 배열
  if (Array.isArray(input)) {
    const places = input.map(p => {
      // 이미 정규화된 형식이면 그대로
      if (p.displayName && p.location) return p;
      // Kakao raw
      if (p.place_name) return normalizeKakaoPlace(p);
      // Google raw
      if (p.place_id) return normalizeGooglePlace(p);
      return p;
    });
    const { places: deduped } = deduplicatePlaces(places);

    return createAgentResponse({
      query: '검색 결과',
      places: deduped,
      totalCount: deduped.length,
    });
  }

  throw new Error(
    '지원하지 않는 입력 형식입니다. APP_DATA, Kakao raw 결과, 또는 Place 배열을 입력해주세요.'
  );
}

/**
 * _raw 필드를 재귀적으로 제거 (파일 크기 최적화)
 */
function stripRawFields(obj) {
  if (Array.isArray(obj)) {
    return obj.map(stripRawFields);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_raw') continue;
      result[key] = stripRawFields(value);
    }
    return result;
  }
  return obj;
}

/**
 * 쿼리에서 파일명 슬러그 생성
 */
function generateSlug(query) {
  return query
    .replace(/[^\w가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}

/**
 * 출력 파일명 생성
 */
function generateOutputFilename(query) {
  const slug = generateSlug(query) || 'search-result';
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${date}.html`;
}

/**
 * 읽을 수 있으면 vendor 파일을 읽고, 없으면 null 반환
 */
function readVendorFile(filename) {
  const filePath = join(VENDOR_DIR, filename);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

/**
 * photoUrl에서 사진을 다운로드하여 base64 data URI로 변환
 * 썸네일용으로 maxwidth를 200으로 제한
 *
 * @param {string} url - Google Photos API URL
 * @returns {Promise<string|null>} base64 data URI 또는 null (실패 시)
 */
async function fetchPhotoAsBase64(url) {
  try {
    // 썸네일용으로 maxwidth를 200으로 교체
    const thumbUrl = url.replace(/maxwidth=\d+/, 'maxwidth=200');
    const res = await fetch(thumbUrl);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * APP_DATA 내 photoUrl을 base64 data URI로 교체
 * 병렬 다운로드, 실패한 사진은 skip
 *
 * @param {Object} appData - APP_DATA 형식의 데이터 (mutates in-place)
 * @returns {Promise<void>}
 */
async function embedPhotos(appData) {
  const places = appData.places || [];
  const withPhoto = places
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.photoUrl);

  if (withPhoto.length === 0) return;

  const results = await Promise.all(
    withPhoto.map(async ({ p, i }) => {
      const dataUri = await fetchPhotoAsBase64(p.photoUrl);
      return { i, dataUri };
    })
  );

  results.forEach(({ i, dataUri }) => {
    if (dataUri) {
      appData.places[i] = { ...appData.places[i], photoUrl: dataUri };
    }
  });
}

/**
 * APP_DATA 내 photoUrl에서 API 키를 제거
 */
function stripApiKeysFromData(appData) {
  const places = appData.places || [];
  const stripped = places.filter(p => p.photoUrl && p.photoUrl.includes('key='));

  if (stripped.length === 0) return appData;

  return {
    ...appData,
    places: places.map(p => ({
      ...p,
      photoUrl: p.photoUrl
        ? p.photoUrl.replace(/[&?]key=AIza[A-Za-z0-9_-]+/g, '')
        : null,
    })),
  };
}

/**
 * HTML 템플릿을 포터블 모드로 변환
 *
 * 1. CDN <link>/<script> → vendor/ 파일 인라인
 * 2. Google Fonts → 시스템 폰트 스택
 * 3. API 키 패턴 제거
 */
function makePortable(html) {
  // 1. Google Fonts 제거 + 시스템 폰트 적용
  html = html.replace(
    /\s*<link rel="preconnect"[^>]*fonts\.googleapis\.com[^>]*>\s*/g,
    '\n'
  );
  html = html.replace(
    /\s*<link rel="preconnect"[^>]*fonts\.gstatic\.com[^>]*>\s*/g,
    '\n'
  );
  html = html.replace(
    /\s*<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g,
    '\n'
  );
  // Replace Inter font references with system stack
  html = html.replace(
    /'Inter',\s*/g,
    ''
  );
  html = html.replace(
    /font-family:\s*-apple-system/g,
    `font-family: ${SYSTEM_FONT_STACK.replace(/'/g, "'")}`
  );

  // 2. Leaflet CSS → inline <style>
  const leafletCss = readVendorFile(VENDOR_FILES['leaflet.css']);
  if (leafletCss) {
    html = html.replace(
      /\s*<link[^>]*unpkg\.com\/leaflet@[^>]*leaflet\.css[^>]*\/>\s*/,
      `\n  <style>/* Leaflet CSS (inlined) */\n${leafletCss}\n  </style>\n`
    );
  }

  // MarkerCluster CSS → inline <style>
  const mcCss = readVendorFile(VENDOR_FILES['MarkerCluster.css']);
  const mcDefaultCss = readVendorFile(VENDOR_FILES['MarkerCluster.Default.css']);
  if (mcCss && mcDefaultCss) {
    html = html.replace(
      /\s*<link[^>]*unpkg\.com\/leaflet\.markercluster[^>]*MarkerCluster\.css[^>]*\/>\s*/,
      `\n  <style>/* MarkerCluster CSS (inlined) */\n${mcCss}\n  </style>\n`
    );
    html = html.replace(
      /\s*<link[^>]*unpkg\.com\/leaflet\.markercluster[^>]*MarkerCluster\.Default\.css[^>]*\/>\s*/,
      `\n  <style>/* MarkerCluster.Default CSS (inlined) */\n${mcDefaultCss}\n  </style>\n`
    );
  }

  // 3. Leaflet JS → inline <script>
  const leafletJs = readVendorFile(VENDOR_FILES['leaflet.js']);
  if (leafletJs) {
    html = html.replace(
      /\s*<script[^>]*unpkg\.com\/leaflet@[^>]*leaflet\.js[^>]*><\/script>\s*/,
      `\n  <script>/* Leaflet JS (inlined) */\n${leafletJs}\n  </script>\n`
    );
  }

  // MarkerCluster JS → inline <script>
  const mcJs = readVendorFile(VENDOR_FILES['leaflet.markercluster.js']);
  if (mcJs) {
    html = html.replace(
      /\s*<script[^>]*unpkg\.com\/leaflet\.markercluster[^>]*><\/script>\s*/,
      `\n  <script>/* MarkerCluster JS (inlined) */\n${mcJs}\n  </script>\n`
    );
  }

  // 4. API 키 제거: &key=AIza... 패턴
  html = html.replace(/&key=AIza[A-Za-z0-9_-]+/g, '');
  html = html.replace(/\?key=AIza[A-Za-z0-9_-]+&?/g, '?');

  // 5. Kakao Maps SDK script 제거 (포터블에서는 불필요)
  html = html.replace(
    /\s*<script[^>]*dapi\.kakao\.com[^>]*><\/script>\s*/,
    '\n'
  );

  return html;
}

/**
 * HTML 페이지 생성
 *
 * @param {Object} appData - APP_DATA 형식의 데이터
 * @param {Object} options - 생성 옵션
 * @param {string} options.output - 출력 파일 경로
 * @param {string} options.title - 페이지 타이틀 (기본: 쿼리 기반)
 * @param {boolean} options.portable - 포터블 모드 (기본 ON: CDN 인라인, API 키 제거)
 * @returns {Promise<{ outputPath: string, size: number }>}
 */
export async function generatePage(appData, options = {}) {
  // 템플릿 읽기
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`템플릿 파일을 찾을 수 없습니다: ${TEMPLATE_PATH}`);
  }
  let template = readFileSync(TEMPLATE_PATH, 'utf-8');

  // 포터블 모드: 사진 임베딩 + API 키 제거 + vendor 확인
  let dataToEmbed = appData;
  if (options.portable) {
    // vendor/ 존재 확인
    if (!existsSync(VENDOR_DIR)) {
      console.error('[portable] vendor/ 디렉토리가 없습니다. 먼저 실행: node scripts/vendor-download.mjs');
      process.exit(1);
    }
    const hasPhotos = (appData.places || []).some(p => p.photoUrl);
    if (hasPhotos) {
      // 깊은 복사 후 사진 임베딩 (원본 보존)
      dataToEmbed = JSON.parse(JSON.stringify(appData));
      await embedPhotos(dataToEmbed);
    }
    // 남은 URL의 API 키 제거 (임베딩 실패 URL 포함)
    dataToEmbed = stripApiKeysFromData(dataToEmbed);
  }

  // _raw 필드 제거
  const cleanData = stripRawFields(dataToEmbed);

  // APP_DATA 주입
  const jsonStr = JSON.stringify(cleanData, null, 2);
  template = template.replace(
    /\/\* __APP_DATA__ \*\/ \{\}/,
    jsonStr
  );

  // 타이틀 주입
  const title = options.title || `${appData.query} - Map Search`;
  template = template.replace('__PAGE_TITLE__', title);

  // 포터블 모드: CSS/JS 인라인, 폰트 교체, API 키 제거
  if (options.portable) {
    template = makePortable(template);
  }

  // 출력 경로 결정
  const outputFilename = options.output || generateOutputFilename(appData.query);
  const outputPath = resolve(OUTPUT_DIR, outputFilename);

  // output 디렉토리 확인
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 파일 쓰기
  writeFileSync(outputPath, template, 'utf-8');

  const size = Buffer.byteLength(template, 'utf-8');
  return { outputPath, size };
}

/**
 * 브라우저에서 열기
 */
function openInBrowser(filePath) {
  try {
    execSync(`open "${filePath}"`, { stdio: 'ignore' });
  } catch {
    console.error(`브라우저에서 열 수 없습니다: ${filePath}`);
  }
}

/**
 * stdin에서 JSON 읽기
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    // TTY인 경우 (파이프 아님) → 빈 문자열 반환
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * CLI 실행
 */
async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('file', {
      alias: 'f',
      type: 'string',
      description: 'JSON 파일 경로',
    })
    .option('data', {
      alias: 'd',
      type: 'string',
      description: '인라인 JSON 데이터',
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: '출력 파일명 (output/ 디렉토리 내)',
    })
    .option('title', {
      alias: 't',
      type: 'string',
      description: '페이지 타이틀',
    })
    .option('open', {
      type: 'boolean',
      default: false,
      description: '생성 후 브라우저에서 열기',
    })
    .option('portable', {
      alias: 'p',
      type: 'boolean',
      default: true,
      description: '포터블 모드 (기본 ON): CDN 인라인, API 키 제거. --no-portable로 끌 수 있음',
    })
    .example('$0 --file=results.json --open', '파일에서 생성 후 열기')
    .example('$0 --file=results.json --portable --open', '포터블 HTML 생성')
    .example('$0 --data=\'{"query":"카페","places":[]}\'', '인라인 JSON으로 생성')
    .example('cat results.json | $0 --open', 'stdin 파이프로 생성')
    .help()
    .argv;

  let rawInput;

  // 입력 소스 결정: --file > --data > stdin
  if (argv.file) {
    const filePath = resolve(argv.file);
    if (!existsSync(filePath)) {
      console.error(`파일을 찾을 수 없습니다: ${filePath}`);
      process.exit(1);
    }
    rawInput = readFileSync(filePath, 'utf-8');
  } else if (argv.data) {
    rawInput = argv.data;
  } else {
    rawInput = await readStdin();
    if (!rawInput.trim()) {
      console.error('입력 데이터가 없습니다. --file, --data, 또는 stdin으로 JSON을 제공해주세요.');
      process.exit(1);
    }
  }

  // JSON 파싱
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (e) {
    console.error(`JSON 파싱 오류: ${e.message}`);
    process.exit(1);
  }

  // APP_DATA 변환
  let appData;
  try {
    appData = transformToAppData(input);
  } catch (e) {
    console.error(`데이터 변환 오류: ${e.message}`);
    process.exit(1);
  }

  // HTML 생성
  const { outputPath, size } = await generatePage(appData, {
    output: argv.output,
    title: argv.title,
    portable: argv.portable,
  });

  const sizeKB = (size / 1024).toFixed(1);
  console.log(JSON.stringify({
    success: true,
    outputPath,
    size: `${sizeKB}KB`,
    placesCount: appData.places?.length || 0,
    query: appData.query,
    portable: argv.portable || false,
  }, null, 2));

  // 브라우저 열기
  if (argv.open) {
    openInBrowser(outputPath);
  }
}

main().catch(err => {
  console.error(`오류: ${err.message}`);
  process.exit(1);
});
