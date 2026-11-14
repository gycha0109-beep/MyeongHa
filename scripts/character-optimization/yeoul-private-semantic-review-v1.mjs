/** Private human semantic-overlap review for the 12 archived Yeoul questions and 8 development families.
 * No provider transport, approval, dataset promotion, or public private-text output.
 */
import { readFileSync } from 'node:fs';
import { readFile, lstat, realpath, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePrivateYeoulForResearch } from './yeoul-private-source-intake-v1.mjs';
import { screenPrivateYeoulOverlap } from './yeoul-pilot-readiness-v1.mjs';
import { YEOUL_NEW_FAMILY_DRAFTS, makeNewYeoulScenarioPlan } from './yeoul-new-scenario-families-v1.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TEMPLATE = readFileSync(new URL('./yeoul-private-semantic-review-template-v1.html', import.meta.url), 'utf8');
const IDS = Object.freeze(Array.from({length:12}, (_,i) => 'Y'+String(i+1).padStart(2,'0')));
const FAMILY_IDS = Object.freeze(YEOUL_NEW_FAMILY_DRAFTS.map(x => x.familyId));
const fail = reason => { throw new Error('YEOUL_SEMANTIC_REVIEW_INVALID:'+reason); };
const own = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const inside = (root, path) => path === root || path.startsWith(root + sep);
const escape = text => String(text).replace(/&/gu,'&amp;').replace(/</gu,'&lt;')
  .replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;');
const exactly = (obj, fields) => own(obj) &&
  Object.keys(obj).sort().join('|') === fields.slice().sort().join('|');

function archivedQuestions(original, knownOriginalAutoFields) {
  const prepared = preparePrivateYeoulForResearch(original, {knownOriginalAutoFields});
  const questions = new Map();
  for (const row of prepared.responses) if (!questions.has(row.id)) questions.set(row.id,row.input);
  if (questions.size !== 12 || IDS.some(id => !questions.has(id))) fail('legacy_questions');
  const screen = screenPrivateYeoulOverlap(IDS.map(id => ({id,turns:[questions.get(id)]})));
  const plan = makeNewYeoulScenarioPlan();
  if (screen.candidateFamiliesScreened !== 8 || plan.metadata.length !== 8) fail('family_plan');
  return questions;
}

/** The HTML is private and standalone: escaped original text and no external resources. */
export function buildPrivateSemanticReviewHtml(original, {knownOriginalAutoFields=false}={}) {
  if (typeof knownOriginalAutoFields !== 'boolean') fail('source_mode');
  const questions = archivedQuestions(original, knownOriginalAutoFields);
  const originals = IDS.map(id => '<section><h3>'+id+'</h3><pre>'+escape(questions.get(id))+'</pre></section>').join('\n');
  const families = YEOUL_NEW_FAMILY_DRAFTS.map((f,i) =>
    '<section class="candidate" data-family="'+escape(f.familyId)+'"><h3>'+(i+1)+'. '+escape(f.familyId)+'</h3>'
    +'<p>분할: '+escape(f.split)+' · 검토 초안 (독립 평가 아님)</p>'
    +f.turns.map((turn,j)=>'<pre>턴 '+(j+1)+': '+escape(turn)+'</pre>').join('')
    +'<label>의미 중복 판정<select class="decision"><option value="pending">미검토</option>'
    +'<option value="distinct">의미상 중복 없음</option><option value="overlap">기존 질문과 의미 중복</option>'
    +'<option value="hold">판단 보류</option></select></label>'
    +'<label>겹치는 기존 질문 ID (중복일 때만, 예: Y01,Y02)<input class="overlaps" placeholder="Y01,Y02"></label>'
    +'<label>판정 근거 (판정·보류 시 필수)<textarea class="evidence" maxlength="1500"></textarea></label></section>'
  ).join('\n');
  if (!TEMPLATE.includes('<!-- PRIVATE_QUESTIONS -->') || !TEMPLATE.includes('<!-- DRAFT_FAMILIES -->'))
    fail('template_markers');
  return TEMPLATE.replace('<!-- PRIVATE_QUESTIONS -->', originals)
    .replace('<!-- DRAFT_FAMILIES -->', families);
}

