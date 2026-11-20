import { describe, expect, it } from 'vitest';
import { createOpenAiOfficialWealthLunaWriterV1 } from './openai-official-wealth-luna-writer-v1.js';
import {
  OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
  OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
  type OfficialWealthLunaSourceV1,
  validateOfficialWealthLunaDraftV1,
} from './official-wealth-luna-reader-v1.js';

const ID='11111111-1111-4111-8111-111111111111';
const TEXT='결과물을 만든다는 것과 결과물이 실제로 쓰이는 것을 구분할 때 돈의 판단 기준이 달라집니다. 이는 현실적으로 확인할 과제입니다.';
function source():OfficialWealthLunaSourceV1{
  return {
    version:OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
    readingId:ID,readerCharacterId:'taegyeom',sourceHash:'b'.repeat(64),
    chapters:[0,1].map(index=>({
      index,title:index===0?'만드는 가치':'지키는 비용',
      excerpts:[TEXT],
    })),
    limitations:['수익 및 사건 시기를 예측하지 않습니다.'],
    voice:{register:'단단하고 책임 중심의 경계 설정자',
      sentenceRhythm:'원칙과 결과와 행동을 짧고 통제된 순서로 말한다',
      interpretationStyle:'선택과 책임을 분리',prohibited:['투자 결과 예언 금지']},
  };
}
function draft(s:OfficialWealthLunaSourceV1){
  return {chapters:s.chapters.map(chapter=>{
    const sourceAnchor=chapter.excerpts[0]!.slice(0,24);
    const sentence=sourceAnchor+' 그러므로 어떤 상황에서 결과가 달라지는지를 실제 쓰임과 계획에 나누어 확인해야 합니다. 단정이나 장밋빛 전망이 아니라 지금 나타난 조건의 차이를 구분하는 데 집중하겠습니다.';
    return {index:chapter.index,title:chapter.title,sourceAnchor,paragraphs:[sentence,sentence]};
  })};
}
describe('OpenAI GPT-6 Luna Wealth writer',()=>{
  it('requires active authority, idempotent claim, cost reservation and storage before returning text',async()=>{
    const events:string[]=[];
    let sent:unknown;
    const provider=async(_url:RequestInfo | URL, init?:RequestInit):Promise<Response>=>{
      events.push('provider');
      const payload=JSON.parse(String(init?.body));
      sent=payload;
      expect(payload.model).toBe('gpt-6-luna');
      expect(payload.store).toBe(false);
      expect(payload.text.format.type).toBe('json_schema');
      expect(payload.input[1].content[0].text).not.toContain('password');
      return Response.json({
        status:'completed',model:'gpt-6-luna',
        output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(draft(source()))}]}],
        usage:{input_tokens:700,output_tokens:900},
      });
    };
    const writer=createOpenAiOfficialWealthLunaWriterV1({
      apiKey:'test-secret',fetchImpl:provider,
      authority:{async admit(){events.push('authority');return 'authorized';}},
      durable:{
        async claim(){events.push('claim');return {state:'claimed',reservationId:'provider-reservation'};},
        async reserveProviderCost(){events.push('reserve');},
        async commit(input){events.push('commit');expect(input.usage).toEqual({inputTokens:700,outputTokens:900});},
        async fail(){events.push('fail');},
      },
    });
    const s=source();
    const actual=await writer.readOrCreateValidated({
      source:s,idempotencyKey:'a'.repeat(64),
      validateDraft:raw=>validateOfficialWealthLunaDraftV1(s,raw),
    });
    expect(actual.model).toBe(OFFICIAL_WEALTH_LUNA_MODEL_ID_V1);
    expect(actual.chapters).toHaveLength(2);
    expect(events).toEqual(['authority','claim','reserve','provider','commit']);
    expect(sent).toBeDefined();
    const sentPayload=sent as {input:{content:{text:string}[]}[]};
    const admitted=JSON.parse(sentPayload.input[1]!.content[0]!.text) as {sourceAnchors:{index:number;quote:string}[]};
    expect(admitted.sourceAnchors).toEqual([
      {index:0,quote:'결과물을 만든다는 것과 결과물이 실제로 쓰이는 것을 구분할 때 돈의 판단 기준이 달라집니다.'},
      {index:1,quote:'결과물을 만든다는 것과 결과물이 실제로 쓰이는 것을 구분할 때 돈의 판단 기준이 달라집니다.'},
    ]);
  });
  it('refuses to call model when current active publication or grant is held',async()=>{
    let called=false;
    const writer=createOpenAiOfficialWealthLunaWriterV1({
      apiKey:'test-secret',
      authority:{async admit(){return 'held';}},
      durable:{
        async claim(){throw new Error('unreachable');},
        async reserveProviderCost(){throw new Error('unreachable');},
        async commit(){throw new Error('unreachable');},
        async fail(){throw new Error('unreachable');},
      },
      fetchImpl:async()=>{called=true;throw new Error('should not call');},
    });
    await expect(writer.readOrCreateValidated({
      source:source(),idempotencyKey:'a'.repeat(64),
      validateDraft:raw=>validateOfficialWealthLunaDraftV1(source(),raw),
    })).rejects.toThrow('admission held');
    expect(called).toBe(false);
  });
});
