/** Private, local-only companion for the existing 6-rule/24-example review packet.
 * Negative historical replies NEVER become approved example candidates.
 */
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectHistoricalDeepseekFailures } from './yeoul-deepseek-legacy-triage-v1.mjs';

const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const VARIANTS = ['baseline', 'language_rules', 'conversation_examples'];
const QUESTION_IDS = Array.from({ length: 12 }, (_, i) => 'Y'+String(i+1).padStart(2,'0'));
const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const deny = code => { throw new Error('YEOUL_Y07_SUPPLEMENT_INVALID:' + code); };
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const inside = (root,path) => path === root || path.startsWith(root+sep);
const keyOf = x => [x.id,x.variant,x.repeat,x.model].join('|');

/** Only review references and preexisting ratings. No private dialogue leaves this function. */
export function buildY07ReviewSupplement({ evaluationExport, exampleQueue, knownOriginalAutoFields = false }) {
  const triage=inspectHistoricalDeepseekFailures(evaluationExport,{knownOriginalAutoFields});
  if (!obj(exampleQueue) || exampleQueue.schemaVersion !== 'yeoul-example-review-queue-v1'
      || exampleQueue.datasetRole !== 'legacy_development_only'
      || exampleQueue.sourceExperimentRunId !== 42572722295
      || exampleQueue.queuedCount !== 24 || !Array.isArray(exampleQueue.queue)
      || exampleQueue.queue.length !== 24 || exampleQueue.humanApprovedCount !== 0)
    deny('original_24_unapproved_example_queue_required');

  const counts=new Map(QUESTION_IDS.map(id=>[id,0])), keys=new Set();
  for(const item of exampleQueue.queue){
    if(!obj(item)||!QUESTION_IDS.includes(item.sourceQuestionId)
       || typeof item.sourceKey!=='string'||keys.has(item.sourceKey)
       || item.reviewStatus!=='pending_canon_and_language_review'
       || item.datasetRole!=='legacy_development_only'||item.userRating!=='good'
       || item.reviewEvidence!==null || ![1,2].includes(item.priority)
       || !['z-ai/glm-5.3-flash',MODEL,'minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'].includes(item.model)
       || !VARIANTS.includes(item.variant)||![1,2].includes(item.repeat)
       || item.sourceKey!==[item.sourceQuestionId,item.variant,item.repeat,item.model].join('|'))
      deny('invalid_or_approved_example');
    const row=evaluationExport.responses.find(r=>keyOf(r)===item.sourceKey);
    if(!row||row.evaluation.rating!=='good'||typeof row.evaluation.note==='string'&&row.evaluation.note.trim()
       || Array.isArray(row.evaluation.details)&&row.evaluation.details.length
       || row.input!==item.sourcePrompt||row.reply!==item.candidateReply)
      deny('queue_source_does_not_match');
    keys.add(item.sourceKey);
    counts.set(item.sourceQuestionId,counts.get(item.sourceQuestionId)+1);
  }
  if([...counts.values()].some(n=>n!==2))deny('24_example_coverage');
  const all=VARIANTS.flatMap(variant=>[1,2].map(repeat=>{
    const row=evaluationExport.responses.find(x=>x.id==='Y07'&&x.model===MODEL&&x.variant===variant&&x.repeat===repeat);
    if(!row||row.evaluation.rating==='good')deny('y07_failure_source_mismatch');
    const sourceKey=keyOf(row);
    if(keys.has(sourceKey))deny('negative_reply_in_positive_example_queue');
    return Object.freeze({sourceKey,questionId:'Y07',variant,repeat,
      originalUserRating:row.evaluation.rating,
      reviewStatus:'pending_human_failure_diagnosis',
      authorizedExample:false,reviewedCanonViolation:false,
      reviewChecks:Object.freeze([
        'read_original_private_question_and_reply_locally',
        'compare_with_yeoul_bible_and_runtime',
        'record_actual_failure_or_disagreement',
        'do_not_relabel_original_user_rating'
      ])});
  }));
  const y07=triage.byQuestion.find(x=>x.questionId==='Y07');
  if(!y07||y07.userRatedNonGood!==6||all.length!==6)deny('y07_not_six_negative');
  return Object.freeze({
    schemaVersion:'yeoul-y07-private-review-supplement-v1',
    sourceExperimentRunId:42572722295,modelId:MODEL,datasetRole:'legacy_development_only',
    existingReviewPacket:{rules:6,cleanPositiveExamples:24,approved:0,
      sourceSchema:'yeoul-example-review-queue-v1',mutated:false},
    failureSupplement:{questionId:'Y07',cases:all,caseCount:6,source:'historical_user_ratings',
      separateFromExistingThirty:true},
    originalSourceRewritten:false, privateQuestionOrReplyExported:false,
    privateUserNotesExported:false,ownerReviewVerified:false,
    approvedRulesForPrompt:[],approvedExamplesForPrompt:[],
    realQualityImprovementEstablished:false,externalCalls:0,
    status:'HOLD_FOR_HUMAN_FAILURE_REVIEW_NOT_A_30_ITEM_APPROVAL'
  });
}

async function main(){
  const args=process.argv.slice(2),flags=['--private-original','--private-queue','--out'];
  if(args.length!==6||flags.some((flag,i)=>args[i*2]!==flag||!args[i*2+1]))deny('cli');
  const input=resolve(args[1]),queue=resolve(args[3]),out=resolve(args[5]);
  const parent=await realpath(dirname(out));
  const output=resolve(parent,out.split(sep).at(-1));
  if(inside(ROOT,input)||inside(ROOT,queue)||inside(ROOT,output)||output===input||output===queue
     ||!(await stat(parent)).isDirectory())deny('private_files_outside_repo_required');
  const [raw,review]=await Promise.all([readFile(input,'utf8'),readFile(queue,'utf8')]);
  const report=buildY07ReviewSupplement({evaluationExport:JSON.parse(raw),
    exampleQueue:JSON.parse(review),knownOriginalAutoFields:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:report.status,caseCount:6,reviewQueueUnchanged:true,
    externalCalls:0,output}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{console.error('YEOUL_Y07_PRIVATE_REVIEW_SUPPLEMENT_REFUSED');process.exitCode=1;});
}
