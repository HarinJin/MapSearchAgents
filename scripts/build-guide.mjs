#!/usr/bin/env node

/**
 * 가이드 데이터 빌더
 *
 * Google Places API 상세 정보 + 리뷰를 분석하여
 * APP_DATA.guide 구조를 생성합니다.
 *
 * Usage:
 *   node scripts/build-guide.mjs --details=output/details-raw.json --appdata=output/enriched.json
 *   → output에 guide 필드가 추가된 JSON 저장
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ── 리뷰 텍스트에서 패턴 감지 ──
function findEvidence(reviews, patterns, placeName, placeId) {
  const evidence = [];
  for (const review of reviews) {
    const text = (review.text || '').toLowerCase();
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        evidence.push({
          placeId,
          placeName,
          text: review.text.length > 150 ? review.text.slice(0, 150) + '...' : review.text,
          author: review.author_name || review.author || 'Anonymous',
          rating: review.rating || 0
        });
        break; // 같은 리뷰에서 중복 감지 방지
      }
    }
  }
  return evidence;
}

// ── 가이드 섹션 정의 ──
const GUIDE_SECTIONS = [
  {
    id: 'kids-play',
    icon: '🎪',
    title: '아이 놀이공간이 있는 식당',
    description: '수영장, 놀이터 등 아이들이 놀 수 있는 별도 공간',
    reason: '리뷰에서 "수영장(pool)", "놀이공간(play area)", "키즈존(kids zone)" 등을 언급한 식당들이에요. 아이가 놀고 있는 동안 어른들은 여유롭게 식사할 수 있어서, 7인 가족 여행에 특히 유용한 곳들이에요.',
    patterns: [/pool|play\s*area|play\s*ground|swing|slide|sand\s*box|kids?\s*area|kids?\s*zone|kids?\s*pool|children.?play|สระ/i]
  },
  {
    id: 'kids-menu',
    icon: '🍽️',
    title: '어린이/가족 친화 메뉴',
    description: '키즈 메뉴, 순한 맛, 어린이 의자 등',
    reason: '리뷰에서 "키즈 메뉴", "어린이 의자", "가족 친화적", "순한 맛" 등을 언급한 식당들이에요. 어린아이와 함께 방문하기 편한 환경을 갖추고 있다는 평가를 받았어요.',
    patterns: [/kids?\s*menu|children.?menu|high\s*chair|baby\s*chair|child\s*friendly|family\s*friendly|family.*run|booster\s*seat|child\s*portion|mild|not\s*spicy/i]
  },
  {
    id: 'ocean-view',
    icon: '🌅',
    title: '오션뷰 & 선셋 맛집',
    description: '바다 전망과 석양을 감상하며 식사할 수 있는 곳',
    reason: '"바다 전망(sea view)", "해변가(beachside)", "석양이 아름답다(sunset)" 등 뷰를 칭찬하는 리뷰가 많은 식당들이에요. 꼬란타의 아름다운 석양을 감상하며 식사할 수 있는 특별한 경험을 원한다면 이 식당들을 추천해요.',
    patterns: [/ocean\s*view|sea\s*view|beach\s*front|sunset|sun\s*set|beachside|beach\s*side|waterfront|on\s*the\s*beach|right\s*on|facing\s*the\s*sea|gorgeous\s*view|beautiful\s*view|stunning\s*view|amazing\s*view/i]
  },
  {
    id: 'fresh-seafood',
    icon: '🦐',
    title: '신선한 시푸드 전문',
    description: '리뷰에서 해산물 신선도가 특히 언급된 곳',
    reason: '"신선한 해산물", "랍스터", "생선구이", "새우" 등 해산물 품질을 특별히 언급한 식당들이에요. 섬에서만 맛볼 수 있는 신선한 해산물 경험을 놓치지 마세요.',
    patterns: [/fresh\s*seafood|fresh\s*fish|fresh\s*shrimp|fresh\s*crab|lobster|grilled\s*fish|catch\s*of|today.?catch|ปลา|กุ้ง/i]
  },
  {
    id: 'best-thai',
    icon: '🇹🇭',
    title: '정통 태국 음식 추천',
    description: '팟타이, 그린커리, 똠얌 등 태국 대표 메뉴가 맛있는 곳',
    reason: '팟타이, 그린커리, 마사만 커리, 솜탐 등 태국 대표 메뉴가 리뷰에서 특별히 맛있다고 언급된 식당들이에요. 꼬란타에 왔으니 정통 태국 음식을 제대로 맛보고 싶다면 이곳들을 추천해요.',
    patterns: [/pad\s*thai|green\s*curry|tom\s*yam|tom\s*kha|massaman|som\s*tam|papaya\s*salad|authentic\s*thai|real\s*thai|traditional\s*thai|best\s*thai/i]
  },
  {
    id: 'vegan-options',
    icon: '🥦',
    title: '채식/비건 메뉴 가능',
    description: '채식 옵션이 별도로 준비되어 있는 곳',
    reason: '"비건(vegan)", "채식(vegetarian)", "두부 메뉴", "고기 없는 옵션" 등을 리뷰에서 언급한 식당들이에요. 가족 중 채식을 선호하는 분이 있거나, 가벼운 한 끼를 원할 때 유용해요.',
    patterns: [/vegan|vegetarian|plant.?based|veggie|meat.?free|tofu.*option|mushroom.*dish/i]
  },
  {
    id: 'budget-friendly',
    icon: '💰',
    title: '가성비 좋은 곳',
    description: '합리적인 가격으로 맛있는 식사를 할 수 있는 곳',
    reason: '방문자들이 "가격 대비 훌륭하다", "저렴하다", "가성비가 좋다"고 언급한 식당들이에요. 7인 가족이 매끼 외식하면 비용이 부담될 수 있는데, 이 식당들은 합리적인 가격에 만족스러운 식사를 제공한다는 평가를 받았어요.',
    patterns: [/cheap|affordable|value\s*for|worth\s*every|good\s*price|reasonable\s*price|budget|inexpensive|great\s*value|bang\s*for/i]
  },
  {
    id: 'brunch-spot',
    icon: '🍳',
    title: '브런치 & 아침 식사 추천',
    description: '아침/브런치 메뉴가 특히 좋은 곳',
    reason: '리뷰에서 "아침식사(breakfast)", "브런치(brunch)", "모닝 커피"를 특별히 칭찬한 식당들이에요. 여행 중 아침을 어디서 먹을지 고민될 때, 이 식당들이 가장 많이 추천되었어요. 숙소에서 가까운 곳들이 많아 아침에 편하게 방문할 수 있어요.',
    patterns: [/breakfast|brunch|morning|eggs?\s*benedict|pancake|french\s*toast|morning\s*coffee|great\s*breakfast|best\s*breakfast|amazing\s*breakfast/i]
  },
  {
    id: 'atmosphere',
    icon: '✨',
    title: '분위기 & 인테리어 추천',
    description: '아늑한 분위기, 예쁜 인테리어로 특별한 식사',
    reason: '"아늑하다(cozy)", "분위기가 좋다", "정원이 예쁘다(garden)", "로맨틱하다" 등 공간 분위기를 칭찬하는 리뷰가 많은 식당들이에요. 단순히 식사만 하는 것이 아니라, 꼬란타의 특별한 분위기를 즐기며 식사하고 싶을 때 추천해요.',
    patterns: [/cozy|romantic|beautiful\s*decor|lovely\s*place|gorgeous\s*place|amazing\s*atmosphere|wonderful\s*atmosphere|garden|lush|green|fairy\s*light|candle/i]
  },
  {
    id: 'generous-portions',
    icon: '🍖',
    title: '양이 넉넉한 곳',
    description: '7인 가족도 배부르게 먹을 수 있는 넉넉한 양',
    reason: '"양이 엄청 많다(big portion)", "다 못 먹었다", "푸짐하다(generous)" 등 양에 대한 언급이 있는 식당들이에요. 7인 가족이 배부르게 먹을 수 있는 곳을 찾고 있다면 이곳들을 참고하세요.',
    patterns: [/big\s*portion|large\s*portion|generous\s*portion|huge\s*portion|so\s*much\s*food|couldn.?t\s*finish|too\s*much|very\s*filling|massive|enormous/i]
  }
];

// ── 주의사항 감지 ──
const WARNING_PATTERNS = [
  { pattern: /cash\s*only|no\s*card|don.?t.*accept.*card/i, message: '현금만 가능 (Cash Only)' },
  { pattern: /reservation|book\s*in\s*advance|book\s*ahead|need\s*to\s*book|必|จอง/i, message: '사전 예약 권장' },
  { pattern: /long\s*wait|waiting\s*time|queue|waited\s*\d+|line\s*up/i, message: '대기 시간이 길 수 있음' },
  { pattern: /closed\s*(on\s*)?monday|close.*monday/i, message: '월요일 휴무 가능' },
  { pattern: /closed\s*(on\s*)?sunday|close.*sunday/i, message: '일요일 휴무 가능' },
  { pattern: /expensive|pricey|overpriced|bit\s*steep/i, message: '가격이 다소 높은 편' },
  { pattern: /mosquito|bugs?|insect/i, message: '야외석 모기 주의' },
  { pattern: /no\s*air\s*con|no\s*ac|fan\s*only|open\s*air/i, message: '에어컨 없음 (야외/선풍기)' },
];

// ── Main ──
function buildGuide(detailsRaw, appData) {
  const guide = { sections: [], tips: [], warnings: [] };

  // placeId → details map
  const detailMap = {};
  detailsRaw.forEach(d => {
    if (d.success) detailMap[d.place_id] = d;
  });

  // Build sections
  for (const sectionDef of GUIDE_SECTIONS) {
    const matchedPlaces = [];
    const allEvidence = [];

    for (const place of appData.places) {
      const detail = detailMap[place.id];
      if (!detail) continue;

      const reviews = detail.reviews || [];
      const evidence = findEvidence(reviews, sectionDef.patterns, place.displayName, place.id);

      if (evidence.length > 0) {
        matchedPlaces.push(place.id);
        allEvidence.push(...evidence);
      }
    }

    // Only include sections with at least 1 match
    if (matchedPlaces.length > 0) {
      guide.sections.push({
        id: sectionDef.id,
        icon: sectionDef.icon,
        title: sectionDef.title,
        description: sectionDef.description,
        reason: sectionDef.reason,
        placeIds: matchedPlaces,
        evidence: allEvidence.slice(0, 10) // max 10 per section
      });
    }
  }

  // Sort sections: more matches first
  guide.sections.sort((a, b) => b.placeIds.length - a.placeIds.length);

  // Build warnings
  for (const place of appData.places) {
    const detail = detailMap[place.id];
    if (!detail) continue;

    const reviews = detail.reviews || [];
    const allText = reviews.map(r => r.text || '').join(' ');

    for (const wp of WARNING_PATTERNS) {
      if (wp.pattern.test(allText)) {
        // Avoid duplicate warnings for same place+message
        const exists = guide.warnings.some(w => w.placeId === place.id && w.text === wp.message);
        if (!exists) {
          guide.warnings.push({
            placeId: place.id,
            placeName: place.displayName,
            text: wp.message
          });
        }
      }
    }
  }

  // Tips
  const walkable = appData.places.filter(p => p.distance && p.distance < 2000);
  guide.tips = [
    `숙소에서 도보 가능한 식당: ${walkable.length}곳 (${walkable.map(p => p.displayName).join(', ')})`,
    'Grab 앱으로 이동하면 가장 편리 (꼬란타는 일반 택시 없음)',
    '저녁 6~8시가 피크타임 — 인기 식당은 예약 권장',
    '7인 가족이면 대형 테이블 사전 요청 필수',
    '아이 하이체어는 관광지 식당 대부분 보유',
    '태국 음식 매운맛 주의 — "not spicy" 또는 "mild" 요청 가능',
    '대부분 현금+카드 모두 가능하지만 소규모 식당은 현금 준비',
  ];

  return guide;
}

// ── CLI ──
const args = process.argv.slice(2);
let detailsPath = 'output/koh-lanta-details-raw.json';
let appDataPath = 'output/koh-lanta-enriched.json';
let outputPath = null;

for (const arg of args) {
  if (arg.startsWith('--details=')) detailsPath = arg.split('=')[1];
  if (arg.startsWith('--appdata=')) appDataPath = arg.split('=')[1];
  if (arg.startsWith('--output=')) outputPath = arg.split('=')[1];
}

const detailsRaw = JSON.parse(readFileSync(resolve(detailsPath), 'utf-8'));
const appData = JSON.parse(readFileSync(resolve(appDataPath), 'utf-8'));

const guide = buildGuide(detailsRaw, appData);

// Merge guide into appData
appData.guide = guide;

const out = outputPath || appDataPath.replace('.json', '-with-guide.json');
writeFileSync(resolve(out), JSON.stringify(appData, null, 2));

console.log(`Guide built: ${guide.sections.length} sections, ${guide.warnings.length} warnings, ${guide.tips.length} tips`);
guide.sections.forEach(s => console.log(`  ${s.icon} ${s.title}: ${s.placeIds.length}곳, ${s.evidence.length} evidence`));
console.log(`Output: ${out}`);
