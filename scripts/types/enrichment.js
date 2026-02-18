/**
 * 시간 조건 처리 관련 타입 정의
 *
 * 카카오 API는 영업시간을 제공하지 않으므로,
 * 이 모듈은 시간 조건을 파싱하고 사용자 안내 메시지를 생성하는 데 사용됩니다.
 *
 * @module types/enrichment
 */

/**
 * 시간 조건 스키마
 */
export const TimeConditionSchema = {
  type: 'none',                 // 'now', 'specific_time', 'time_range', 'day_part', 'none'
  originalText: '',             // "지금 영업중인", "오후 3시에" 등

  // specific_time인 경우
  hour: null,                   // 0-23
  minute: null,                 // 0-59

  // time_range인 경우
  startHour: null,
  endHour: null,

  // day_part인 경우
  dayPart: '',                  // 'morning', 'lunch', 'afternoon', 'dinner', 'night', 'latenight'

  // 사용자 안내
  userGuidance: ''              // 프론트엔드에 표시할 안내 메시지
};

/**
 * 시간대 범위 정의
 */
export const DAY_PART_HOURS = {
  morning: { start: 6, end: 11, label: '아침' },
  lunch: { start: 11, end: 14, label: '점심' },
  afternoon: { start: 14, end: 17, label: '오후' },
  dinner: { start: 17, end: 21, label: '저녁' },
  night: { start: 21, end: 24, label: '밤' },
  latenight: { start: 0, end: 6, label: '새벽' }
};

/**
 * 시간 조건 키워드 매핑
 */
export const TIME_CONDITION_KEYWORDS = {
  // 현재 시간
  now: ['지금', '현재', '영업중', '문 연', '열린', '바로'],

  // 시간대
  morning: ['아침', '조조', '오전', '모닝'],
  lunch: ['점심', '런치'],
  afternoon: ['오후', '낮'],
  dinner: ['저녁', '디너'],
  night: ['밤', '야간'],
  latenight: ['새벽', '심야', '늦게까지', '24시', '야식']
};

/**
 * 시간 조건 안내 메시지 템플릿
 */
const TIME_GUIDANCE_TEMPLATES = {
  now: '⏰ 현재 영업 여부는 각 장소의 카카오맵 링크에서 확인해주세요.',
  specific_time: (hour) => `⏰ ${hour}시 영업 여부는 각 장소의 영업시간을 카카오맵에서 확인해주세요.`,
  day_part: (label) => `⏰ ${label} 시간대 영업 여부는 카카오맵에서 확인해주세요.`,
  time_range: (start, end) => `⏰ ${start}시~${end}시 영업 여부는 카카오맵에서 확인해주세요.`,
  none: ''
};

/**
 * 시간 조건 텍스트 파싱
 *
 * @param {string} text - "지금 영업중인", "오후 3시에" 등의 텍스트
 * @returns {Object} TimeConditionSchema 형태의 객체
 */
