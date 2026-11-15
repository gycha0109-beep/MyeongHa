/** Local-only six-response DeepSeek/Y07 review, with no model calls or approvals. */
import { readFileSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrivateY07ReviewSheet } from './yeoul-y07-private-human-review-v1.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const VARIANTS = ['baseline', 'language_rules', 'conversation_examples'];
const fail = code => { throw new Error('YEOUL_Y07_BROWSER_REVIEW_INVALID:' + code); };
const within = (root, target) => target === root || target.startsWith(root + sep);
const html = value => String(value ?? '').replace(/&/gu,'&amp;').replace(/</gu,'&lt;')
  .replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');
const choices = [
  ['pending','미검토'],
  ['persona','인격·말투 불일치'],
  ['korean_naturalness','한국어·대화 자연스러움 문제'],
  ['excessive_softness','과도한 부드러움'],
  ['excessive_aggression','과도한 공격성'],
  ['unverified_fact_or_memory_suspected','사실·관계·기억 문제 의심 — 추가 근거 확인'],
  ['no_issue_on_review','검토 결과 해당 응답에 문제 없음'],
  ['hold','판단 보류']
];
const options = choices.map(([key,label]) =>
  '<option value="'+html(key)+'">'+html(label)+'</option>').join('');
const template = readFileSync(new URL('./yeoul-y07-review-template-v1.html',import.meta.url),'utf8');

export function buildPrivateY07BrowserReview(source,{knownOriginalAutoFields=true}={}) {
  // Validate complete 288-row export and zero good ratings for six Y07/DeepSeek responses.
  buildPrivateY07ReviewSheet(source,{knownOriginalAutoFields});
  const rows=source.responses.filter(row=>row.id==='Y07'&&row.model===MODEL)
    .sort((a,b)=>VARIANTS.indexOf(a.variant)-VARIANTS.indexOf(b.variant)||a.repeat-b.repeat);
  if(rows.length!==6)fail('six_replies_required');
  const cards=rows.map((row,i)=>{
    const key=row.variant+':'+row.repeat;
    return '<section class="case" data-case="'+html(key)+'">'
      +'<header><h2>'+(i+1)+'. Y07 · '+html(row.variant)+' · '+row.repeat+'회</h2>'
      +'<span class="chip">기존 사용자 평가: '+html(row.evaluation.rating)+'</span></header>'
      +'<details><summary>당시 질문·응답·사용자 의견 확인</summary>'
      +'<h3>당시 질문</h3><pre>'+html(row.input)+'</pre>'
      +'<h3>당시 DeepSeek 응답</h3><pre>'+html(row.reply)+'</pre>'
      +'<h3>기존 사용자 의견</h3><pre>'+html(row.evaluation.note||'(기록 없음)')+'</pre></details>'
      +'<label>주요 판정<select data-field="decision" data-key="'+html(key)+'">'+options+'</select></label>'
      +'<label>관찰 근거 (판정 시 필수)<textarea data-field="evidence" data-key="'+html(key)
      +'" maxlength="1500" placeholder="이 장면의 인격·언어·관계·기억 문제를 구체적으로 적으세요."></textarea></label>'
      +'<label>수정 방향 (선택)<textarea data-field="direction" data-key="'+html(key)
      +'" maxlength="1500" placeholder="사용자 평가 원문을 고치지 않고 개선 방향만 적으세요."></textarea></label>'
      +'<p class="status" data-status="'+html(key)+'">미검토</p></section>';
  }).join('\n');
  if(!template.includes('<!-- PRIVATE_Y07_CASES -->'))fail('template_marker_missing');
  return template.replace('<!-- PRIVATE_Y07_CASES -->',cards);
}

export async function writePrivateY07BrowserReview({input,output}) {
  if(typeof input!=='string'||!input.trim()||typeof output!=='string'||!output.trim())fail('paths_required');
  if(!/\.html?$/iu.test(output))fail('html_extension_required');
  const root=await fsp.realpath(ROOT),src=resolve(input),dst=resolve(output);
  if(within(root,src)||within(root,dst))fail('repository_boundary');
  const stat=await fsp.lstat(src);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)fail('invalid_source');
  const sourcePath=await fsp.realpath(src),outDir=await fsp.realpath(dirname(dst));
  if(within(root,sourcePath)||within(root,outDir)||within(outDir,root))fail('repository_boundary');
  const target=resolve(outDir,basename(dst));
  if(sourcePath===target)fail('source_overwrite');
  const body=buildPrivateY07BrowserReview(JSON.parse(await fsp.readFile(sourcePath,'utf8')));
  const handle=await fsp.open(target,'wx',0o600);
  try{await handle.writeFile(body,'utf8');}finally{await handle.close();}
  return Object.freeze({status:'unreviewed_local_html',rows:6,
    humanApprovalVerified:false,externalCalls:0,productionEligible:false,output:target});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const a=process.argv.slice(2);
  if(a.length!==4||a[0]!=='--private-original'||a[2]!=='--private-html-output') {
    console.error('Usage: node yeoul-y07-private-browser-review-v1.mjs --private-original /private/288.json --private-html-output /private/y07-review.html');
    process.exitCode=1;
  } else {
    writePrivateY07BrowserReview({input:a[1],output:a[3]})
      .then(x=>console.log(JSON.stringify(x)))
      .catch(()=>{console.error('YEOUL_Y07_PRIVATE_BROWSER_REFUSED');process.exitCode=1;});
  }
}
