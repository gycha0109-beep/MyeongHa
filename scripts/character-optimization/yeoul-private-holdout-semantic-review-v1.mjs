/** Local-only review of assistant-written private Yeoul holdout drafts.
 * No remote calls, source promotion, model execution or automatic reviewer authority.
 * Private source, historical questions and review comments never leave local HTML.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync,lstatSync} from 'node:fs';
import {dirname,resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectPrivateYeoulHoldoutDraft} from './yeoul-private-holdout-preflight-v1.mjs';
import {preparePrivateYeoulForResearch} from './yeoul-private-source-intake-v1.mjs';
import {YEOUL_NEW_FAMILY_DRAFTS} from './yeoul-new-scenario-families-v1.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const publicH=JSON.parse(readFileSync(new URL('../../docs/character-runtime-lab/yeoul-holdout-scenarios-v1.json',import.meta.url),'utf8'));
const sha=text=>createHash('sha256').update(text).digest('hex');
const fail=code=>{throw Error('YEOUL_PRIVATE_REVIEW_HOLD:'+code)};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const html=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses=new Set(['distinct','overlap','revise','uncertain']);
function insideRoot(file){
 const rel=relative(root,file);
 return rel===''||rel==='.'||(!isAbsolute(rel)&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith('../'));
}
function privateInput(path){
 const abs=resolve(path),s=lstatSync(abs);
 if(!s.isFile()||s.isSymbolicLink()||insideRoot(abs)||insideRoot(realpathSync(abs))||s.size>2*1024*1024)
  fail('invalid_private_source');
 return JSON.parse(readFileSync(abs,'utf8'));
}
function privateOutput(path,ext){
 const abs=resolve(path),parent=realpathSync(dirname(abs));
 if(!abs.endsWith(ext)||insideRoot(abs)||insideRoot(parent))fail('private_output_required');
 return abs;
}
function getReferences(original,knownOriginalAutoFields=false){
 const verified=preparePrivateYeoulForResearch(original,{knownOriginalAutoFields});
 const originals=new Map();
 for(const x of verified.responses)if(!originals.has(x.id))originals.set(x.id,x.input);
 if(originals.size!==12)fail('legacy_questions_missing');
 const list=[...originals].map(([id,text])=>({id,text,source:'과거 사용자 평가 질문'}));
 for(const [index,x] of publicH.scenarios.entries())list.push({
  id:'H'+String(index+1).padStart(2,'0'),text:x.turns.join(' / '),source:'공개된 평가 질문'});
 for(const [index,x] of YEOUL_NEW_FAMILY_DRAFTS.entries())list.push({
  id:'D'+String(index+1).padStart(2,'0'),text:x.turns.join(' / '),source:'공개된 개발·검증 초안'});
 if(list.length!==30||new Set(list.map(x=>x.id)).size!==30)fail('reference_collection_changed');
 return list;
}
function fingerprint(draft,references){
 return sha(JSON.stringify({draft,references}));
}
function refOptions(references,ids,selfId){
 return ['<option value="">선택 안 함</option>',
 ...references.map(x=>`<option value="${html(x.id)}">${html(x.id)} · ${html(x.source)}</option>`),
 ...ids.filter(id=>id!==selfId).map(id=>`<option value="${html(id)}">다른 신규 질문 · ${html(id)}</option>`)].join('');
}
export function buildPrivateYeoulSemanticReview({draft,original,knownOriginalAutoFields=false}){
 const preflight=inspectPrivateYeoulHoldoutDraft(draft,{historicalOriginal:original,knownOriginalAutoFields});
 if(!preflight.assistantAuthoredUnreviewed||preflight.privateFamiliesInspected!==10)
  fail('only_ten_assistant_drafts');
 const references=getReferences(original,knownOriginalAutoFields),binding=fingerprint(draft,references);
 const ids=draft.families.map(x=>x.familyId);
 const cards=draft.families.map((family,i)=>{
  const questions=family.turns.map(x=>`<p class="question">${html(x)}</p>`).join('');
  return `<article data-id="${html(family.familyId)}"><h2>${i+1}. 신규 질문 후보</h2>
   <small>관계 단계: ${html(family.relationshipStage)}</small>${questions}
   <div class="fieldset"><label>이전 질문과 의미가 겹칩니까?
    <select class="vote"><option value="">미검토</option>
     <option value="distinct">의미상 구별됨(초안 의견)</option>
     <option value="overlap">중복 우려</option>
     <option value="revise">질문 수정 필요</option>
     <option value="uncertain">판단 보류</option></select></label>
   <label>겹치는 항목(필요할 때 선택)<select class="ref">${refOptions(references,ids,family.familyId)}</select></label>
   <label>판정 근거(검토했다면 필수)<textarea maxlength="500" placeholder="이 질문이 기존 문항과 구별되거나 수정이 필요한 이유"></textarea></label></div></article>`;
 }).join('\n');
 const refBlocks=references.map(r=>`<p><b>${html(r.id)}</b> <span>${html(r.source)}</span>: ${html(r.text)}</p>`).join('\n');
 const page=`<!doctype html><html lang="ko"><head><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <title>여울 · 비공개 신규 평가 질문 10개 검토</title>
 <style>body{font:16px/1.55 system-ui,sans-serif;max-width:1100px;margin:auto;padding:28px;background:#f6f7f9;color:#222}
 article{background:white;margin:18px 0;border:1px solid #ddd;border-radius:12px;padding:22px}
 .question{font-weight:650;white-space:pre-wrap}.fieldset{display:grid;gap:12px;margin-top:18px}
 select,textarea{display:block;box-sizing:border-box;width:100%;font:inherit;margin-top:4px;padding:8px}
 textarea{min-height:62px}small,span{color:#666}
 details{margin:14px 0;background:white;padding:16px;border-radius:10px}
 details p{border-top:1px solid #eee;padding:10px 0}button{font:inherit;padding:10px 18px;margin-right:12px}
 .head{position:sticky;top:0;padding:12px;background:#fff;border-bottom:1px solid #ddd;z-index:1}</style></head>
 <body><h1>여울 · 신규 평가 질문 10개 검토</h1>
 <p>AI가 작성한 비공개 초안입니다. 기존 12문항과 공개 평가·개발 자료 18개를 함께 읽고 의미 중복을 확인해 주세요.
 여기서 '구별됨'을 선택해도 독립 최종평가 승인이나 실행 허가로 바뀌지 않습니다.</p>
 <div class="head"><button id="save">검토 초안 JSON 저장</button><b id="count">검토 0/10</b></div>
 <details><summary>비교 참고 질문 30개 펼치기(기존 12개 + 공개 18개)</summary>${refBlocks}</details>
 ${cards}
 <button id="save2">검토 초안 JSON 저장</button>
 <script>
 const binding=${JSON.stringify(binding)};
 const cards=[...document.querySelectorAll('article[data-id]')];
 const tally=()=>document.getElementById('count').textContent='검토 '+cards.filter(n=>n.querySelector('.vote').value).length+'/10';
 function save(){
   const entries=cards.map(n=>({id:n.dataset.id,decision:n.querySelector('.vote').value||null,
     overlapReference:n.querySelector('.ref').value||null,
     note:n.querySelector('textarea').value.trim().slice(0,500)}));
   for(const [i,e] of entries.entries()){
     if(e.decision&&!e.note){alert((i+1)+'번 항목의 판정 근거를 작성해 주세요.');return;}
     if(e.decision==='overlap'&&!e.overlapReference){alert((i+1)+'번 항목의 겹치는 대상을 선택해 주세요.');return;}
     if(!e.decision&&(e.note||e.overlapReference)){alert((i+1)+'번 미검토 항목에 작성된 내용을 먼저 정리해 주세요.');return;}
   }
   const data={schemaVersion:'yeoul-private-holdout-human-review-draft-v1',sourceFingerprint:binding,entries};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='yeoul-private-holdout-10-review-draft.json';a.click();
   setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 for(const c of cards)c.addEventListener('change',tally);
 document.getElementById('save').addEventListener('click',save);
 document.getElementById('save2').addEventListener('click',save);tally();
 </script></body></html>`;
 return {html:page,sourceFingerprint:binding,referenceCount:references.length,candidateCount:ids.length};
}
export function inspectPrivateYeoulSemanticReview({draft,original,review,knownOriginalAutoFields=false}){
 const built=buildPrivateYeoulSemanticReview({draft,original,knownOriginalAutoFields});
 const references=getReferences(original,knownOriginalAutoFields),validIds=new Set([
  ...draft.families.map(x=>x.familyId),...references.map(x=>x.id)]);
 if(!obj(review)||Object.keys(review).sort().join('|')!=='entries|schemaVersion|sourceFingerprint'
  ||review.schemaVersion!=='yeoul-private-holdout-human-review-draft-v1'
  ||review.sourceFingerprint!==built.sourceFingerprint
  ||!Array.isArray(review.entries)||review.entries.length!==10)fail('unbound_review');
 const seen=new Set(),counts={distinct:0,overlap:0,revise:0,uncertain:0,unreviewed:0};
 for(const r of review.entries){
  if(!obj(r)||Object.keys(r).sort().join('|')!=='decision|id|note|overlapReference'
    ||typeof r.id!=='string'||!draft.families.some(x=>x.familyId===r.id)
    ||seen.has(r.id)||typeof r.note!=='string'||r.note.length>500
    ||!(r.decision===null||statuses.has(r.decision))
    ||!(r.overlapReference===null||typeof r.overlapReference==='string')
    ||(r.overlapReference!==null&&(!validIds.has(r.overlapReference)||r.overlapReference===r.id))
    ||(r.decision!==null&&!r.note.trim())
    ||(r.decision===null&&(r.note.trim()||r.overlapReference!==null))
    ||(r.decision==='overlap'&&r.overlapReference===null))fail('invalid_review_entry');
  seen.add(r.id);counts[r.decision??'unreviewed']++;
 }
 return {schemaVersion:'yeoul-private-holdout-semantic-review-summary-v1',
  total:10,reviewed:10-counts.unreviewed,counts,
  assistantAuthoredUnreviewedAtCreation:true,
  sourceBindingVerified:true,sourceFingerprintPublicExported:false,
  personIdentityAuthenticated:false,independentSemanticReviewVerified:false,
  sealedHoldoutAdmitted:false,paidExecutionReady:false,
  qualityGainEstablished:false,externalCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...raw]=process.argv.slice(2);
  const knownOriginalAutoFields=raw.includes('--known-original-unreviewed-auto-fields');
  const argv=raw.filter(x=>x!=='--known-original-unreviewed-auto-fields'),a={};
  if(argv.length%2)fail('arguments');
  for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--'))fail('arguments');a[argv[i].slice(2)]=argv[i+1]}
  if(!a.draft||!a.original||!a.out)fail('source_paths_required');
  const draft=privateInput(a.draft),original=privateInput(a.original),out=privateOutput(a.out,mode==='generate'?'.html':'.json');
  if(mode==='generate'){
   const p=buildPrivateYeoulSemanticReview({draft,original,knownOriginalAutoFields});
   writeFileSync(out,p.html,{flag:'wx',mode:0o600});
   console.log(JSON.stringify({reviewCards:p.candidateCount,comparisonReferences:p.referenceCount,paidCalls:0,approved:false}));
  }else if(mode==='inspect'){
   if(!a.review)fail('review_required');
   const s=inspectPrivateYeoulSemanticReview({draft,original,review:privateInput(a.review),knownOriginalAutoFields});
   writeFileSync(out,JSON.stringify(s,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({reviewed:s.reviewed,counts:s.counts,independentSemanticReviewVerified:false}));
  }else fail('mode');
 }catch(e){console.error(e.message?.startsWith('YEOUL_PRIVATE_REVIEW_HOLD:')?e.message:'YEOUL_PRIVATE_REVIEW_HOLD:private_inputs_invalid');process.exitCode=1;}
}