import {describe, expect, it} from 'vitest';
import {createOpenRouterOfficialWealthLunaWriterV1, ROUTED_LUNA_MODEL_ID_V1} from './openrouter-official-wealth-luna-writer-v1.js';
import {validateOfficialWealthLunaDraftV1, OFFICIAL_WEALTH_LUNA_READER_VERSION_V1, type OfficialWealthLunaSourceV1} from './official-wealth-luna-reader-v1.js';

const source: OfficialWealthLunaSourceV1={
  version:OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
  readingId:'11111111-1111-4111-8111-111111111111',
  readerCharacterId:'taegyeom',
  sourceHash:'a'.repeat(64),
  chapters:[
    {index:0,title:'창출과 쓰임',excerpts:['결과물을 만들고 실제 사용 여부를 확인하는 것이 중요한 이유입니다.']},
    {index:1,title:'관리와 기준',excerpts:['지출을 구분하고 책임을 정하는 기준이 필요합니다.']},
  ],
  limitations:['금액이나 수익을 예언하지 않습니다.'],
  voice:{register:'단정한 존댓말',sentenceRhythm:'원칙 결과 행동',interpretationStyle:'선택과 책임',prohibited:['예언 금지']},
};
const responseDraft=()=>({chapters:source.chapters.map(chapter=>{
  const sourceAnchor=chapter.excerpts[0]!.slice(0,20);
  const sentence=sourceAnchor+' 지금 무엇을 책임지고 무엇을 조정할지를 구분해야 합니다. 아무 근거 없이 재물운이 좋아질 것이라고 말하지 않겠습니다. 중요한 것은 조건을 실제로 확인하는 태도입니다.';
  return {index:chapter.index,title:chapter.title,sourceAnchor,paragraphs:[sentence,sentence]};
})});
function ports(events:string[]){
  return {
    authority:{async admit():Promise<'authorized'>{events.push('admit');return 'authorized' as const;}},
    durable:{
      async claim(){events.push('claim');return {state:'claimed' as const,reservationId:'r1'};},
      async reserveProviderCost(){events.push('reserve');},
      async commit(input:{usage:{inputTokens:number;outputTokens:number}}){
        events.push('commit');expect(input.usage).toEqual({inputTokens:600,outputTokens:750});
      },
      async fail(){events.push('fail');},
    },
  };
}
describe('Wealth Luna production router',()=>{
  it('sends the pinned model, no fallback, denied provider data collection and exact JSON schema',async()=>{
    const events:string[]=[];
    const writer=createOpenRouterOfficialWealthLunaWriterV1({
      apiKey:'sk-or-v1-local-fixture',
      ...ports(events),
      fetchImpl:async(url,init)=>{
        events.push('transport');
        expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
        const data=JSON.parse(String(init?.body));
        expect(data.model).toBe(ROUTED_LUNA_MODEL_ID_V1);
        expect(data.provider).toEqual({
          allow_fallbacks:false,data_collection:'deny',require_parameters:true,
        });
        expect(data.response_format.type).toBe('json_schema');
        expect(data.response_format.json_schema.strict).toBe(true);
        expect(data.messages).toHaveLength(2);
        expect(JSON.stringify(data)).not.toContain('sk-or-v1-local-fixture');
        return Response.json({
          model:ROUTED_LUNA_MODEL_ID_V1,
          choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(responseDraft())}}],
          usage:{prompt_tokens:600,completion_tokens:750},
        });
      },
    });
    const result=await writer.readOrCreateValidated({
      source,idempotencyKey:'b'.repeat(64),
      validateDraft:(raw)=>validateOfficialWealthLunaDraftV1(source,raw),
    });
    expect(result.chapters).toHaveLength(2);
    expect(events).toEqual(['admit','claim','reserve','transport','commit']);
  });
  it('does not settle or expose an alternate model or missing usage',async()=>{
    for (const invalid of [
      {model:'openai/other',choices:[{finish_reason:'stop',message:{content:JSON.stringify(responseDraft())}}],usage:{prompt_tokens:100,completion_tokens:100}},
      {model:ROUTED_LUNA_MODEL_ID_V1,choices:[{finish_reason:'length',message:{content:JSON.stringify(responseDraft())}}],usage:{prompt_tokens:100,completion_tokens:100}},
      {model:ROUTED_LUNA_MODEL_ID_V1,choices:[{finish_reason:'stop',message:{content:JSON.stringify(responseDraft())}}],usage:null},
    ]) {
      const events:string[]=[];
      const writer=createOpenRouterOfficialWealthLunaWriterV1({
        apiKey:'sk-or-v1-local-fixture',
        ...ports(events),
        fetchImpl:async()=>Response.json(invalid),
      });
      await expect(writer.readOrCreateValidated({
        source,idempotencyKey:'b'.repeat(64),
        validateDraft:(raw)=>validateOfficialWealthLunaDraftV1(source,raw),
      })).rejects.toThrow();
      expect(events).toContain('fail');
      expect(events).not.toContain('commit');
    }
  });
});
