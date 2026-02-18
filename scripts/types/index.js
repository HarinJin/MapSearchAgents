/**
 * 타입 정의 모듈 인덱스
 *
 * @module types
 */

export * from './place.js';
export * from './enrichment.js';

// 기본 내보내기
import place from './place.js';
import enrichment from './enrichment.js';

export default {
  ...place,
  ...enrichment
};