/** Accept human decisions only. Neither form completeness nor selected text authenticates the reviewer. */
export function inspectPrivateSemanticReviewDraft(original, draft, {knownOriginalAutoFields=false}={}) {
  archivedQuestions(original, knownOriginalAutoFields);
  if (!exactly(draft,['schemaVersion','cases']) ||
    draft.schemaVersion !== 'yeoul-private-semantic-review-draft-v1' ||
    !Array.isArray(draft.cases) || draft.cases.length !== 8) fail('draft_schema');
  const counts={pending:0,distinct:0,overlap:0,hold:0};
  const overlapFamilies=[];
  for (const [index,item] of draft.cases.entries()) {
    if (!exactly(item,['familyId','decision','overlapIds','evidence']) ||
      item.familyId !== FAMILY_IDS[index] ||
      !Object.hasOwn(counts,item.decision) || !Array.isArray(item.overlapIds) ||
      typeof item.evidence !== 'string' || item.evidence.length > 1500) fail('case_shape');
    if (item.overlapIds.some(id=>!IDS.includes(id)) ||
      new Set(item.overlapIds).size !== item.overlapIds.length) fail('legacy_reference');
    const hasEvidence = item.evidence.trim().length>0;
    if (item.decision === 'pending') {
      if(hasEvidence||item.overlapIds.length)fail('unreviewed_with_decision');
    } else if (!hasEvidence) fail('evidence_required');
    if(item.decision==='overlap' && item.overlapIds.length === 0)fail('overlap_references_required');
    if(item.decision!=='overlap' && item.overlapIds.length !== 0)fail('unexpected_overlap_references');
    counts[item.decision]++;
    if(item.decision==='overlap')overlapFamilies.push(item.familyId);
  }
  return Object.freeze({
    schemaVersion:'yeoul-private-semantic-review-summary-v1',
    originalQuestionsCompared:12, draftFamiliesCompared:8,
    counts, overlapFamilyIds:overlapFamilies,
    reviewEntriesRecorded:counts.distinct+counts.overlap,
    unresolvedFamilies:counts.pending+counts.hold,
    sourceBytesAuthenticated:false, reviewerIdentityVerified:false,
    independentSemanticReviewVerified:false, independentFinalHoldoutReady:false,
    optimizerInputAuthorized:false, ownerApprovalVerified:false,
    paidExecutionReady:false, externalCalls:0, productionEligible:false,
  });
}

async function privateFile(path, maxBytes) {
  const target=resolve(path), root=await realpath(ROOT);
  if (inside(root,target)) fail('repository_source');
  const stat=await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size>maxBytes) fail('unsafe_input');
  const actual=await realpath(target);
  if (inside(root,actual)) fail('repository_source');
  return {path:actual,content:await readFile(actual,'utf8')};
}
async function privateOutput(path, ext) {
  const root=await realpath(ROOT), absolute=resolve(path);
  if (!absolute.endsWith(ext) || inside(root,absolute)) fail('unsafe_output');
  const parent=await realpath(dirname(absolute));
  if (inside(root,parent) || inside(parent,root)) fail('unsafe_output');
  return resolve(parent,basename(absolute));
}
/** Never overwrite an existing private report, source or draft. */
export async function runPrivateSemanticReview({input,output,draft=null,knownOriginalAutoFields=false}) {
  if (typeof input!=='string'||!input.trim()||typeof output!=='string'||!output.trim()
      || typeof knownOriginalAutoFields!=='boolean') fail('arguments');
  const source=await privateFile(input,2*1024*1024);
  const original=JSON.parse(source.content);
  const target=await privateOutput(output,draft===null?'.html':'.json');
  if(target===source.path)fail('source_overwrite');
  let content, report;
  if(draft===null){
    content=buildPrivateSemanticReviewHtml(original,{knownOriginalAutoFields});
    report={status:'private_review_sheet_pending',originals:12,families:8,
      ownerApprovalVerified:false,externalCalls:0,productionEligible:false};
  }else{
    if(typeof draft!=='string'||!draft.trim())fail('draft_path');
    const candidate=await privateFile(draft,64*1024);
    if(candidate.path===target)fail('draft_overwrite');
    report=inspectPrivateSemanticReviewDraft(original,JSON.parse(candidate.content),{knownOriginalAutoFields});
    content=JSON.stringify(report,null,2)+'\n';
  }
  await writeFile(target,content,{flag:'wx',mode:0o600});
  return report;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  const known= args.at(-1)==='--known-original-unreviewed-auto-fields';
  if(known)args.pop();
  let options;
  if(args.length===5 && args[0]==='generate' && args[1]==='--private-original' && args[3]==='--private-html-output'){
    options={input:args[2],output:args[4],knownOriginalAutoFields:known};
  }else if(args.length===7 && args[0]==='intake' && args[1]==='--private-original' &&
    args[3]==='--review-draft' && args[5]==='--private-result'){
    options={input:args[2],draft:args[4],output:args[6],knownOriginalAutoFields:known};
  }else {
    console.error('YEOUL_PRIVATE_SEMANTIC_REVIEW_USAGE');
    process.exitCode=2;
  }
  if(options)runPrivateSemanticReview(options)
    .then(x=>console.log(JSON.stringify(x)))
    .catch(()=>{console.error('YEOUL_PRIVATE_SEMANTIC_REVIEW_REFUSED');process.exitCode=1;});
}
