#!/usr/bin/env node

/**
 * 가이드 리뷰 번역기
 *
 * guide.sections[].evidence[].text (영어 원문)에 대해
 * translatedText (한국어 번역)를 추가합니다.
 *
 * Usage:
 *   node scripts/translate-evidence.mjs --input=output/koh-lanta-final.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ── 번역 맵: 영어 원문 앞 80자 → 한국어 번역 ──
// 원문이 길어도 앞부분만 매칭하여 중복 번역을 방지
const TRANSLATIONS = new Map([
  // The Cliff
  ["The view is worth everything", "전망이 정말 모든 것의 가치가 있어요! 4박 3일 동안 아침, 점심, 저녁 올인클루시브 식사를 하기에 완벽한 곳이에요. 비록..."],
  ["Great food and services in the cliff", "아바니+ 꼬란타 내 클리프 레스토랑의 훌륭한 음식과 서비스. 찜 요리를 강력 추천해요..."],

  // The Lobster
  ["(FYI cash only) We found the lobster", "(참고: 현금만 가능) 호텔에서 매우 가까워서 이 식당을 발견했어요. 너무 좋아서 일주일에 3번이나 다시 갔어요. 아침식사가 훌륭하고..."],
  ["We have been here now for breakfast, lunch and dinner and have not", "아침, 점심, 저녁 다 먹어봤는데 실망한 적이 없어요. 음식 품질이..."],
  ["Went here in the beginning of January 2025", "2025년 1월 초에 방문했어요. 일행 중 두 명이 정말 랍스터를 먹고 싶어했는데 갑자기..."],
  ["The good was so good we went back", "음식이 너무 맛있어서 다음 날 다시 갔어요. 마사만 커리가 지금까지 먹어본 중 최고였어요!..."],
  ["Stay far away from this place", "이 식당 절대 가지 마세요! 완전 바가지! 랍스터를 먹으러 갔는데 셰프 스페셜을 주문했더니..."],

  // The Oasis Restaurant and Bar
  ["We had a brunch after New Years Eve", "새해 전날 브런치를 먹었는데 정말 딱 맞는 곳이었어요. 매우 평화롭고, 음식과 커피가 훌륭했어요..."],
  ["Beautifully healthy and fresh breakfast", "건강하고 신선한 아침식사가 정말 아름다워요. 깔끔한 모던 카페에 서비스도 훌륭해요. 아마 최고의..."],
  ["What a delightful oasis. The loveliest people", "정말 멋진 오아시스 같은 곳이에요. 가장 사랑스러운 분들이 가장 맛있는 음식을 서빙해요. 주스와 스무디가..."],
  ["Yummy food. Big serving. Good quality", "맛있는 음식에 양도 많아요. 다양한 메뉴에 재료 품질이 좋아요. 페스토 파스타가 너무 맛있어서 사진 찍는 것도 잊을 정도..."],

  // Ohana Home Cooking 2
  ["What a hidden goldmine", "숨겨진 보석 같은 곳! 음식이 훌륭하고, 환영받는 느낌이에요. 직원들도 매우 친절하고 가성비가..."],
  ["Lovely place! Delicious food, amazing service and cute puppy", "사랑스러운 곳이에요! 맛있는 음식, 훌륭한 서비스, 그리고 함께 놀 수 있는 귀여운 강아지까지 ❤️"],

  // Seagull Kitchen
  ["The moment the pineapple fried rice arrived", "파인애플 볶음밥이 나오는 순간, 이번 식사가 대박일 거라는 걸 알았어요. 진짜 파인애플 안에 담겨서 나오는데..."],
  ["We have been here two days in a row", "이틀 연속 방문했는데, 두 번 다 훌륭했어요. 그린 커리와 레드 커리를 먹었는데 태국에서 먹어본 것 중 최고였어요..."],
  ["Great chill place", "정통 태국 음식을 먹기에 좋은 편안한 곳이에요. 닭고기 볶음과 스트로베리 다이키리를 먹었는데..."],
  ["Became a regular spot for me during trip", "꼬란타 여행 중 단골 식당이 됐어요. 매우 친절하고 도움이 되는 직원들에, 빠른 서비스까지..."],

  // Where Else Garden Eatery & Bar
  ["Great place with a very cool vibe", "매우 멋진 분위기의 좋은 곳이에요. 정글 트리하우스를 상상하세요. 비가 계속 오는 날에 방문했는데..."],
  ["Nina is so welcoming and we have been back", "니나가 정말 환영해주고, 아침식사가 너무 좋아서 여러 번 다시 왔어요 - 특히..."],
  ["Simple and delicious food. Huuuuuge backyard", "심플하고 맛있는 음식. 거대한 뒤뜰에 혼자든 여럿이든 앉을 수 있는 아늑한 공간이 많아요..."],
  ["One of the best restaurants in ko Lanta", "제 생각에 꼬란타 최고의 식당 중 하나에요. 음식이 훌륭하고, 직원들이 정말 친절해요..."],

  // Danny's Restaurant
  ["Fabulous breakfast of the highest quality", "최고 품질의 환상적인 아침식사, 훌륭한 베이컨과 소시지, 모든 게 뜨끈뜨끈하고 커피도..."],
  ["We found this place after a recommendation", "숙소 추천으로 이곳을 찾았는데, 왜 추천했는지 정말 이해가 돼요. 완전히..."],

  // Nang Sabai Ina's German Restaurant
  ["Great homey beach side restaurant serving up delicious Thai and European", "해변가의 아늑한 식당으로 맛있는 태국 음식과 유럽 음식을 제공해요. 특히..."],
  ["This is a must try place. It is very clean", "꼭 가봐야 할 곳이에요. 매우 깨끗하고 음식이 맛있으면서도 매우 저렴해요. 이나 사장님이..."],
  ["Absolutely outstanding food and service by Ina", "이나와 직원들의 음식과 서비스가 정말 훌륭했어요. 먼저 석양을 바라보며 편안하게 음료를 마셨는데..."],

  // Family Bar & Restaurant
  ["Great experience at the Family Bar", "패밀리 바 & 레스토랑에서 좋은 경험을 했어요. 오후 6시쯤 따뜻하게 맞아주셨고..."],
  ["Stumbled into this little family-run spot", "조용한 토요일 점심때 우연히 이 작은 가족 운영 식당에 들어갔는데, 정말 좋은 발견이었어요. 우리가..."],

  // PakChee Café
  ["WOW we just bad breakfast here", "와우, 여기서 아침을 먹었는데 정말 대박이었어요. 말차와 태국 차를 주문했는데 - 둘 다 놀라울 정도로 맛있었어요..."],
  ["This caf", "이 카페는 맛있는 사워도우 토스트가 있고, 맑은 날에는 놀라운 바다 전망이 있어서 정말 사랑스러운 장소예요..."],

  // Hidden tree cafe & restaurant
  ["Had breakfast at the Hidden Tree", "히든 트리에서 아침을 먹었어요. 정말 평화롭고 아름다운 곳에서 앉아 먹는 느낌이 좋았고, 음식도 놀라웠어요..."],
  ["We were there for breakfast. The place is really cute and green", "아침을 먹으러 갔어요. 정말 귀엽고 초록초록한 곳이에요. 돌아다니는 강아지 두 마리도 있어서..."],

  // Sanctuary Restaurant
  ["The best Massam Curry in Thailand", "태국 최고의 마사만 커리. 해변에서 몇 걸음 거리의 훌륭한 가족 레스토랑이에요. 음식이 정말..."],
  ["Delicious, great service, and a wide variety of options", "맛있고, 서비스 좋고, 선택지가 다양해요! 꼬란타 첫날 밤에 방문했는데..."],

  // Turtle Beach Restaurant
  ["The food at turtle beach was outstanding", "터틀 비치의 음식은 정말 뛰어났어요. 그린 커리 리조또 같은 건 먹어본 적이 없는데, 정말 최고였어요..."],
  ["What a great place to watch the sunset", "석양을 보기에 정말 좋은 곳이에요 - 파티오 가장자리에 앉아서 실제로 바다 위로 지는 석양을 바라봤어요..."],
  ["A great find, perfect location", "좋은 발견이에요, 완벽한 위치. 바다를 바라보며 앉을 수 있는 석양 명당이에요. 예약이 필요..."],

  // The Hope Kitchen
  ["Great watermelon shake and a pretty good green curry", "수박 쉐이크가 훌륭하고 그린 커리도 꽤 맛있어요. 이곳은 해가 지면 더 좋아지는데, 거의 모든 좌석이..."],
  ["AmaZing atmosphere on the beach", "해변의 놀라운 분위기. 음식이 환상적이고 직원들도 훌륭했어요. 여행 중 가장 좋았던 식사 중 하나..."],

  // Gina Café and Restaurant
  ["Nice little restaurant, and the best veggie massaman", "아담하고 좋은 식당이에요. 지금까지 먹어본 채식 마사만 커리 중 최고! 정말 다양한 맛이 나서 너무 좋았어요..."],
  ["We came here because of the reviews", "리뷰와 기사를 보고 방문했어요. 사장님 부부가 따뜻하게 맞아주셨어요. 새우 요리를 주문했는데..."],
  ["Delicious food with gorgeous presentation", "맛있는 음식에 아름다운 플레이팅, 정말 좋은 가격! 이 채식 팟타이는 정말..."],

  // Lanta Lily Restaurant
  ["I really like this place. Lovely pool side", "이곳이 정말 좋아요. 수영장 옆의 아름다운 레스토랑에 훌륭한 액티비티와 엔터테인먼트가 있어요. 환영하는 분위기에..."],
  ["Very nice place to let the kids swim", "아이들이 수영장에서 놀게 하면서 맥주를 마실 수 있는 좋은 곳이에요. 다양한 엔터테인먼트 프로그램이..."],
  ["I believe the owner of Lanta Lily", "란타 릴리 사장님이 묵 란타 에코 리조트도 소유하고 있는 것 같아요. 수익을 극대화하려는..."],
  ["Very nice & yummy food, nice pool and cool drinks", "맛있는 음식, 좋은 수영장과 시원한 음료, 매우 친절한 사장님 부부. 묵 란타 에코 리조트에 묵었는데..."],

  // Peace and love restaurant
  ["Awesome little restaurant, so nice and friendly owners", "멋진 작은 식당이에요, 정말 친절한 사장님 부부. 최고의 생선구이와 새우구이를 만들어요 👌 그냥..."],
]);

// ── 번역 함수 ──
function translateText(originalText) {
  // 원문 앞부분으로 매칭
  for (const [prefix, translation] of TRANSLATIONS) {
    if (originalText.toLowerCase().startsWith(prefix.toLowerCase())) {
      return translation;
    }
  }
  // 매칭 실패 시 null 반환 (원문 유지)
  return null;
}

// ── Main ──
const args = process.argv.slice(2);
let inputPath = 'output/koh-lanta-final.json';

for (const arg of args) {
  if (arg.startsWith('--input=')) inputPath = arg.split('=')[1];
}

const data = JSON.parse(readFileSync(resolve(inputPath), 'utf-8'));

let translated = 0;
let missed = 0;
const missedTexts = [];

if (data.guide && data.guide.sections) {
  for (const section of data.guide.sections) {
    for (const ev of section.evidence) {
      const kr = translateText(ev.text);
      if (kr) {
        ev.translatedText = kr;
        translated++;
      } else {
        missedTexts.push(`[${section.id}] ${ev.placeName}: "${ev.text.slice(0, 60)}..."`);
        missed++;
      }
    }
  }
}

writeFileSync(resolve(inputPath), JSON.stringify(data, null, 2));

console.log(`Translated: ${translated}, Missed: ${missed}`);
if (missedTexts.length > 0) {
  console.log('Missing translations:');
  missedTexts.forEach(t => console.log(`  ${t}`));
}
