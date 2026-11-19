import type {
  AuthorizedOfficialWealthLunaWriterPortV1,
  OfficialWealthLunaSourceV1,
} from './official-wealth-luna-reader-v1.js';
import {
  OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
} from './official-wealth-luna-reader-v1.js';
import { getSajuProductChapterBlueprintV1 } from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';

const API_URL='https://api.openai.com/v1/responses';
const SCHEMA={
  type:'object',
  additionalProperties:false,
  properties:{
    chapters:{
      type:'array',
      items:{
        type:'object',
        additionalProperties:false,
        properties:{
          index:{type:'integer'},
          title:{type:'string'},
          sourceAnchor:{type:'string'},
          paragraphs:{type:'array',items:{type:'string'}},
        },
        required:['index','title','sourceAnchor','paragraphs'],
      },
    },
  },
  required:['chapters'],
} as const;

export interface OfficialWealthLunaDispatchAuthorityV1 {
  /** Source and DB owner must prove the exact published Character content,
   * current purchase grant and allowed model before returning. */
  admit(input:Readonly<{
    readingId:string;
    sourceHash:string;
    readerCharacterId:'taegyeom';
    model:typeof OFFICIAL_WEALTH_LUNA_MODEL_ID_V1;
  }>):Promise<'authorized'|'held'>;
}
export interface OfficialWealthLunaDurablePortV1 {
  /** Atomically reserve an idempotent request or return the earlier draft.
   * Duplicate concurrent requests MUST return 'in_flight', not re-dispatch. */
  claim(input:Readonly<{key:string;readingId:string;sourceHash:string}>):Promise<
    | Readonly<{state:'claimed';reservationId:string}>
    | Readonly<{state:'existing';draft:unknown}>
    | Readonly<{state:'in_flight'}>>;
  /** Bind a permitted actual cost reservation to the exact claim before dispatch. */
  reserveProviderCost(input:Readonly<{
    reservationId:string;model:typeof OFFICIAL_WEALTH_LUNA_MODEL_ID_V1;
    maxOutputTokens:number;
  }>):Promise<void>;
  /** Settled usage and draft must be recorded together before success.
   * commit MUST enforce the same grant, reading, source and reservation. */
  commit(input:Readonly<{
    reservationId:string;
    draft:unknown;
    usage:Readonly<{inputTokens:number;outputTokens:number}>;
    model:typeof OFFICIAL_WEALTH_LUNA_MODEL_ID_V1;
  }>):Promise<void>;
  fail(input:Readonly<{reservationId:string;reason:'provider_or_validation_failed'}>):Promise<void>;
}
export interface OpenAiOfficialWealthLunaWriterConfigV1 {
  readonly apiKey:string;
  readonly authority:OfficialWealthLunaDispatchAuthorityV1;
  readonly durable:OfficialWealthLunaDurablePortV1;
  readonly fetchImpl?:typeof fetch;
  readonly maxOutputTokens?:number;
}

function requireStrictUsage(raw:unknown):Readonly<{inputTokens:number;outputTokens:number}>{
  if(typeof raw!=='object'||raw===null||Array.isArray(raw)) throw new Error('Luna usage is unavailable');
  const data=raw as Record<string,unknown>;
  const inputTokens=data.input_tokens,outputTokens=data.output_tokens;
  if(typeof inputTokens!=='number'||!Number.isSafeInteger(inputTokens)||inputTokens<0||
     typeof outputTokens!=='number'||!Number.isSafeInteger(outputTokens)||outputTokens<0) {
    throw new Error('Luna usage cannot be settled');
  }
  return {inputTokens,outputTokens};
}
function readDraft(body:unknown):unknown{
  if(typeof body!=='object'||body===null||Array.isArray(body)) throw new Error('Luna response is malformed');
  const data=body as Record<string,unknown>;
  if(data.status!=='completed'||data.model!==OFFICIAL_WEALTH_LUNA_MODEL_ID_V1||
     !Array.isArray(data.output)) throw new Error('Luna response is not completed');
  const texts:string[]=[];
  for(const item of data.output){
    if(!item||typeof item!=='object'||item.type!=='message'||!Array.isArray(item.content))continue;
    for(const content of item.content){
      if(content?.type==='refusal') throw new Error('Luna response refused');
      if(content?.type==='output_text'&&typeof content.text==='string')texts.push(content.text);
    }
  }
  if(texts.length!==1)throw new Error('Luna structured output must be one object');
  return JSON.parse(texts[0]!);
}
function instructions(source:OfficialWealthLunaSourceV1):string {
  const isSixChapterProduct=source.chapters.length===6 &&
    source.chapters.every((chapter,index)=>chapter.title===
      getSajuProductChapterBlueprintV1('wealth')[index]?.fixedTitle);
  return [
    '당신은 명하의 태겸이지만, 서명된 사주 해석을 수정하지 않는 별도 보충 서술자입니다.',
    '출력은 제공된 JSON Schema와 정확히 일치하는 하나의 객체만 생성합니다.',
    '태겸의 실제 승인 저작 방향: '+source.voice.register+' / '+source.voice.sentenceRhythm,
    '해석 태도: '+source.voice.interpretationStyle,
    isSixChapterProduct
      ? '이 입력은 유료 재물운 6장 원고의 후보입니다. 반드시 각 장을 3~5개의 서로 다른 문단으로 집필하고 각 문단을 140~1300자로 쓰십시오. 본문을 늘리려고 일반적인 예산·재테크 조언을 반복하지 마십시오.'
      : '각 챕터는 서술 2~4문단, 문단당 80~1300자이며, 한 챕터의 관찰 → 현실의 장면 → 판단과 구별을 연결합니다.',
    ...(isSixChapterProduct ? [
      '각 장은 전달받은 승인 의미 [unitId]와 근거 블록이 전제입니다. 반드시 개별 canonicalMeaning의 구체적 논리와 조건을 독자 언어로 풀고, 추가로 실제 경험이나 새 명리 구조를 만들어내지 마십시오.',
      '각 장마다 다른 질문에 답하십시오. 1장은 재물의 기본 구조, 2장은 산출·교환, 3장은 벌기와 관리의 차이, 4장은 승인된 긴장·제약, 5장은 여러 승인 의미를 엮은 특별한 조건, 6장은 앞서 확인한 상반된 선택 기준의 종합입니다.',
      '실생활 사례는 장의 실제 승인 의미가 허용하는 경우에만 제시하는 가상 장면입니다. 설명용 장면이 실제 고객에게 있었다고 말하지 마십시오.',
      'sourceAnchor는 본문에 그대로 인용할 승인 의미 문장의 연속된 20자 이상이어야 합니다. source ID나 근거 블록 이름 자체를 sourceAnchor로 쓰면 거부됩니다.',
      '각 장의 맨 첫 문단에 그 장에서만 도출되는 핵심 판단과 근거를 제시하십시오. 다른 챕터에서 같은 판단을 반복하지 마십시오.',
      '주어진 의미가 평범한 조언만 뒷받침한다면 억지로 심오한 운명론을 만들지 마십시오. 검증에서 불합격될 수 있습니다.',
    ] : []),
    '각 챕터의 index와 title을 정확히 유지합니다. sourceAnchor는 그 장 excerpts에서 실제 존재하는 연속 원문 문자열이어야 하고, 그 앵커를 문단 하나에 그대로 한 번 포함합니다.',
    '그 장에 없는 근거나 다른 장의 문장을 원인으로 끌어오지 마십시오. 명식 계산, 시기, 수익, 투자 추천, 재산 규모를 새로 만들지 마십시오.',
    '상대에게 권위를 강요하지 않고, 명리적 가능성과 실제 재정 상황을 사실로 혼동하지 마십시오.',
    '원문 문장과 같은 표현만 반복하지 말고, 제공된 근거 안에서 상황을 더 생생하고 구체적으로 풀어냅니다.',
    '기존 공식 보고서 원문은 불변입니다. 이 보충 해설 자체를 공식 원문인 것처럼 설명하지 마십시오.',
    ...source.voice.prohibited,
  ].join('\n');
}

