import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createOpenRouterOfficialWealthLunaWriterV1} from '../../dist/apps/api/src/openrouter-official-wealth-luna-writer-v1.js';
import {
  OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
  validateOfficialWealthLunaDraftV1,
} from '../../dist/apps/api/src/official-wealth-luna-reader-v1.js';
import {getSajuProductChapterBlueprintV1} from '../../dist/packages/domain/src/saju-product-chapter-blueprints-v1.js';
import {CHARACTER_RUNTIME_AUTHORING_V1} from '../../dist/packages/character-content/src/index.js';

if(process.env.GITHUB_ACTIONS==='true'&&(
    process.env.GITHUB_ACTOR!=='gycha0109-beep' ||
    process.env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
    process.env.GITHUB_REF!=='refs/heads/main' ||
    process.env.GITHUB_RUN_ATTEMPT!=='1')) {
  throw Error('Only an owner-initiated single run on main is permitted');
}
const validateOnly=process.env.WEALTH_LUNA_SOURCE_VALIDATE_ONLY==='true';
if(!validateOnly&&!process.env.OPENROUTER_API_KEY?.startsWith('sk-or-v1-')) {
  throw Error('Protected server-only model credential is unavailable');
}
const sample=process.argv[2]??'case-a';
if(!['case-a','case-b'].includes(sample))throw Error('Unknown fixed Saju scenario');
const original=JSON.parse(readFileSync(resolve(
  'test/fixtures/saju-real-wealth-luna/'+sample+'.json'),'utf8'));
