import {describe,expect,it} from 'vitest';
import {
  buildNotionWealthSixChapterLunaSourceV1,
} from './official-wealth-luna-product-source-v1.js';
import type {OfficialReadingRecordV1} from './official-reading-record-read.js';
import type {WealthProductChapterPlacementDecisionV1} from '../../../packages/domain/src/saju-wealth-chapter-placement-v1.js';
import {getSajuProductChapterBlueprintV1} from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';

const ID='11111111-1111-4111-8111-111111111111';
function record():OfficialReadingRecordV1{
  return {
    approvedComponent:'wealth',readingId:ID,
    readingSessionId:'22222222-2222-4222-8222-222222222222',
    sajuDomain:'wealth',productResponseState:'delivered',
    readingContractVersion:'myeonghwa-product-reading-response-v2',
    readerCharacterIds:['taegyeom'],completedAt:'2026-11-19T00:00:00Z',
    birthRevision:{issuedRevisionNo:1,currentRevisionNo:1,state:'current'},
    reading:{state:'delivered',reading:{readingId:ID,sections:[
      {sectionType:'wealth',title:'승인된 재물 관점',state:'complete',
        blocks:[{type:'paragraph',text:'개인의 명식과 기존 명리 해석에 따른 근거 문장입니다.'}]},
      {sectionType:'wealth',title:'관리 관점',state:'complete',
        blocks:[{type:'paragraph',text:'기존 명리 해석에서 조건으로 선정된 내용입니다.'}]},
      {sectionType:'structure',title:'해석 범위',state:'complete',
        blocks:[{type:'paragraph',text:'실제 수입·미래 재산을 예측하지 않습니다.'}]},
    ]}},
  };
}
const refs=['a','b','c','d','e','f'];
function placement():WealthProductChapterPlacementDecisionV1{
  return {
    version:'myeongha-saju-wealth-source-owned-chapter-placement-v1',
    state:'ready',readingRef:ID,
    characterId:'taegyeom',sourceResponseHash:'a'.repeat(64),
    groundingHash:'b'.repeat(64),planId:'source-selected-plan',
    missingChapterIds:[],
    chapters:getSajuProductChapterBlueprintV1('wealth').map((chapter,index)=>({
      chapterId:chapter.chapterId,fixedTitle:chapter.fixedTitle,
      role:chapter.purpose,status:'grounded',
      primaryUnitIds:['approved-'+refs[index]],
      supportingUnitIds:[],tensionUnitIds:[],
      requiredDisclosureRefs:index===3?['mandatory-caution']:[],
      evidence:[{
        unitId:'approved-'+refs[index],canonicalMeaning:'위치와 구조가 검증된 승인된 재물 해석 '+index,
        semanticKey:'wealth-confirmed-'+index,axis:'wealth',
        sourceBlockRefs:['sections.'+index+'.blocks.0'],
        qualifiers:index===3?['명식의 실제 작동 조건을 확인해야 합니다.']:[],
        prohibitedExtensions:['미래 금전 사건을 단정하지 않습니다.'],
        requiredCompanionUnitRefs:[],
      }],
    })),
  };
}
function input(){
 const valid=placement();
 return {
  issued:record(),placement:valid,
  verifiedBinding:{issuedReadingId:ID,issuedResponseHash:'sha256:v1:'+valid.sourceResponseHash,
    canonicalGroundingHash:valid.groundingHash,
    nativeSourceResponseHash:'c'.repeat(64),nativeExecutionAttemptId:'native-exec-proof-1'},
  requiredProtectedDisclosures:{'mandatory-caution':'해당 조건은 확정된 미래 사건을 뜻하지 않습니다.'},
 };
}
describe('Approved 6-chapter Luna wealth authoring source',()=>{
 it('carries exactly six Notion titles and source-unit evidence, not generic made-up chapters',()=>{
  const actual=buildNotionWealthSixChapterLunaSourceV1(input());
  expect(actual?.chapters).toHaveLength(6);
  expect(actual?.chapters.map(c=>c.title)).toEqual(
    getSajuProductChapterBlueprintV1('wealth').map(c=>c.fixedTitle));
  expect(actual?.chapters[0]?.excerpts[0]).toContain('승인 의미 [approved-a]');
  expect(actual?.chapters[3]?.excerpts[0]).toContain('근거 블록: sections.3.blocks.0');
  expect(actual?.chapters[3]?.excerpts[0]).toContain('적용 조건');
  expect(actual?.limitations).toContain('해당 조건은 확정된 미래 사건을 뜻하지 않습니다.');
  expect(actual?.sourceHash).toMatch(/^[0-9a-f]{64}$/u);
 });
 it('blocks partial coverage, altered titles, forged source binding and missing disclosures',()=>{
  const p=input();
  expect(buildNotionWealthSixChapterLunaSourceV1({...p,placement:{...p.placement,state:'held_insufficient_evidence'}})).toBeNull();
  const broken=[...p.placement.chapters];
  broken[2]={...broken[2]!,fixedTitle:'일반적인 예산 관리'};
  expect(buildNotionWealthSixChapterLunaSourceV1({...p,placement:{...p.placement,chapters:broken}})).toBeNull();
  expect(()=>buildNotionWealthSixChapterLunaSourceV1({...p,verifiedBinding:{...p.verifiedBinding,canonicalGroundingHash:'c'.repeat(64)}})).toThrow('origin');
  expect(()=>buildNotionWealthSixChapterLunaSourceV1({...p,requiredProtectedDisclosures:{}})).toThrow('disclosure');
  expect(()=>buildNotionWealthSixChapterLunaSourceV1({...p,verifiedBinding:{...p.verifiedBinding,issuedResponseHash:'sha256:v1:'+'0'.repeat(64)}})).toThrow('origin');

 });
});
