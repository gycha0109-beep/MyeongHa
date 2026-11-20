import type {
  AuthorizedOfficialWealthLunaWriterPortV1,
  OfficialWealthLunaSourceV1,
} from './official-wealth-luna-reader-v1.js';
import {
  OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
} from './official-wealth-luna-reader-v1.js';
import { getSajuProductChapterBlueprintV1 } from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';
import {CHARACTER_RUNTIME_AUTHORING_V1} from '../../../packages/character-content/src/index.js';

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
/**
 * Give Luna a literal, source-owned quote instead of asking the model to
 * invent an anchor and hoping the resulting quote matches. This is a writing
 * aid only; the existing final validator still verifies source membership.
 */
function sourceOwnedQuoteV1(source:OfficialWealthLunaSourceV1['chapters'][number]):string|null{
  for(const excerpt of source.excerpts){
    const lines=excerpt.split(/\r?\n/u).map(line=>line.trim()).filter(Boolean);
    for(const line of lines){
      if(line.length<20 || /^(?:승인 의미 \[|근거 블록:|이 장의 질문:|적용 조건:|금지 확장:)/u.test(line))continue;
      const sentence=line.match(/^.{20,130}?[.!?。]/u)?.[0];
      const chosen=(sentence??line.slice(0,Math.min(65,line.length))).trim();
      if(chosen.length>=20 && excerpt.includes(chosen))return chosen;
    }
  }
  return null;
}

function chapterSourceAnchorsV1(source:OfficialWealthLunaSourceV1){
  const sixChapterProduct=source.chapters.length===6 &&
    source.chapters.every((chapter,index)=>
      chapter.title===getSajuProductChapterBlueprintV1('wealth')[index]?.fixedTitle);
  const usedUnits=new Set<string>();
  const suggestions=source.chapters.map(chapter=>{
    for(const excerpt of chapter.excerpts){
      const unitId=excerpt.match(/^승인 의미 \[([^\]]+)\]/u)?.[1]??null;
      if(sixChapterProduct && (unitId===null || usedUnits.has(unitId)))continue;
      const quote=sourceOwnedQuoteV1({...chapter,excerpts:[excerpt]});
      if(quote!==null){
        if(unitId!==null)usedUnits.add(unitId);
        return {index:chapter.index,quote};
      }
    }
    return {index:chapter.index,quote:null};
  });
  if(sixChapterProduct && suggestions.some(item=>item.quote===null)){
    throw new TypeError('Six-chapter Wealth report lacks distinct source-owned meaning for each chapter');
  }
  return suggestions;
}

