/** Manually triggered ONE-CALL synthetic production-transport probe.
 * Never reads a user's Birth/Reading, never publishes or sells a report.
 */
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createOpenRouterOfficialWealthLunaWriterV1} from '../../dist/apps/api/src/openrouter-official-wealth-luna-writer-v1.js';
import {validateOfficialWealthLunaDraftV1,OFFICIAL_WEALTH_LUNA_READER_VERSION_V1} from '../../dist/apps/api/src/official-wealth-luna-reader-v1.js';

if (process.env.GITHUB_ACTIONS === 'true' &&
  (process.env.GITHUB_ACTOR !== 'gycha0109-beep' ||
   process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
   process.env.GITHUB_REF !== 'refs/heads/main' ||
   process.env.GITHUB_RUN_ATTEMPT !== '1')) {
  throw Error('Only one owner-initiated main probe is authorized');
}
if (!process.env.OPENROUTER_API_KEY?.startsWith('sk-or-v1-')) {
  throw Error('Server-held OpenRouter key unavailable');
}
const expectedId = randomUUID();
const source = Object.freeze({
  version: OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
  readingId: expectedId,
  readerCharacterId: 'taegyeom',
  sourceHash: 'f'.repeat(64),
  chapters: [
    {index:0,title:'재물을 만드는 과정과 실제 쓰임',excerpts:[
      '무엇인가를 완성하는 것과 누군가 그 결과에 가치를 부여하는 것은 별개의 단계입니다. 상대에게 어떤 문제를 해결해 주는지 설명하기 어렵다면 교환의 기준은 불분명할 수 있습니다.',
      '만드는 과정뿐 아니라 결과물의 쓰임과 교환의 접점까지 따로 살펴보는 재물 해석입니다.',
    ]},
    {index:1,title:'필요한 지출과 지켜야 할 기준',excerpts:[
      '생활을 유지할 몫, 이미 약속한 지출, 새 기회를 위해 남길 몫을 구분하는 예시가 이 구조를 이해하는 데 도움이 됩니다.',
      '자원과 책임의 기준을 따로 두지 않고 함께 살펴야 합니다. 수익이나 실제 지출 습관을 예측하지는 않습니다.',
    ]},
  ],
  limitations:['이 입력은 임의로 구성한 두 개의 해석 발췌를 사용한 합성 데이터입니다. 실존 고객의 명식이나 공식 발급이 아닙니다.'],
  voice:{
    register:'차분하고 단호한 존댓말',
    sentenceRhythm:'원칙→결과→행동 순서의 짧고 자연스러운 문장',
    interpretationStyle:'책임과 경계 및 선택의 실제 결과를 명확히 구별합니다.',
    prohibited:['현재 확인되지 않은 사건과 수익 금액을 단정하지 않습니다.','사용자를 비난하거나 위협하지 않습니다.'],
  },
});
let claimCount = 0, committed = false, usage;
const writer = createOpenRouterOfficialWealthLunaWriterV1({
  apiKey:process.env.OPENROUTER_API_KEY,
  maxOutputTokens:2500,
  authority:{
    async admit(input){
      return input.readingId===source.readingId &&
        input.sourceHash===source.sourceHash &&
        input.readerCharacterId==='taegyeom'?'authorized':'held';
    },
  },
  durable:{
    async claim(){
      claimCount++;
      if(claimCount!==1)throw Error('Duplicate synthetic probe');
      return {state:'claimed',reservationId:'synthetic-one-call-only'};
    },
    async reserveProviderCost({maxOutputTokens}){
      if(maxOutputTokens!==2500)throw Error('Invalid one-shot output budget');
    },
    async commit(input){
      committed=true;
      usage=input.usage;
    },
    async fail(){process.stderr.write('MODEL_OR_VALIDATION_FAILED_NO_RETRY\\n');},
  },
});
const start=Date.now();
const result=await writer.readOrCreateValidated({
  source,idempotencyKey:'d'.repeat(64),
  validateDraft:raw=>validateOfficialWealthLunaDraftV1(source,raw),
});
if(!committed||!usage||result.chapters.length!==2)throw Error('Synthetic model response not settled');
const review={status:'SYNTHETIC_NOT_FOR_PRODUCTION',model:result.model,sourceHash:source.sourceHash,
  elapsedMs:Date.now()-start,usage,chapters:result.chapters};
writeFileSync('wealth-luna-synthetic-probe.json',JSON.stringify(review,null,2)+'\\n',{mode:0o600});
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
writeFileSync('wealth-luna-synthetic-probe.html',
  '<!doctype html><html lang="ko"><meta charset="utf-8"><title>태겸 Luna 실제 모델 합성 검토본</title>'+
  '<style>body{background:#f6f5ef;color:#243a30;font:17px/1.95 system-ui,sans-serif;max-width:750px;margin:50px auto;padding:24px}h1{font-size:35px}section{padding:35px 0;border-top:1px solid #b6c7ba}p{word-break:keep-all}</style>'+
  '<h1>태겸 재물운 · Luna 합성 실측</h1><p><strong>실제 고객·공식 발급 결과가 아닙니다.</strong> 실측 모델 한 번의 결과입니다.</p>'+
  result.chapters.map(c=>'<section><h2>'+escape(c.title)+'</h2>'+
    c.paragraphs.map(p=>'<p>'+escape(p)+'</p>').join('')+'</section>').join('')+'</html>',
  {mode:0o600});
process.stdout.write(JSON.stringify({status:'SYNTHETIC_LUNA_VALIDATED',chapters:result.chapters.length,usage,elapsedMs:Date.now()-start})+'\\n');
