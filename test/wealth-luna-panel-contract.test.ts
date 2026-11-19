import { describe, expect, it } from 'vitest';
import { parseVerifiedWealthLunaNarrationV1 } from '../apps/web/wealth-luna-panel.js';

const ID='11111111-1111-4111-8111-111111111111';
const ANCHOR='기존 공식 사주에 실제 표시된 긴 판단 근거 문장';
const SENTENCE=ANCHOR+' 이 문장에 포함된 관찰을 바탕으로 지금 선택할 수 있는 경계와 앞으로 확인해야 할 변수를 구분합니다. 그 구별이 먼저 이루어져야 불필요한 단정을 줄일 수 있고, 각 상황을 독립적으로 판단할 수 있습니다.';
const data={
 version:'myeongha-official-wealth-luna-reader-v1',
 readingId:ID,
 sourceHash:'a'.repeat(64),
 model:'gpt-6-luna',
 renderer:'source_bound_model_supplement',
 originalReadingUnchanged:true,
 chapters:[
  {index:0,title:'선택을 만드는 자원',sourceAnchor:ANCHOR,paragraphs:[SENTENCE,SENTENCE]},
  {index:1,title:'관리의 기준',sourceAnchor:ANCHOR,paragraphs:[SENTENCE,SENTENCE]},
 ],
};
describe('Luna official Reading browser contract',()=>{
 it('accepts only bounded, explicitly separate original-preserving narratives',()=>{
  const accepted=parseVerifiedWealthLunaNarrationV1(data,ID);
  expect(accepted.chapters).toHaveLength(2);
  expect(accepted.readingId).toBe(ID);
  expect(accepted.chapters[0]?.paragraphs[0]).toContain(ANCHOR);
 });
 it('refuses cross-reading, unsigned-form, and malformed chapter responses',()=>{
  expect(()=>parseVerifiedWealthLunaNarrationV1(data,'22222222-2222-4222-8222-222222222222')).toThrow();
  expect(()=>parseVerifiedWealthLunaNarrationV1({...data,originalReadingUnchanged:false},ID)).toThrow();
  expect(()=>parseVerifiedWealthLunaNarrationV1({...data,sourceHash:'wrong'},ID)).toThrow();
  expect(()=>parseVerifiedWealthLunaNarrationV1({...data,chapters:[data.chapters[0]]},ID)).toThrow();
  expect(()=>parseVerifiedWealthLunaNarrationV1({...data,chapters:[
   {...data.chapters[0],paragraphs:['공식 근거와 무관한 짧은 내용']},data.chapters[1],
  ]},ID)).toThrow();
 });
});