const TAEGYEOM_AUTHORING = CHARACTER_RUNTIME_AUTHORING_V1.find(
  item=>item.characterId==='taegyeom',
);
if(TAEGYEOM_AUTHORING===undefined)throw new TypeError('Missing authoritative Taegyeom canon');
function instructions(source:OfficialWealthLunaSourceV1):string {
  const isSixChapterProduct=source.chapters.length===6 &&
    source.chapters.every((chapter,index)=>chapter.title===
      getSajuProductChapterBlueprintV1('wealth')[index]?.fixedTitle);
  if(TAEGYEOM_AUTHORING===undefined)throw new TypeError('Missing authoritative Taegyeom canon');
  return [
    '당신은 명하의 태겸이지만, 서명된 사주 해석을 수정하지 않는 별도 보충 서술자입니다.',
    '태겸의 확정 성격: '+TAEGYEOM_AUTHORING.persona.communication.sentenceRhythm+
      ' / '+TAEGYEOM_AUTHORING.persona.cognition.conclusionStyle+
      ' / '+TAEGYEOM_AUTHORING.behavior.rules.map(rule=>rule.preferredResponse).join(' · '),
    '태겸의 공식 관심 축: '+TAEGYEOM_AUTHORING.sajuProfile.attentionAxes.join(' → ')+
      '. 결과를 미화하지 않고 선택의 책임과 감당할 수 있는 선을 차분하게 짚습니다.',
    '출력은 제공된 JSON Schema와 정확히 일치하는 하나의 객체만 생성합니다.',
    '태겸의 실제 승인 저작 방향: '+source.voice.register+' / '+source.voice.sentenceRhythm,
    '해석 태도: '+source.voice.interpretationStyle,
    isSixChapterProduct
      ? '이 입력은 재물운 6장 원고 후보입니다. 각 장은 정확히 3문단, 문단당 70~420자로 짧고 명료하게 작성합니다. 1문단=명쾌한 판단, 2문단=근거와 삶에서의 구별, 3문단=태겸이 남기는 책임과 선택의 선. 같은 설명을 길게 반복하지 마십시오.'
      : '각 챕터는 서술 2~4문단, 문단당 80~1300자이며, 한 챕터의 관찰 → 현실의 장면 → 판단과 구별을 연결합니다.',
    ...(isSixChapterProduct ? [
      '각 장은 전달받은 승인 의미 [unitId], 실제 명리 판단 조건, 근거 블록이 전제입니다. 식상·재성·관성·비겁·인성 중 실제 전달된 조합을 근거로 왜 그 판단이 나왔는지 먼저 설명하고, 그 조합에 없는 십성이나 강약·격국·운의 시기를 창작하지 마십시오.',
      '각 장은 명리 구조 → 이 명식에서의 판단 → 그 판단이 현실에서 드러날 수 있는 구체적 갈림길 순으로 쓰십시오. 지출을 나누라, 예산을 세우라 같은 일반적인 재테크 조언만으로 한 문단을 채우지 마십시오.',
      '각 장마다 다른 질문에 답하십시오. 1장은 재물의 기본 구조, 2장은 산출·교환, 3장은 벌기와 관리의 차이, 4장은 승인된 긴장·제약, 5장은 여러 승인 의미를 엮은 특별한 조건, 6장은 앞서 확인한 상반된 선택 기준의 종합입니다.',
      '실생활 사례는 장의 실제 승인 의미가 허용하는 경우에만 제시하는 가상 장면입니다. 설명용 장면이 실제 고객에게 있었다고 말하지 마십시오.',
      '서버가 제공한 sourceAnchors 배열의 해당 index 문자열을 sourceAnchor 필드에만 정확히 복사하십시오. paragraphs 본문에는 이 원문을 그대로 복사하지 마십시오. 출처 증거는 독자에게 별도의 근거 열람 영역으로 제공됩니다.',
      '태겸은 길게 둘러 말하지 않습니다. 독자에게 직접 말하듯 짧은 평서문을 씁니다. 원칙과 책임을 분명히 짚되 모욕·훈계·운명 단정은 하지 않습니다.',
      '첫 문장은 반드시 결론을 말하십시오. “이 명식에서”, “이 명식의”, “이 장에서”처럼 연구 보고서 투로 시작하지 않습니다. 문단마다 한 가지 새 정보가 있어야 합니다.',
      '“이 장의 핵심”, “가상의 상황”, “이 장면은”, “이는 실제 수익을 보장하지 않습니다” 같은 메타 해설과 반복적 면책 문구를 본문에 쓰지 않습니다. 불확실성은 보고서 안내 영역에 별도로 표시됩니다.',
      '내용이 부족하면 문단을 일반적인 재테크 조언으로 늘리지 마십시오. 근거 내에서만 명리적 조건·판단 경계를 구별합니다.',
      '장별 초점은 1장 돈복의 구조, 2장 가치가 돈으로 연결되는 방식, 3장 버는 것과 남기는 것의 차이, 4장 자기 선택과 비용의 충돌, 5장 서로 다른 근거가 동시에 작용할 때의 상반된 조건, 6장 독자에게 남기는 하나의 분명한 결론입니다. 이미 말한 결론을 되풀이하지 않습니다.',
      '주어진 의미가 평범한 조언만 뒷받침한다면 억지로 심오한 운명론을 만들지 마십시오. 검증에서 불합격될 수 있습니다.',
    ] : []),
    '각 챕터의 index와 title을 정확히 유지합니다. sourceAnchor는 해당 excerpts 안에 실제 존재하는 연속 원문 문자열이며, 본문에는 붙여 쓰지 않습니다.',
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
      // Reject insufficient six-chapter meaning before reserving any paid model usage.
      chapterSourceAnchorsV1(input.source);
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
                sourceAnchors:chapterSourceAnchorsV1(input.source),
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
