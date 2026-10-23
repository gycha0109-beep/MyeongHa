import { describe, expect, it } from 'vitest';
import { normalizeUiLocale, SUPPORTED_UI_LOCALES, translateStaticUi } from '../ui-i18n.js';

describe('fixed web UI localization', () => {
  it('supports all five fixed UI locales', () => {
    expect(SUPPORTED_UI_LOCALES).toEqual(['ko-KR', 'ja-JP', 'zh-TW', 'en-US', 'zh-CN']);
    expect(normalizeUiLocale('zh-CN')).toBe('zh-CN');
    expect(normalizeUiLocale('ja-JP')).toBe('ja-JP');
  });

  it('uses Korean as the reversible source and maps both translations correctly', () => {
    expect(translateStaticUi('홈', 'ko-KR')).toBe('홈');
    expect(translateStaticUi('홈', 'ja-JP')).toBe('ホーム');
    expect(translateStaticUi('홈', 'zh-TW')).toBe('首頁');
    expect(translateStaticUi('사주', 'ja-JP')).toBe('四柱推命');
    expect(translateStaticUi('사주', 'zh-TW')).toBe('八字命理');
    expect(translateStaticUi('홈', 'en-US')).toBe('Home');
    expect(translateStaticUi('홈', 'zh-CN')).toBe('首页');
  });

  it('leaves non-UI, dynamic text untouched', () => {
    for (const lang of SUPPORTED_UI_LOCALES) {
      expect(translateStaticUi('사용자 상담의 임의 문장', lang)).toBe('사용자 상담의 임의 문장');
      expect(translateStaticUi('1988-01-01 12:30', lang)).toBe('1988-01-01 12:30');
    }
  });
  it('localizes the fixed labels that previously remained Korean in Japanese and Traditional Chinese', () => {
    const labels = [
      '세연', '백헌', '여울', '라현', '태겸', '윤호',
      '선택하지 않음', '남성', '여성', '미지정',
      '출생시간', '출생시간 (24시간제 HH:mm)',
      '과 함께 관상을 봅니다.', '에게 관상 보기',
      '현재 웹 대화는 회원 계정에서 시작할 수 있습니다.',
      '로그인', '회원가입', '이메일', '비밀번호',
      '프리뷰 확인', '지금의 길, 더 나은 길로',
      '흐르는 기회를 잡는 법',
    ];
    for (const source of labels) {
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        const text = translateStaticUi(source, locale);
        expect(text, `Missing ${locale}: ${source}`).not.toBe(source);
        expect(/[가-힣]/u.test(text), `Korean leaked to ${locale}: ${source}`).toBe(false);
      }
    }
  });

  it('does not change form option values or external user content', () => {
    for (const locale of SUPPORTED_UI_LOCALES) {
      expect(translateStaticUi('male', locale)).toBe('male');
      expect(translateStaticUi('female', locale)).toBe('female');
      expect(translateStaticUi('00:35', locale)).toBe('00:35');
      expect(translateStaticUi('고객이 자유롭게 입력한 개인적인 한국어 대화', locale)).toBe('고객이 자유롭게 입력한 개인적인 한국어 대화');
    }
  });

  it('localizes offline chat connection errors and status labels', () => {
    for (const source of [
      '현재 대화 기록 연결을 사용할 수 없습니다.',
      '대화방을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      '대화를 불러오지 못했습니다.',
      '로그인 상태가 만료되었습니다. 다시 로그인해 주세요.',
      '현재 이 대화는 서버 연결이 준비되지 않았습니다. 입력한 내용은 보내지지 않았습니다.',
    ]) {
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        expect(translateStaticUi(source, locale)).not.toBe(source);
        expect(translateStaticUi(source, locale)).not.toMatch(/[가-힣]/u);
      }
    }
  });

});
