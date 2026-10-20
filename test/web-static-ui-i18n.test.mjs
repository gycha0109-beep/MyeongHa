import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeUiLocale, SUPPORTED_UI_LOCALES, translateStaticUi } from '../apps/web/ui-i18n.js';

test('exact supported UI locales, no accidental simplified Chinese fallback', () => {
  assert.deepEqual(SUPPORTED_UI_LOCALES, ['ko-KR', 'ja-JP', 'zh-TW']);
  assert.equal(normalizeUiLocale('zh-CN'), 'ko-KR');
  assert.equal(normalizeUiLocale('ja-JP'), 'ja-JP');
});
test('static UI translations are reversible by Korean source', () => {
  assert.equal(translateStaticUi('홈', 'ja-JP'), 'ホーム');
  assert.equal(translateStaticUi('홈', 'zh-TW'), '首頁');
  assert.equal(translateStaticUi('홈', 'ko-KR'), '홈');
  assert.equal(translateStaticUi('사주', 'ja-JP'), '四柱推命');
});
test('unknown or dynamic text remains unchanged in every locale', () => {
  for (const lang of SUPPORTED_UI_LOCALES) {
    assert.equal(translateStaticUi('사용자 상담의 임의 문장', lang), '사용자 상담의 임의 문장');
    assert.equal(translateStaticUi('1988-01-01 12:30', lang), '1988-01-01 12:30');
  }
});
