import { describe, it, expect } from 'vitest';
import {sajuPillarLabelV1,sajuElementLabelV1,sajuYinYangLabelV1,projectSajuPillarDisplayV1,sajuCompletenessLabelV1,sajuCurrentYearLabelV1} from '../saju-calculation-locale.js';

const resolved=Object.freeze({status:'resolved',value:Object.freeze({
 stem:Object.freeze({value:'갑',hanja:'甲',element:'목',yinYang:'양'}),
 branch:Object.freeze({value:'자',hanja:'子',element:'수',yinYang:'음'}),
})});
describe('source-preserving Saju calculation locale presentation',()=>{
 it('renders the identical resolved pillar with localized labels, not a new calculation',()=>{
  expect(projectSajuPillarDisplayV1(resolved,'ko-KR')).toEqual({characters:'甲子',text:'갑자',meta:'목 · 수'});
  expect(projectSajuPillarDisplayV1(resolved,'ja-JP')).toEqual({characters:'甲子',text:'甲子',meta:'木 · 水'});
  expect(projectSajuPillarDisplayV1(resolved,'zh-TW')).toEqual({characters:'甲子',text:'甲子',meta:'木 · 水'});
  expect(resolved.value.stem.value).toBe('갑');
 });
 it('leaves uncertain/incomplete fact boundaries intact in all languages',()=>{
  expect(projectSajuPillarDisplayV1({status:'ambiguous'},'ja-JP')).toEqual({characters:'◇',text:'複数候補',meta:'境界時刻の確認が必要'});
  expect(projectSajuPillarDisplayV1({status:'ambiguous'},'zh-TW')).toEqual({characters:'◇',text:'多個候選',meta:'需要確認臨界時間'});
  expect(projectSajuPillarDisplayV1({status:'unresolved',reasonCode:'NO_BIRTH_TIME'},'zh-TW')).toEqual({characters:'—',text:'無法確認',meta:'NO_BIRTH_TIME'});
 });
 it('localizes the fixed labels while retaining number and semantic keys',()=>{
  expect(sajuPillarLabelV1('year','ko-KR')).toBe('년주');
  expect(sajuPillarLabelV1('month','ja-JP')).toBe('月柱');
  expect(sajuPillarLabelV1('hour','zh-TW')).toBe('時柱');
  expect(sajuPillarLabelV1('__proto__','ja-JP')).toBeNull();
  expect(sajuElementLabelV1('화','zh-TW')).toBe('火');
  expect(sajuYinYangLabelV1('음','ja-JP')).toBe('陰');
  expect(sajuCompletenessLabelV1(3,false,'ja-JP')).toBe('四柱のうち3柱が確定');
  expect(sajuCurrentYearLabelV1(2026,'zh-TW')).toBe('2026年 · 今年的運勢走向');
 });
});
