import { describe, expect, it } from 'vitest';

import {
  findReadingPublicTrustLanguageViolationV1,
} from './reading-public-trust-language-policy-v1.js';

describe('reading public trust language policy v1', () => {
  it.each([
    ['사진 한 장만으로 성격을 확정할 수 없어요.', 'single_image_meta_disclaimer'],
    ['성격을 확정할 수 없습니다.', 'cannot_confirm_meta_disclaimer'],
    ['이 흐름을 단정할 수 없어요.', 'cannot_conclude_meta_disclaimer'],
    ['결과를 보장할 수 없습니다.', 'cannot_guarantee_meta_disclaimer'],
    ['참고용으로만 봐주세요.', 'reference_only_meta_disclaimer'],
    ['재미로만 봐주세요.', 'entertainment_only_meta_disclaimer'],
    ['맹신하지 마세요.', 'blind_faith_meta_disclaimer'],
    ['과학적으로 증명된 것은 아닙니다.', 'scientific_meta_disclaimer'],
    ['정확하지 않을 수 있습니다.', 'accuracy_meta_disclaimer'],
    ['실제와 다를 수 있습니다.', 'reality_mismatch_meta_disclaimer'],
  ] as const)('blocks trust-eroding meta disclaimer: %s', (text, ruleKey) => {
    expect(findReadingPublicTrustLanguageViolationV1(text)?.ruleKey).toBe(ruleKey);
  });

  it.each([
    '수염에 가려 턱선은 이번 해석에서 제외할게요.',
    '출생 시각 후보가 둘이라 시기 흐름도 두 갈래로 봅니다.',
    '이 부분은 두 흐름이 함께 열려 있어요.',
    '코와 얼굴 중심부의 흐름부터 보겠습니다.',
  ])('allows concrete source-bound limitation or interpretation language: %s', (text) => {
    expect(findReadingPublicTrustLanguageViolationV1(text)).toBeNull();
  });
});
