import { describe, expect, it } from 'vitest';
import type { BirthInputV1 } from '../packages/api-client/src/birth.js';
import { MOBILE_SAJU_BIRTH_FIELDS_V1, mobileSajuBirthLabelV1, projectMobileSajuBirthFactsV1 } from '../apps/mobile/src/features/saju/mobile-saju-birth-display.js';

const source: BirthInputV1 = {
  birthDate: '1996-01-09',
  birthTime: '09:30', timeKnown: true,
  calendarType: 'solar', isLeapMonth: false, sex: 'male',
};

describe('native Saju birth facts presentation', () => {
  it('renders all five supported locales without rewriting the server-owned input', () => {
    const original = JSON.stringify(source);
    expect(MOBILE_SAJU_BIRTH_FIELDS_V1).toEqual(['date','time','sex','place','basis']);
    expect(mobileSajuBirthLabelV1('heading','en-US')).toBe('Entered information');
    expect(projectMobileSajuBirthFactsV1(source,'ko-KR')).toMatchObject({
      date:'1996년 1월 9일', time:'오전 9시 30분', sex:'남성', place:'제공되지 않음',
      basis:'양력 · 서버 계산 기준',
    });
    expect(projectMobileSajuBirthFactsV1(source,'ja-JP')).toMatchObject({
      date:'1996年1月9日', time:'9:30', sex:'男性', basis:'新暦 · サーバー計算基準',
    });
    expect(projectMobileSajuBirthFactsV1(source,'zh-TW')).toMatchObject({
      date:'1996年1月9日', time:'9:30', sex:'男性', basis:'國曆 · 伺服器計算基準',
    });
    expect(projectMobileSajuBirthFactsV1(source,'en-US')).toMatchObject({
      date:'January 9, 1996', time:'9:30 AM', sex:'Male', place:'Not provided',
      basis:'Solar · Server-calculated',
    });
    expect(projectMobileSajuBirthFactsV1(source,'zh-CN')).toMatchObject({
      date:'1996年1月9日', time:'09:30', sex:'男性', place:'未提供',
      basis:'公历 · 服务器计算基准',
    });
    expect(JSON.stringify(source)).toBe(original);
  });

  it('does not run lunar dates through a Gregorian converter and preserves leap month and missing time', () => {
    const lunar: BirthInputV1 = {
      ...source, birthDate:'2025-06-29', calendarType:'lunar', isLeapMonth:true,
      birthTime:null, timeKnown:false, sex:'unspecified',
    };
    expect(projectMobileSajuBirthFactsV1(lunar,'en-US')).toMatchObject({
      date:'June 29, 2025', time:'Unknown time', sex:'Not specified',
      basis:'Lunar · Leap month · Server-calculated',
    });
    expect(projectMobileSajuBirthFactsV1(lunar,'zh-CN')).toMatchObject({
      date:'2025年6月29日', time:'时间不详', basis:'农历 · 闰月 · 服务器计算基准',
    });
  });

  it('shows 12 AM / 12 PM correctly and uses unknown fallbacks for malformed facts', () => {
    expect(projectMobileSajuBirthFactsV1({...source,birthTime:'00:05'},'en-US').time).toBe('12:05 AM');
    expect(projectMobileSajuBirthFactsV1({...source,birthTime:'12:00'},'en-US').time).toBe('12:00 PM');
    expect(projectMobileSajuBirthFactsV1({...source,birthTime:'25:60'},'zh-CN').time).toBe('无法确认');
    expect(projectMobileSajuBirthFactsV1({...source,birthDate:'invalid'},'en-US').date).toBe('Cannot verify');
  });
});
