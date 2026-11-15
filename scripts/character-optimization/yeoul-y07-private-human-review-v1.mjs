/** Local-only review sheet for six archived DeepSeek/Y07 replies.
 * The result deliberately contains private dialogue: never upload to git/CI.
 * Human choices are blank; this is not a review approval or GEPA evaluation.
 */
import { readFile, lstat, realpath, mkdir, open } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectHistoricalDeepseekFailures } from './yeoul-deepseek-legacy-triage-v1.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const VARIANTS = ['baseline','language_rules','conversation_examples'];
const fail = code => { throw new Error('YEOUL_Y07_PRIVATE_REVIEW_INVALID:' + code); };
const safe = v => String(v ?? '').replace(/\r\n?/gu,'\n').replace(/\u0000/gu,'');
const inRoot = (root,path) => path === root || path.startsWith(root + sep);
const codeFence = content => {
  // Pick a delimiter strictly longer than any fence in private dialogue.
  const runs = safe(content).match(/`+/gu) ?? [];
  const longest = runs.reduce((n, s) => Math.max(n, s.length), 2);
  const delim = '`'.repeat(longest + 1);
  return delim + 'text\n' + safe(content) + '\n' + delim;
};

export function buildPrivateY07ReviewSheet(source, {knownOriginalAutoFields = true} = {}) {
  const audit = inspectHistoricalDeepseekFailures(source,{knownOriginalAutoFields});
  const result = audit.byQuestion.find(row => row.questionId === 'Y07');
  if (!result || result.count !== 6 || result.userRatedGood !== 0)
    fail('expected_six_actual_non_good_responses');
  const rows = source.responses.filter(row => row.model === MODEL && row.id === 'Y07')
    .sort((a,b) => VARIANTS.indexOf(a.variant) - VARIANTS.indexOf(b.variant) || a.repeat - b.repeat);
  if (rows.length !== 6 || new Set(rows.map(row => row.variant+':'+row.repeat)).size !== 6)
    fail('source_coverage');
  const out = [
    '# 여울 DeepSeek Y07 기존 실패 6건 — 비공개 사람 검토',
    '',
    '> **로컬 비공개 자료입니다. GitHub·CI·외부 모델에 올리지 마세요.**',
    '> 기존 개발 평가 원본에서 추출한 문항입니다. 신규 모델 실행·GEPA 개선·독립 홀드아웃·사용자 승인 증거가 아닙니다.',
    '> 사용자 평점은 기존 의견이며, 사실/기억/Canon 위반의 확인된 판정이 아닙니다.',
    '',
    '## 검토 기준',
    '',
    '- 여울 Bible·Runtime R16 기준으로 각각 대화의 인격, 한국어 자연스러움, 응답 태도, 관계 경계, 허위 기억 가능성을 확인합니다.',
    '- 각 항목의 판정은 **미검토**로 남겨 둡니다. 검토 후 하나만 표시하고 근거를 직접 기록합니다.',
    '- 여울 30건 규칙·좋은 대사 검토와 **별개**입니다. 이 6건을 승인된 좋은 대사로 전환하지 않습니다.',
    ''
  ];
  for (const [n,row] of rows.entries()) {
    out.push(
      '## '+(n+1)+'. Y07 · '+row.variant+' · 반복 '+row.repeat,
      '',
      '**기존 사용자 평가:** '+safe(row.evaluation.rating),
      '',
      '**당시 질문**',
      '',
      codeFence(row.input),
      '',
      '**당시 DeepSeek 응답**',
      '',
      codeFence(row.reply),
      '',
      '**기존 사용자 의견**',
      '',
      codeFence(row.evaluation.note ?? '(기록 없음)'),
      '',
      '**사람 검토 판정 (직접 작성)**',
      '',
      '- [ ] 인격·말투 불일치',
      '- [ ] 한국어·대화 자연스러움 문제',
      '- [ ] 과도한 부드러움 또는 공격성',
      '- [ ] 사실·관계·기억 문제 의심 — 추가 근거 확인',
      '- [ ] 기존 사용자 평가와 다르게 문제 없음',
      '- [ ] 판단 보류',
      '',
      '**관찰 근거(반드시 직접 작성):**',
      '',
      '_미작성_',
      '',
      '**수정 방향(선택):**',
      '',
      '_미작성_',
      ''
    );
  }
  out.push('## 종합 의견', '', '**Y07 실패의 공통 원인(직접 작성):**', '', '_미작성_',
    '', '**여울 규칙/표현 수정 제안(직접 작성):**', '', '_미작성_', '',
    '**6건 검토 완료 여부:** - [ ] 미완료  - [ ] 전체 직접 확인', '',
    '> 체크 여부만으로 사용자 승인·모델 품질 개선·운영 배포가 허용되지 않습니다.', '');
  return out.join('\n');
}

export async function writePrivateY07ReviewSheet({input,output}) {
  if(typeof input!=='string'||typeof output!=='string'||!input.trim()||!output.trim()) fail('paths_required');
  const sourcePath=resolve(input),outputPath=resolve(output);
  const repo=await realpath(ROOT);
  if(inRoot(repo,sourcePath)||inRoot(repo,outputPath)) fail('repository_boundary');
  const meta=await lstat(sourcePath);
  if(!meta.isFile()||meta.isSymbolicLink()||meta.size>2*1024*1024) fail('unsafe_source');
  const canonicalSource=await realpath(sourcePath);
  if(inRoot(repo,canonicalSource)) fail('repository_source');
  const data=JSON.parse(await readFile(canonicalSource,'utf8'));
  const markdown=buildPrivateY07ReviewSheet(data);
  const targetDir=await realpath(dirname(outputPath));
  if(inRoot(repo,targetDir)||inRoot(targetDir,repo)) fail('unsafe_output_directory');
  const target=resolve(targetDir,outputPath.split(sep).at(-1));
  if(inRoot(repo,target)||target===canonicalSource) fail('unsafe_target');
  const handle=await open(target,'wx',0o600);
  try { await handle.writeFile(markdown,{encoding:'utf8'}); } finally { await handle.close(); }
  return {status:'private_manual_review_pending',y07Cases:6,ownerApproved:false,
    externalCalls:0,productionEligible:false,output:target};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length!==4||args[0]!=='--private-original'||args[2]!=='--private-output'){
    console.error('Usage: node yeoul-y07-private-human-review-v1.mjs --private-original /local/288.json --private-output /local/review.md');
    process.exitCode=1;
  }else{
    writePrivateY07ReviewSheet({input:args[1],output:args[3]})
      .then(report=>console.log(JSON.stringify(report)))
      .catch(()=>{console.error('YEOUL_Y07_PRIVATE_REVIEW_REFUSED');process.exitCode=1;});
  }
}
