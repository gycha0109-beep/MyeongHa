import { describe, expect, it } from 'vitest';
import {getSajuProductChapterBlueprintV1} from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import {
  buildOfficialWealthLunaSourceV1,
  createOfficialWealthLunaSupplementV1,
  validateOfficialWealthLunaDraftV1,
  OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
} from './official-wealth-luna-reader-v1.js';

const ID='11111111-1111-4111-8111-111111111111';
function report():OfficialReadingRecordV1 {
  return {
    approvedComponent:'wealth',readingId:ID,readingSessionId:'22222222-2222-4222-8222-222222222222',
    sajuDomain:'wealth',productResponseState:'delivered',
    readingContractVersion:'myeonghwa-product-reading-response-v2',
    readerCharacterIds:['taegyeom'],completedAt:'2026-11-19T00:00:00Z',
    birthRevision:{issuedRevisionNo:1,currentRevisionNo:1,state:'current'},
    reading:{state:'delivered',reading:{
      readingId:ID,sections:[
        {title:'가치가 만들어지는 방식',sectionType:'wealth',state:'complete',blocks:[
          {type:'paragraph',text:'실제 결과물을 만들고 그 쓰임을 확인하는 과정이 가치의 판단 기준이 됩니다. 지출보다 결과를 구별합니다.'},
        ]},
        {title:'돈을 관리하는 기준',sectionType:'wealth',state:'complete',blocks:[
          {type:'paragraph',text:'지켜야 할 비용과 유연하게 결정할 비용을 분리할 때 자원 관리의 책임이 명료해집니다. 무리한 미래 예측은 하지 않습니다.'},
        ]},
        {title:'해석 범위',sectionType:'structure',state:'complete',blocks:[
          {type:'paragraph',text:'실제 수익이나 미래 재물 사건을 예측하지 않습니다.'},
        ]},
      ],
    }},
  };
}
function draft(source:NonNullable<ReturnType<typeof buildOfficialWealthLunaSourceV1>>) {
  return {chapters:source.chapters.map(chapter=>{
    const sourceAnchor=chapter.excerpts[0]!.slice(0,32);
    const sentence=sourceAnchor+' 이를 살필 때에는 어떤 선택이 이미 확인된 사실인지부터 구분합니다. 준비의 기간과 실제 결과물이 나오는 기간은 다를 수 있으므로, 현재 드러난 근거에서만 구체적인 판단을 이어 갑니다.';
    return {index:chapter.index,title:chapter.title,sourceAnchor,paragraphs:[sentence,sentence+' 선택이 만들어 내는 결과는 매번 돌아보되, 확인되지 않은 수익이나 사건을 약속하지 않습니다.']};
  })};
}

