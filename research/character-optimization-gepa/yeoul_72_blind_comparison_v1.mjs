/** Blind comparison of the 72 historical DeepSeek replies against new GEPA replies.
 * Local-only human review. Historical responses are development evidence, NOT a holdout.
 * The blind key never enters the reviewer HTML or public GitHub.
 */
import {randomInt, createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPairedPlan} from './yeoul_288_paid_pair_preflight_v1.mjs';

const REPO=fileURLToPath(new URL('../../',import.meta.url));
const MODEL='deepseek/deepseek-v4.1-flash-1017';
const fail=s=>{throw Error('YEOUL_BLIND_PAIR_HOLD:'+s)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const escapeHtml=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const outsideRepo=p=>{const rel=relative(REPO,resolve(p));if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..'&&!resolve(rel).startsWith('..')))fail('private_output_in_repo')};

export function buildBlindReview({original,candidate,actual},chooseSide=()=>randomInt(2)){
 const plan=buildPairedPlan(original,candidate);
 if(!obj(actual)||actual.schemaVersion!=='yeoul-gepa-deepseek-72-paid-v1'
  ||actual.status!=='COMPLETE'||actual.model!==MODEL
  ||actual.originalExperiment!==42572722295
  ||actual.candidateSha256!==plan.candidateSha256
  ||actual.protocolSha256!==plan.sourceProtocolSha256
  ||!Array.isArray(actual.rows)||actual.rows.length!==72
  ||typeof actual.providerReportedCostUsd!=='number'
  ||!Number.isFinite(actual.providerReportedCostUsd)||actual.providerReportedCostUsd<0
  ||actual.providerReportedCostUsd>0.25)fail('unverified_actual_run');
 const old=new Map(original.responses.filter(x=>x.model===MODEL)
  .map(x=>[[x.id,x.variant,x.repeat,x.model].join('|'),x]));
 const newRows=new Map();
 for(const row of actual.rows){
  if(!obj(row)||typeof row.legacyKey!=='string'||newRows.has(row.legacyKey)
   ||row.model!==MODEL||!Array.isArray(plan.tasks)
   ||typeof row.reply!=='string'||!row.reply.trim()||row.reply.length>1500
   ||!Number.isInteger(row.inputTokens)||row.inputTokens<1
   ||!Number.isInteger(row.outputTokens)||row.outputTokens<1
   ||typeof row.costUsd!=='number'||row.costUsd<0||!Number.isFinite(row.costUsd))
   fail('invalid_or_duplicate_new_response');
  newRows.set(row.legacyKey,row);
 }
 if(actual.rows.reduce((n,x)=>n+x.costUsd,0)>actual.providerReportedCostUsd+0.000001)
  fail('reported_cost_mismatch');
 const pairs=[],key=[];
 for(const task of plan.tasks){
  const fresh=newRows.get(task.legacyKey),legacy=old.get(task.legacyKey);
  if(!fresh||!legacy||fresh.id!==task.id||fresh.variant!==task.variant
   ||fresh.repeat!==task.repeat||fresh.legacyKey!==task.legacyKey
   ||!legacy.reply||typeof legacy.reply!=='string')fail('unmatched_response');
  const side=chooseSide();
  if(side!==0&&side!==1)fail('invalid_random_side');
  const left=side===0?legacy.reply:fresh.reply;
  const right=side===0?fresh.reply:legacy.reply;
  pairs.push({id:task.legacyKey,questionId:task.id,question:task.input,left,right});
  key.push({id:task.legacyKey,questionId:task.id,legacySide:side===0?'A':'B',
   displayedPairSha256:sha(JSON.stringify([task.legacyKey,task.id,left,right]))});
 }
 const keyFile={schemaVersion:'yeoul-72-private-blind-key-v1',
  candidateSha256:plan.candidateSha256,sourceProtocolSha256:plan.sourceProtocolSha256,
  historicalComparisonsOnly:true,reviewerAuthenticated:false,pairs:key};
 const html=renderHtml(pairs,sha(JSON.stringify(keyFile)));
 return {html,keyFile,pairCount:pairs.length};
}

function renderHtml(pairs,fingerprint){
 const entries=pairs.map((p,i)=>`<article data-id="${escapeHtml(p.id)}"><h3>${i+1}/72 · ${escapeHtml(p.questionId)}</h3>
 <p class="question">${escapeHtml(p.question)}</p>
 <div class="answers"><section><b>답변 A</b><p>${escapeHtml(p.left)}</p></section>
 <section><b>답변 B</b><p>${escapeHtml(p.right)}</p></section></div>
 <fieldset><legend>어느 답변이 더 자연스럽고 여울답습니까?</legend>
 <label><input type="radio" name="pick${i}" value="A">A</label>
 <label><input type="radio" name="pick${i}" value="B">B</label>
 <label><input type="radio" name="pick${i}" value="tie">동점</label>
 <label><input type="radio" name="pick${i}" value="uncertain">판단 보류</label>
 </fieldset><label>근거(선택, 로컬에만 저장)<textarea maxlength="500"></textarea></label></article>`).join('\n');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
 <meta name="viewport" content="width=device-width,initial-scale=1">
 <title>여울 GEPA · 과거/새 응답 블라인드 비교</title>
 <style>body{font:16px/1.65 system-ui,sans-serif;max-width:950px;margin:auto;padding:24px;background:#fafafa;color:#242424}
 article{background:white;margin:24px 0;padding:22px;border:1px solid #ddd;border-radius:12px}
 .question{font-weight:600}.answers{display:grid;grid-template-columns:1fr 1fr;gap:12px}
 section{background:#f3f5f7;padding:14px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}
 label{margin-right:16px}fieldset{margin:16px 0;padding:12px}textarea{display:block;width:98%;height:52px;margin-top:8px}
 button{font:inherit;padding:9px 20px} @media(max-width:650px){.answers{grid-template-columns:1fr}}</style></head>
 <body><h1>여울 GEPA 블라인드 비교 · 72건</h1>
 <p>오래된 모델 답변과 새 GEPA 적용 답변을 익명화하여 비교합니다. 과거 12질문 재사용으로 독립적인 개선 입증은 아닙니다.
 결과는 현재 PC에만 다운로드되며 자동 전송하지 않습니다.</p>
 <button id="save">검토 결과 JSON 저장</button><span id="count"></span>
 ${entries}<button id="save2">검토 결과 JSON 저장</button>
 <script>
 const nodes=[...document.querySelectorAll('article[data-id]')];
 const fp=${JSON.stringify(fingerprint)};
 function save(){
 const reviews=nodes.map(n=>({id:n.dataset.id,
 vote:n.querySelector('input:checked')?.value??null,
 note:n.querySelector('textarea').value.slice(0,500)}));
 const result={schemaVersion:'yeoul-72-blind-review-draft-v1',keyFingerprint:fp,reviews};
 const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});
 const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;
 a.download='yeoul-72-blind-human-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 function tally(){document.querySelector('#count').textContent='검토 '+nodes.filter(n=>n.querySelector('input:checked')).length+'/72';}
 nodes.forEach(n=>n.addEventListener('change',tally));
 document.querySelector('#save').addEventListener('click',save);
 document.querySelector('#save2').addEventListener('click',save);tally();
 </script></body></html>`;
}

export function summarizeBlindReview(keyFile,draft){
 if(!obj(keyFile)||keyFile.schemaVersion!=='yeoul-72-private-blind-key-v1'
  ||keyFile.historicalComparisonsOnly!==true||!Array.isArray(keyFile.pairs)
  ||keyFile.pairs.length!==72||!obj(draft)
  ||draft.schemaVersion!=='yeoul-72-blind-review-draft-v1'
  ||draft.keyFingerprint!==sha(JSON.stringify(keyFile))
  ||!Array.isArray(draft.reviews)||draft.reviews.length!==72)fail('review_binding');
 const map=new Map(keyFile.pairs.map(x=>[x.id,x]));
 if(map.size!==72||new Set(keyFile.pairs.map(x=>x.questionId)).size!==12)fail('key_duplicates');
 let reviewed=0,candidateWins=0,legacyWins=0,ties=0,uncertain=0;
 const byQuestion={};const seen=new Set();
 for(const r of draft.reviews){
  if(!obj(r)||typeof r.id!=='string'||seen.has(r.id)||!map.has(r.id)
   ||![null,'A','B','tie','uncertain'].includes(r.vote)
   ||typeof r.note!=='string'||r.note.length>500)fail('invalid_review');
  seen.add(r.id);
  const pair=map.get(r.id);
  const group=byQuestion[pair.questionId]??={reviewed:0,candidateWins:0,legacyWins:0,ties:0,uncertain:0};
  if(r.vote===null)continue;
  reviewed++;group.reviewed++;
  if(r.vote==='tie'){ties++;group.ties++;}
  else if(r.vote==='uncertain'){uncertain++;group.uncertain++;}
  else if(r.vote===pair.legacySide){legacyWins++;group.legacyWins++;}
  else{candidateWins++;group.candidateWins++;}
 }
 return {schemaVersion:'yeoul-72-blind-comparison-summary-v1',total:72,
  reviewed,unreviewed:72-reviewed,candidateWins,legacyWins,ties,uncertain,
  byQuestion:Object.fromEntries(Object.entries(byQuestion).sort()),
  comparisonIsHistoricalDevelopmentOnly:true,oldAndNewGenerationDatesDiffer:true,
  independentHoldoutPassed:false,reviewerIdentityVerified:false,
  providerReceiptVerified:false,qualityGainEstablished:false,productionEligible:false,
  candidateSha256:keyFile.candidateSha256};
}

function options(argv){const a={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||!argv[i+1])fail('arguments');a[argv[i].slice(2)]=argv[i+1]}return a;}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...argv]=process.argv.slice(2),a=options(argv);
  if(mode==='generate'){
   for(const k of ['original','candidate','actual','html','key'])if(!a[k])fail('missing_'+k);
   outsideRepo(a.html);outsideRepo(a.key);
   const r=buildBlindReview({original:JSON.parse(readFileSync(a.original,'utf8')),
    candidate:JSON.parse(readFileSync(a.candidate,'utf8')),
    actual:JSON.parse(readFileSync(a.actual,'utf8'))});
   writeFileSync(a.key,JSON.stringify(r.keyFile,null,2)+'\n',{flag:'wx',mode:0o600});
   writeFileSync(a.html,r.html,{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:'READY_FOR_HUMAN',pairs:r.pairCount,externalCalls:0,qualityGainEstablished:false}));
  }else if(mode==='summarize'){
   for(const k of ['key','review','out'])if(!a[k])fail('missing_'+k);
   outsideRepo(a.out);
   const sum=summarizeBlindReview(JSON.parse(readFileSync(a.key,'utf8')),
    JSON.parse(readFileSync(a.review,'utf8')));
   writeFileSync(a.out,JSON.stringify(sum,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:'SUMMARIZED',reviewed:sum.reviewed,
     candidateWins:sum.candidateWins,legacyWins:sum.legacyWins,qualityGainEstablished:false}));
  }else fail('mode');
 }catch(e){console.error(e.message.startsWith('YEOUL_BLIND_PAIR_HOLD:')?e.message:'YEOUL_BLIND_PAIR_HOLD:invalid_private_input');process.exitCode=1;}
}