const {sourceHash:providedHash,...material}=original;
const materialHash=createHash('sha256').update(JSON.stringify(material)).digest('hex');
if(providedHash!==materialHash ||
    original.schemaVersion!=='saju-wealth-real-source-sixchapter-demo-v1' ||
    original.status!=='SOURCE_COMPLETE_FOR_RESEARCH' ||
    original.productionIssuance!==false ||
    original.customerPurchased!==false ||
    original.readerDraft!==false ||
    original.chapters?.length!==6 ||
    !Number.isInteger(original.sourceUnitCount) || original.sourceUnitCount<3 ||
    !/^[0-9a-f]{64}$/.test(original.officialReportHash)) {
  throw Error('Source is not a verified research Saju meaning fixture');
}
const expected=getSajuProductChapterBlueprintV1('wealth');
const used=new Set();
let sourceIds=0;
const chapters=original.chapters.map((chapter,index)=>{
  if(chapter.chapterId!==expected[index]?.chapterId ||
      chapter.title!==expected[index]?.fixedTitle ||
      !Array.isArray(chapter.units) || chapter.units.length<2 ||
      !chapter.question?.trim())throw Error('Wrong Notion chapter or empty evidence');
  const unitIds=new Set();
  const excerpts=chapter.units.map(unit=>{
    if(!/^canonical_reading_unit_[0-9a-f]{24}$/.test(unit.unitId) ||
        !/^[\w-]+$/.test(unit.kind) ||
        !/^claim_[0-9a-f]{24}$/.test(unit.claimRef) ||
        typeof unit.canonicalMeaning!=='string' ||
        unit.canonicalMeaning.trim().length<60 ||
        !Array.isArray(unit.sourceRefs) || unit.sourceRefs.length===0 ||
        unitIds.has(unit.unitId))throw Error('Saju material lacks traceable canonical meaning');
    unitIds.add(unit.unitId);
    used.add(unit.unitId);sourceIds++;
    return '승인 의미 ['+unit.unitId+']\n'+unit.canonicalMeaning+
      '\n근거 블록: '+unit.sourceRefs.join(' · ')+
      '\n이 장의 질문: '+chapter.question;
  });
  return Object.freeze({index,title:chapter.title,excerpts:Object.freeze(excerpts)});
});
if(used.size!==original.sourceUnitCount||sourceIds<18) {
  throw Error('Some actual Saju selected meanings are missing from the product composition');
}
const kindCounts=original.evidenceKindCounts;
if(['value_creation','management','friction'].some(key=>kindCounts?.[key]<1)) {
  throw Error('Six-chapter source has no independent value/management/friction evidence');
}
const taegyeom=CHARACTER_RUNTIME_AUTHORING_V1.find(character=>character.characterId==='taegyeom');
if(!taegyeom?.speech?.register || !taegyeom?.sajuProfile?.framingStyle) {
  throw Error('Published Taegyeom authoring voice is unavailable');
}
if(validateOnly){
  process.stdout.write(JSON.stringify({status:'VALID_REAL_SAJU_SIX_CHAPTER_SOURCE',sample,sourceUnitCount:used.size,chapterUnits:chapters.map(x=>x.excerpts.length)})+'\n');
  process.exit(0);
}
const readingId=randomUUID();
const source={
  version:OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
  readingId,
  readerCharacterId:'taegyeom',
  sourceHash:materialHash,
  chapters,
  limitations:[
    '이 명식은 실존 구매자 정보가 아니라 실측용 예시 출생 시각입니다.',
    'Saju 내부 연구 근거를 사용한 모델 표현 검토본이며 실제 구매나 발행·승인 보고서가 아닙니다.',
    '계산 근거의 범위 밖으로 미래 금전 사건, 실제 수입, 특정 인물을 단정하지 않습니다.',
  ],
  voice:{
    register:taegyeom.speech.register,
    sentenceRhythm:taegyeom.speech.sentenceRhythm,
    interpretationStyle:taegyeom.sajuProfile.framingStyle,
    prohibited:taegyeom.sajuProfile.safeFraming?.avoidedPhrases??[],
  },
};
const events=[];
let savedDraft=null,committedUsage=null;
const writer=createOpenRouterOfficialWealthLunaWriterV1({
  apiKey:process.env.OPENROUTER_API_KEY,
  maxOutputTokens:7200,
  authority:{
    async admit({readingId:rid,sourceHash:hash,readerCharacterId}){
      events.push('admit');
      return rid===readingId&&hash===source.sourceHash&&readerCharacterId==='taegyeom'
        ? 'authorized':'held';
    },
  },
  durable:{
    async claim(){
      if(events.includes('claim'))throw Error('Duplicate paid model request');
      events.push('claim');
      return {state:'claimed',reservationId:'single-research-one-shot'};
    },
    async reserveProviderCost({maxOutputTokens}){
      if(maxOutputTokens>7200)throw Error('Budget exceeded');
      events.push('reserve');
    },
    async commit({draft,usage}){
      events.push('commit');
      savedDraft=draft;committedUsage=usage;
    },
    async fail(){events.push('fail');},
  },
});
const start=Date.now();
const result=await writer.readOrCreateValidated({
  source,idempotencyKey:materialHash,
  validateDraft:raw=>validateOfficialWealthLunaDraftV1(source,raw),
});
if(!savedDraft||!committedUsage||events.join(',')!=='admit,claim,reserve,commit' ||
    result.chapters.length!==6 || result.chapters.some(x=>x.paragraphs.length<3)) {
  throw Error('Real Saju wealth report was not validated and settled');
}
const review={
  status:'ACTUAL_SAJU_SOURCE_LUNA_RESEARCH_ONLY',
  sample,sourceHash:source.sourceHash,
  sourceUnitCount:used.size,officialReportHash:original.officialReportHash,
  model:result.model,elapsedMs:Date.now()-start,usage:committedUsage,
  chapters:result.chapters,
};
const htmlEsc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;');
const title='태겸의 재물운 · 실측 전체 6장';
const css=':root{font-family:system-ui,sans-serif;color:#273b32;background:#f8f5ee}body{margin:0}.frame{max-width:780px;margin:0 auto;padding:36px 26px 100px}.cover{min-height:42vh;padding:90px 0 42px}h1{font-size:clamp(40px,6vw,66px);font-family:serif;line-height:1.25}h2{font:600 32px/1.45 serif}.label{letter-spacing:.2em;font-size:12px;color:#55765e}section{padding:62px 0;border-top:1px solid #bfc9bb}p{font-size:17px;line-height:2.1;word-break:keep-all;margin:24px 0}.notice{background:#eee7d8;padding:16px 20px;font-size:14px}.detail{font-size:12px;color:#718276}.evidence{border-top:1px dashed #acb8a8;margin-top:40px;padding-top:15px}details{font-size:13px;line-height:1.8}summary{cursor:pointer}';
const body=result.chapters.map((chapter,index)=>
  '<section><div class="label">CHAPTER '+String(index+1).padStart(2,'0')+
  ' / 06</div><h2>'+htmlEsc(chapter.title)+'</h2>'+
  chapter.paragraphs.map(p=>'<p>'+htmlEsc(p)+'</p>').join('')+
  '<div class="evidence"><details><summary>승인된 Saju 근거 확인</summary>'+
  chapters[index].excerpts.map(ex=>'<p class="detail">'+htmlEsc(ex)+'</p>').join('')+
  '</details></div></section>').join('');
const html='<!doctype html><html lang="ko"><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+htmlEsc(title)+'</title><style>'+css+'</style>'+
  '<main class="frame"><header class="cover"><div class="label">MYEONGHA · LUNA × REAL SAJU EVIDENCE</div>'+
  '<h1>'+htmlEsc(title)+'</h1><p>예시 명식: '+
  [original.birthInput.date.year,original.birthInput.date.month,
    original.birthInput.date.day].join('.')+' '+original.birthInput.time.hour+':'+
    String(original.birthInput.time.minute).padStart(2,'0')+'</p>'+
  '<aside class="notice">실제 Saju 해석 결과를 입력으로 사용한 Luna 연구 검토본입니다. '+
  '고객에게 발급한 유료 공식 보고서나 판매 승인물이 아닙니다.</aside></header>'+
  body+'<footer class="detail">출처 해시 '+htmlEsc(source.sourceHash)+
  ' · 모델 '+htmlEsc(result.model)+'</footer></main></html>';
writeFileSync('wealth-luna-real-'+sample+'.html',html,'utf8');
writeFileSync('wealth-luna-real-'+sample+'.json',JSON.stringify(review,null,2)+'\n','utf8');
process.stdout.write(JSON.stringify({status:review.status,chapters:result.chapters.length,
  usage:committedUsage,elapsedMs:review.elapsedMs,sourceUnitCount:used.size})+'\n');