export function parseTimeCondition(text) {
  const result = {
    ...TimeConditionSchema,
    originalText: text || ''
  };

  if (!text) {
    return result;
  }

  const lowerText = text.toLowerCase();

  // 1. 현재 시간 체크
  for (const keyword of TIME_CONDITION_KEYWORDS.now) {
    if (lowerText.includes(keyword)) {
      result.type = 'now';
      result.userGuidance = TIME_GUIDANCE_TEMPLATES.now;
      return result;
    }
  }

  // 2. 특정 시간 패턴 체크 (오후 3시, 15시 등)
  const pmMatch = text.match(/오후\s*(\d{1,2})시/);
  if (pmMatch) {
    result.type = 'specific_time';
    result.hour = parseInt(pmMatch[1]) + 12;
    result.minute = 0;
    result.userGuidance = TIME_GUIDANCE_TEMPLATES.specific_time(result.hour);
    return result;
  }

  const amMatch = text.match(/오전\s*(\d{1,2})시/);
  if (amMatch) {
    result.type = 'specific_time';
    result.hour = parseInt(amMatch[1]);
    result.minute = 0;
    result.userGuidance = TIME_GUIDANCE_TEMPLATES.specific_time(result.hour);
    return result;
  }

  const hourMatch = text.match(/(\d{1,2})시/);
  if (hourMatch) {
    result.type = 'specific_time';
    result.hour = parseInt(hourMatch[1]);
    // 12시간제 추정 (13시 이하이고 저녁/밤 맥락이면)
    if (result.hour <= 12 && (lowerText.includes('저녁') || lowerText.includes('밤'))) {
      result.hour += 12;
    }
    result.minute = 0;
    result.userGuidance = TIME_GUIDANCE_TEMPLATES.specific_time(result.hour);
    return result;
  }

  // 3. 시간대 체크
  const dayPartMappings = [
    { keywords: TIME_CONDITION_KEYWORDS.morning, dayPart: 'morning' },
    { keywords: TIME_CONDITION_KEYWORDS.lunch, dayPart: 'lunch' },
    { keywords: TIME_CONDITION_KEYWORDS.afternoon, dayPart: 'afternoon' },
    { keywords: TIME_CONDITION_KEYWORDS.dinner, dayPart: 'dinner' },
    { keywords: TIME_CONDITION_KEYWORDS.night, dayPart: 'night' },
    { keywords: TIME_CONDITION_KEYWORDS.latenight, dayPart: 'latenight' }
  ];

  for (const { keywords, dayPart } of dayPartMappings) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        result.type = 'day_part';
        result.dayPart = dayPart;
        const hours = DAY_PART_HOURS[dayPart];
        result.startHour = hours.start;
        result.endHour = hours.end;
        result.userGuidance = TIME_GUIDANCE_TEMPLATES.day_part(hours.label);
        return result;
      }
    }
  }

  return result;
}

/**
 * 시간 조건이 있는지 확인
 *
 * @param {Object} timeCondition - parseTimeCondition 결과
 * @returns {boolean} 시간 조건 존재 여부
 */
export function hasTimeCondition(timeCondition) {
  return timeCondition && timeCondition.type !== 'none';
}

/**
 * 장소에 시간 안내 정보 추가
 *
 * @param {Object} place - 정규화된 Place 객체
 * @returns {Object} timeInfo가 추가된 Place 객체
 */
export function addTimeInfoToPlace(place) {
  return {
    ...place,
    timeInfo: {
      status: 'unknown',
      message: '영업시간은 카카오맵에서 확인하세요',
      checkUrl: place.placeUrl
    }
  };
}

/**
 * 장소 목록에 시간 안내 정보 추가
 *
 * @param {Array} places - Place 객체 배열
 * @param {Object} timeCondition - parseTimeCondition 결과
 * @returns {Object} { places: 안내 추가된 배열, timeCondition: 안내 추가된 조건 }
 */
export function addTimeGuidanceToPlaces(places, timeCondition) {
  if (!hasTimeCondition(timeCondition)) {
    return { places, timeCondition };
  }

  const enrichedPlaces = places.map(addTimeInfoToPlace);

  return {
    places: enrichedPlaces,
    timeCondition: {
      ...timeCondition,
      userGuidance: timeCondition.userGuidance || TIME_GUIDANCE_TEMPLATES.now
    }
  };
}

/**
 * 시간 조건에 따른 요약 메시지 생성
 *
 * @param {number} placeCount - 검색된 장소 수
 * @param {Object} timeCondition - parseTimeCondition 결과
 * @returns {string} 요약 메시지
 */
export function generateTimeSummary(placeCount, timeCondition) {
  const baseMessage = `검색 결과 ${placeCount}개 장소를 찾았습니다.`;

  if (!hasTimeCondition(timeCondition)) {
    return baseMessage;
  }

  return `${baseMessage} 영업시간은 각 장소의 카카오맵 링크에서 확인해주세요.`;
}

export default {
  TimeConditionSchema,
  DAY_PART_HOURS,
  TIME_CONDITION_KEYWORDS,
  parseTimeCondition,
  hasTimeCondition,
  addTimeInfoToPlace,
  addTimeGuidanceToPlaces,
  generateTimeSummary
};
