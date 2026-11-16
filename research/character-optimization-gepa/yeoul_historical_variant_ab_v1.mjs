/** Local-only historical Yeoul DeepSeek prompt-variant A/B review.
 * 48 pairs: 12 exposed development questions x 2 repeats x 2 prompt variants.
 * Not a GEPA experiment, independent holdout, or evidence of candidate gain.
 */
import {createHash,randomInt} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {dirname,resolve,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {preparePrivateYeoulForResearch} from '../../scripts/character-optimization/yeoul-private-source-intake-v1.mjs';
import {DIMENSIONS} from '../../scripts/character-optimization/evaluation-v1.mjs';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const MODEL='deepseek/deepseek-v4.1-flash-1017';
const VARIANTS=['language_rules','conversation_examples'];
const fail=code=>{throw Error('YEOUL_HISTORICAL_AB_HOLD:'+code)};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>createHash('sha256').update(x).digest('hex');
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const within=p=>{const r=relative(ROOT,p);return r===''||r==='.'||(!isAbsolute(r)&&r!=='..'&&!r.startsWith('..'+sep))};
const privateInput=p=>{
 const a=resolve(p),s=lstatSync(a);
 if(!s.isFile()||s.isSymbolicLink()||within(a)||within(realpathSync(a))||s.size>2000000)fail('private_input');
 return JSON.parse(readFileSync(a,'utf8'));
};
const privateOutput=p=>{
 const a=resolve(p),dir=realpathSync(dirname(a));
 if(within(a)||within(dir)||existsSync(a)||!/\.(html|json)$/i.test(a))fail('private_output');
 return a;
};
const rowKey=(id,repeat,variant)=>[id,repeat,variant].join('|');
// Review IDs are opaque: never embed variant identity in the reviewer HTML.
const axisNames={korean_naturalness:'한국어 자연스러움',response_relevance:'답변 적합성',
 agency:'주도성',persona_fidelity:'여울 고유성',relationship_fit:'관계 적절성',
 continuity:'맥락 일관성',repetition:'반복성',efficiency:'간결성'};

function deepseekMatrix(source){
 const rows=source.responses.filter(r=>r.model===MODEL),map=new Map();
 if(rows.length!==72)fail('deepseek_rows');
 for(const r of rows){
  const k=rowKey(r.id,r.repeat,r.variant);
  if(map.has(k)||typeof r.reply!=='string'||!r.reply.trim())fail('duplicate_or_empty_reply');
  map.set(k,r);
 }
 const expected=[];
 for(let n=1;n<=12;n++)for(const repeat of [1,2]){
  const id='Y'+String(n).padStart(2,'0');
  for(const variant of ['baseline',...VARIANTS]){
   const k=rowKey(id,repeat,variant);
   if(!map.has(k))fail('missing_cell');
   expected.push(k);
  }
 }
 if(map.size!==expected.length)fail('extra_cell');
 return map;
}
function pairingMatrix(source){
 const map=deepseekMatrix(source),out=[];
 for(let n=1;n<=12;n++)for(const repeat of [1,2]){
  const id='Y'+String(n).padStart(2,'0');
  const baseline=map.get(rowKey(id,repeat,'baseline'));
  for(const variant of VARIANTS){
   const candidate=map.get(rowKey(id,repeat,variant));
   if(baseline.input.normalize('NFKC').trim()!==candidate.input.normalize('NFKC').trim())
    fail('question_mismatch');
   out.push({id:'P'+String(out.length+1).padStart(3,'0'),questionId:id,repeat,variant,
    question:baseline.input,baseline:baseline.reply,challenger:candidate.reply,
    baselineGood:baseline.evaluation.rating==='good',challengerGood:candidate.evaluation.rating==='good'});
  }
 }
 return out;
}
function historicalSummary(pairs){
 const variants={};
 for(const variant of VARIANTS){
  const rows=pairs.filter(p=>p.variant===variant);
  variants[variant]={pairs:rows.length,improved:rows.filter(p=>p.challengerGood&&!p.baselineGood).length,
   worsened:rows.filter(p=>!p.challengerGood&&p.baselineGood).length,
   sameGoodStatus:rows.filter(p=>p.challengerGood===p.baselineGood).length};
 }
 return {schemaVersion:'yeoul-historical-variant-ab-summary-v1',
  source:'user_rated_historical_development_only',pairs:pairs.length,
  variants,realNewModelCalls:0,measuredGepaGain:false,
  blindHumanVotesRecorded:0,independentHoldout:false,productionEligible:false};
}
function htmlReview(pairs,fingerprint){
 const opts=DIMENSIONS.map(x=>'<option value="'+esc(x)+'">'+esc(axisNames[x]||x)+'</option>').join('');
 const cards=pairs.map((p,i)=>{
  return '<article data-id="'+esc(p.id)+'" data-question="'+esc(p.questionId)+'">'+
   '<h2>'+esc(p.questionId)+' · 비교 '+(i+1)+'/48</h2>'+
   '<p class="question">'+esc(p.question)+'</p>'+
   '<div class="answers"><section><b>답변 A</b><p>'+esc(p.left)+'</p></section>'+
   '<section><b>답변 B</b><p>'+esc(p.right)+'</p></section></div>'+
   '<fieldset><legend>더 자연스럽고 여울다운 답변은?</legend>'+
   '<label><input type="radio" name="pick'+i+'" value="A"> A</label>'+
   '<label><input type="radio" name="pick'+i+'" value="B"> B</label>'+
   '<label><input type="radio" name="pick'+i+'" value="tie"> 동점</label>'+
   '<label><input type="radio" name="pick'+i+'" value="uncertain"> 판단 보류</label></fieldset>'+
   '<label>상대적으로 부족한 답변의 문제(선택) <select><option value="">없음</option>'+opts+'</select></label>'+
   '<label class="note">근거(선택, 이 PC에서만 보관)<textarea maxlength="500"></textarea></label>'+
   '</article>';
 }).join('\n');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8">'+
 '<meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<title>여울 과거 프롬프트 48쌍 블라인드 비교</title>'+
 '<style>body{font:16px/1.55 system-ui,sans-serif;max-width:1050px;margin:24px auto;padding:0 16px;color:#1f2937;background:#f5f7fa}'+
 'h1{font-size:25px}h2{font-size:18px;margin:0 0 10px}article{background:white;border:1px solid #d7dce5;border-radius:14px;margin:16px 0;padding:20px}'+
 '.question{font-weight:650}.answers{display:grid;grid-template-columns:1fr 1fr;gap:12px}section{padding:15px;background:#eef3fb;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}'+
 'fieldset{margin:16px 0}fieldset label{margin-right:14px}.note{display:block;margin-top:12px}textarea{display:block;width:97%;height:55px;margin-top:5px}'+
 'button,select{font:inherit;padding:6px 12px}header{background:white;padding:20px;border-radius:14px}'+
 '@media(max-width:680px){.answers{grid-template-columns:1fr}}</style></head><body>'+
 '<header><h1>여울 · 기존 응답 48쌍 A/B 비교</h1>'+
 '<p>실제 과거 DeepSeek 응답을 비교합니다. A/B의 프롬프트 종류와 과거 평점은 숨겨져 있습니다. 새로운 GEPA 모델의 응답은 아닙니다.</p>'+
 '<label>질문 선택 <select id="filter"><option value="">전체 48쌍</option>'+
 Array.from({length:12},(_,i)=>'<option value="Y'+String(i+1).padStart(2,'0')+'">Y'+String(i+1).padStart(2,'0')+'</option>').join('')+
 '</select></label> <button id="save">검토 결과 JSON 저장</button> <strong id="count"></strong></header>'+
 cards+
 '<script>const nodes=[...document.querySelectorAll("article[data-id]")];'+
 'const fp='+JSON.stringify(fingerprint)+';'+
 'function tally(){document.querySelector("#count").textContent="검토 "+nodes.filter(n=>n.querySelector("input:checked")).length+"/48";}'+
 'function save(){const reviews=nodes.map(n=>({id:n.dataset.id,vote:n.querySelector("input:checked")?.value??null,'+
 'issueAxis:n.querySelector("select").value||null,note:n.querySelector("textarea").value.slice(0,500)}));'+
 'const data={schemaVersion:"yeoul-historical-variant-ab-human-review-v1",keyFingerprint:fp,reviews};'+
 'const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});'+
 'const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;'+
 'a.download="yeoul-historical-ab-human-review.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}'+
 'nodes.forEach(n=>n.addEventListener("change",()=>{const v=n.querySelector("input:checked")?.value;if(!["A","B"].includes(v))n.querySelector("select").value="";tally();}));'+
 'document.querySelector("#save").addEventListener("click",save);'+
 'document.querySelector("#filter").addEventListener("change",e=>nodes.forEach(n=>n.hidden=!!e.target.value&&n.dataset.question!==e.target.value));tally();'+
 '</script></body></html>';
}
/** All pair identities and historical ratings stay outside Git and out of reviewer HTML. */
export function buildHistoricalYeoulAB(original,{knownOriginalAutoFields=false,chooseSide=()=>randomInt(2)}={}){
 const source=preparePrivateYeoulForResearch(original,{knownOriginalAutoFields});
 const pairs=pairingMatrix(source),key=[];
 const displayed=pairs.map(p=>{
  const side=chooseSide();
  if(side!==0&&side!==1)fail('side');
  const left=side===0?p.baseline:p.challenger;
  const right=side===0?p.challenger:p.baseline;
  key.push({id:p.id,questionId:p.questionId,repeat:p.repeat,variant:p.variant,
   baselineSide:side===0?'A':'B',
   displayedSha256:sha(JSON.stringify([p.id,p.question,left,right]))});
  return {...p,left,right};
 });
 const keyFile={schemaVersion:'yeoul-historical-variant-ab-key-v1',
  developmentOnly:true,pairs:key};
 return {html:htmlReview(displayed,sha(JSON.stringify(keyFile))),
  keyFile,summary:historicalSummary(pairs)};
}
/** Reject altered pair identities, model output, question, review mapping, or votes. */
export function summarizeHistoricalYeoulAB(original,keyFile,review,{knownOriginalAutoFields=false}={}){
 const source=preparePrivateYeoulForResearch(original,{knownOriginalAutoFields});
 const pairs=pairingMatrix(source),expected=new Map(pairs.map(p=>[p.id,p]));
 if(!obj(keyFile)||keyFile.schemaVersion!=='yeoul-historical-variant-ab-key-v1'
  ||keyFile.developmentOnly!==true||!Array.isArray(keyFile.pairs)||keyFile.pairs.length!==48
  ||!obj(review)||review.schemaVersion!=='yeoul-historical-variant-ab-human-review-v1'
  ||review.keyFingerprint!==sha(JSON.stringify(keyFile))
  ||!Array.isArray(review.reviews)||review.reviews.length!==48)fail('review_contract');
 const key=new Map();
 for(const x of keyFile.pairs){
  const p=expected.get(x.id);
  if(!p||key.has(x.id)||x.questionId!==p.questionId||x.repeat!==p.repeat
   ||x.variant!==p.variant||!['A','B'].includes(x.baselineSide))fail('pair_binding');
  const left=x.baselineSide==='A'?p.baseline:p.challenger;
  const right=x.baselineSide==='A'?p.challenger:p.baseline;
  if(x.displayedSha256!==sha(JSON.stringify([p.id,p.question,left,right])))fail('reply_binding');
  key.set(x.id,x);
 }
 const totals={reviewed:0,baselineWins:0,challengerWins:0,ties:0,uncertain:0};
 const byVariant=Object.fromEntries(VARIANTS.map(v=>[v,{reviewed:0,baselineWins:0,challengerWins:0,ties:0,uncertain:0}]));
 const regressionAxes={},seen=new Set();
 for(const r of review.reviews){
  if(!obj(r)||!key.has(r.id)||seen.has(r.id)||![null,'A','B','tie','uncertain'].includes(r.vote)
   ||typeof r.note!=='string'||r.note.length>500
   ||![null,...DIMENSIONS].includes(r.issueAxis??null)
   ||(r.issueAxis&& !['A','B'].includes(r.vote)))fail('vote_contract');
  seen.add(r.id);
  if(r.vote===null)continue;
  const x=key.get(r.id),group=byVariant[x.variant];
  totals.reviewed++;group.reviewed++;
  const outcome=r.vote==='tie'?'ties':r.vote==='uncertain'?'uncertain':
   r.vote===x.baselineSide?'baselineWins':'challengerWins';
  totals[outcome]++;group[outcome]++;
  if(r.issueAxis){
   const label=outcome==='baselineWins'?'challenger':'baseline';
   const name=label+':'+r.issueAxis;
   regressionAxes[name]=(regressionAxes[name]??0)+1;
  }
 }
 if(seen.size!==48)fail('missing_review_rows');
 return {schemaVersion:'yeoul-historical-variant-ab-human-summary-v1',
  historical:historicalSummary(pairs),...totals,unreviewed:48-totals.reviewed,
  byVariant,regressionAxes,
  humanReviewerAuthenticated:false,independentHoldout:false,
  measuredGepaGain:false,productionEligible:false};
}
function args(argv){
 const o={};
 for(let i=0;i<argv.length;i+=2){
  if(!argv[i]?.startsWith('--')||!argv[i+1]||o[argv[i].slice(2)])fail('arguments');
  o[argv[i].slice(2)]=argv[i+1];
 }
 return o;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,...argv]=process.argv.slice(2),known=argv.includes('--known-original-unreviewed-auto-fields');
  const a=args(argv.filter(x=>x!=='--known-original-unreviewed-auto-fields'));
  if(mode==='generate'){
   for(const k of ['original','html','key','summary'])if(!a[k])fail('missing_'+k);
   const paths=['html','key','summary'].map(k=>privateOutput(a[k]));
   if(new Set(paths).size!==3)fail('duplicate_output');
   const built=buildHistoricalYeoulAB(privateInput(a.original),{knownOriginalAutoFields:known});
   writeFileSync(paths[1],JSON.stringify(built.keyFile,null,2)+'\n',{flag:'wx',mode:0o600});
   writeFileSync(paths[0],built.html,{flag:'wx',mode:0o600});
   writeFileSync(paths[2],JSON.stringify(built.summary,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:'PRIVATE_REVIEW_READY',...built.summary}));
  }else if(mode==='summarize'){
   for(const k of ['original','key','review','out'])if(!a[k])fail('missing_'+k);
   const out=privateOutput(a.out);
   const report=summarizeHistoricalYeoulAB(privateInput(a.original),
    privateInput(a.key),privateInput(a.review),{knownOriginalAutoFields:known});
   writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log(JSON.stringify({status:'HUMAN_VOTES_AGGREGATED',reviewed:report.reviewed,
    baselineWins:report.baselineWins,challengerWins:report.challengerWins,
    measuredGepaGain:false}));
  }else fail('mode');
 }catch(e){
  console.error(e.message?.startsWith('YEOUL_HISTORICAL_AB_HOLD:')?e.message:
   'YEOUL_HISTORICAL_AB_HOLD:invalid_private_input');
  process.exitCode=1;
 }
}