export function createOpenAiOfficialWealthLunaWriterV1(
  config:OpenAiOfficialWealthLunaWriterConfigV1,
):AuthorizedOfficialWealthLunaWriterPortV1 {
  if(!config.apiKey||!config.apiKey.trim()||typeof config.authority?.admit!=='function'||
      typeof config.durable?.claim!=='function'||typeof config.durable?.reserveProviderCost!=='function'||
      typeof config.durable?.commit!=='function'||typeof config.durable?.fail!=='function'){
    throw new TypeError('Luna production writer requires credential, owner authority and durable cost ports');
  }
  const maxOutputTokens=config.maxOutputTokens??7400;
  if(!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1000||maxOutputTokens>12000){
    throw new TypeError('Invalid Luna output budget');
  }
  const send=config.fetchImpl??fetch;
  return Object.freeze({
    model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
    async readOrCreateValidated(input: Parameters<AuthorizedOfficialWealthLunaWriterPortV1['readOrCreateValidated']>[0]){
      const decision=await config.authority.admit({
        readingId:input.source.readingId,sourceHash:input.source.sourceHash,
        readerCharacterId:'taegyeom',model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
      });
      if(decision!=='authorized')throw new Error('Published Taegyeom/grant admission held');
      const claim=await config.durable.claim({
        key:input.idempotencyKey,readingId:input.source.readingId,
        sourceHash:input.source.sourceHash,
      });
      if(claim.state==='in_flight')throw new Error('Luna write already in progress');
      if(claim.state==='existing')return input.validateDraft(claim.draft);
      if(claim.state!=='claimed'||!claim.reservationId)throw new Error('Luna reservation denied');
      try {
        await config.durable.reserveProviderCost({
          reservationId:claim.reservationId,model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
          maxOutputTokens,
        });
        const response=await send(API_URL,{
          method:'POST',
          headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},
          body:JSON.stringify({
            model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
            store:false,
            reasoning:{effort:'medium'},
            max_output_tokens:maxOutputTokens,
            text:{verbosity:'high',format:{
              type:'json_schema',name:'myeongha_wealth_luna_chapters_v1',
              strict:true,schema:SCHEMA,
            }},
            input:[
              {role:'developer',content:[{type:'input_text',text:instructions(input.source)}]},
              {role:'user',content:[{type:'input_text',text:JSON.stringify({
                kind:'verified_official_wealth_source',
                sourceHash:input.source.sourceHash,chapters:input.source.chapters,
                limitations:input.source.limitations,
              })}]},
            ],
          }),
          redirect:'error',
          signal:AbortSignal.timeout(90000),
        });
        if(!response.ok)throw new Error('Luna network failure '+response.status);
        const body:unknown=await response.json();
        const raw=readDraft(body);
        const validated=input.validateDraft(raw);
        const usage=requireStrictUsage((body as Record<string,unknown>).usage);
        await config.durable.commit({
          reservationId:claim.reservationId,draft:raw,usage,
          model:OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
        });
        return validated;
      }catch(error){
        try{await config.durable.fail({reservationId:claim.reservationId,reason:'provider_or_validation_failed'});}catch{
          throw new Error('Luna cost/validation failure could not be recorded',{cause:error});
        }
        throw error;
      }
    },
  });
}