describe('owner-authorized Luna wealth supplement',()=>{
  it('builds source only for issued owned Taegyeom wealth records and keeps signed source unchanged',()=>{
    const original=report();
    const old=JSON.stringify(original.reading);
    const source=buildOfficialWealthLunaSourceV1(original);
    expect(source?.readerCharacterId).toBe('taegyeom');
    expect(source?.chapters).toHaveLength(2);
    expect(source?.limitations).toHaveLength(1);
    expect(source?.voice.sentenceRhythm).toContain('순서');
    expect(JSON.stringify(original.reading)).toBe(old);
    expect(buildOfficialWealthLunaSourceV1({...original,readerCharacterIds:['rahyeon']})).toBeNull();
    expect(buildOfficialWealthLunaSourceV1({...original,approvedComponent:'career'})).toBeNull();
    expect(buildOfficialWealthLunaSourceV1({...original,productResponseState:'delivered_with_fallback'})).toBeNull();
  });
  it('rejects invented money predictions, changed chapter identity and source-less drafts',()=>{
    const source=buildOfficialWealthLunaSourceV1(report())!;
    expect(validateOfficialWealthLunaDraftV1(source,draft(source)).chapters).toHaveLength(2);
    const bad=draft(source);
    bad.chapters[0]!.title='다른 사람의 분석';
    expect(()=>validateOfficialWealthLunaDraftV1(source,bad)).toThrow();
    const prediction=draft(source);
    prediction.chapters[0]!.paragraphs[0] += ' 내년 반드시 부자가 됩니다.';
    expect(()=>validateOfficialWealthLunaDraftV1(source,prediction)).toThrow();
    const missing=draft(source);
    missing.chapters[0]!.sourceAnchor='확인되지 않은 임의 해석';
    expect(()=>validateOfficialWealthLunaDraftV1(source,missing)).toThrow();
  });
  it('keeps six-chapter Taegyeom prose concise and citation-free, while preserving exact source anchors',()=>{
    const blueprint=getSajuProductChapterBlueprintV1('wealth');
    const original=buildOfficialWealthLunaSourceV1(report())!;
    const source={
      ...original,
      chapters:blueprint.map((chapter,index)=>({
        index,title:chapter.fixedTitle,
        excerpts:['승인 의미 [unit-'+index+']\\n각기 다른 승인 근거 '+index+
          '번은 개인의 책임과 선택의 경계를 분명히 읽게 합니다. 실제 재물의 규모는 알려주지 않습니다.'],
      })),
    };
    const output={
      chapters:source.chapters.map(chapter=>({
        index:chapter.index,title:chapter.title,
        sourceAnchor:'각기 다른 승인 근거 '+chapter.index+
          '번은 개인의 책임과 선택의 경계를 분명히 읽게 합니다.',
        paragraphs:[
          '먼저 중요한 것은 선택에 따르는 책임을 구분하는 일입니다. 감당할 수 있는 범위까지는 당신의 선택이지만, 결과를 미리 약속할 수는 없습니다.',
          '각 선택에는 서로 다른 조건이 붙습니다. 명리에서 읽힌 책임과 선택의 관계를 따져 봐야 할 때입니다. 눈에 보이는 결과와 감당할 무게를 혼동할 필요는 없습니다.',
          '결정은 당신이 합니다. 저는 구분해야 할 선만 짚겠습니다. 필요한 것과 원하는 것을 나누면 판단이 조금 더 명확해질 수 있습니다.',
        ].map(line=>line+' 지금은 '+(chapter.index+1)+'번 질문의 구분을 놓치지 마십시오.'),
      })),
    };
    expect(validateOfficialWealthLunaDraftV1(source,output).chapters).toHaveLength(6);
    output.chapters[0]!.paragraphs[0]='이 명식에서 재물의 흐름을 다시 살펴보겠습니다. '+output.chapters[0]!.paragraphs[0];
    expect(()=>validateOfficialWealthLunaDraftV1(source,output)).toThrow('research audit');
    output.chapters[0]!.paragraphs[0]=output.chapters[1]!.paragraphs[0]!;
    output.chapters[0]!.paragraphs[1]='이 장의 핵심은 재물을 위한 예산을 따로 만드는 것입니다. '+output.chapters[0]!.paragraphs[1];
    expect(()=>validateOfficialWealthLunaDraftV1(source,output)).toThrow('research audit');
  });
  it('delegates only admitted source to idempotent server writer and rechecks draft',async()=>{
    let called=0;
    const original=report();
    const result=await createOfficialWealthLunaSupplementV1(original,{
      model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
      async readOrCreateValidated({source,idempotencyKey,validateDraft}){
        called++;
        expect(source.readingId).toBe(ID);
        expect(idempotencyKey).toMatch(/^[a-f0-9]{64}$/u);
        return validateDraft(draft(source));
      },
    });
    expect(result?.chapters).toHaveLength(2);
    expect(result?.originalReadingUnchanged).toBe(true);
    expect(called).toBe(1);
    expect(await createOfficialWealthLunaSupplementV1({...original,sajuDomain:'career'},{
      model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
      async readOrCreateValidated(){called++;throw Error('must not run');},
    })).toBeNull();
    expect(called).toBe(1);
  });
});
