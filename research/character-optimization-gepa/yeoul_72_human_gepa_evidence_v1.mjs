/** Real (human) feedback for a single completed Yeoul GEPA candidate.
 * Compares historical DeepSeek responses to newly generated DeepSeek responses.
 * The old 12 questions are development-only; no candidate is promoted or re-scored
 * without its own new model responses and independent human review.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPairedPlan} from './yeoul_288_paid_pair_preflight_v1.mjs';
import {buildBlindReview,summarizeBlindReview} from './yeoul_72_blind_comparison_v1.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const fail=reason=>{throw Error('YEOUL_HUMAN_GEPA_HOLD:'+reason)};
const hash=value=>createHash('sha256').update(value).digest('hex');
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const count=n=>Number.isSafeInteger(n)&&n>=0;
const questionIds=Object.freeze(Array.from({length:12},(_,i)=>'Y'+String(i+1).padStart(2,'0')));

function privateDestination(path){
 const absolute=resolve(path);
 const directory=realpathSync(dirname(absolute));
 for(const p of [absolute,directory]){
  const rel=relative(repo,p);
  if(!rel||rel==='.'||(!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith('../')))fail('output_inside_repository');
 }
}

/** Review/answer attribution is verified against all original and new reply bytes.
 * Merely passing a review with a matching key hash is NOT sufficient.
 */
export function buildYeoulHumanGepaEvidence({original,candidate,actual,key,review}){
 const plan=buildPairedPlan(original,candidate);
 const rowsByKey=new Map((actual?.rows??[]).map(r=>[r.legacyKey,r]));
 if(rowsByKey.size!==72||plan.tasks.some(t=>
   rowsByKey.get(t.legacyKey)?.promptSha256!==hash(JSON.stringify(t.messages))))
  fail('actual_prompt_binding');
 if(!isObject(key)||!Array.isArray(key.pairs)||key.pairs.length!==72
    ||key.candidateSha256!==plan.candidateSha256
    ||key.sourceProtocolSha256!==plan.sourceProtocolSha256)fail('unbound_key');
 const sideByKey=new Map();
 for(const entry of key.pairs){
  if(!isObject(entry)||typeof entry.id!=='string'||sideByKey.has(entry.id)
   ||!questionIds.includes(entry.questionId)
   ||!['A','B'].includes(entry.legacySide))fail('invalid_blind_key');
  sideByKey.set(entry.id,entry);
 }
 // Rebuild the 72 displayed pairs using the private originals and actual outputs.
 // A changed output, pairing or position cannot silently acquire valid evidence.
 let index=0;
 const regenerated=buildBlindReview({original,candidate,actual},()=>{
  const task=plan.tasks[index++];
  const entry=sideByKey.get(task.legacyKey);
  if(!entry||entry.questionId!==task.id)fail('blind_key_question_mismatch');
  return entry.legacySide==='A'?0:1;
 });
 if(index!==72||hash(JSON.stringify(regenerated.keyFile))!==hash(JSON.stringify(key)))
  fail('blind_key_not_bound_to_actual_run');
 const summary=summarizeBlindReview(key,review);
 if(summary.candidateSha256!==plan.candidateSha256||summary.total!==72)
  fail('candidate_mismatch');

 const families=questionIds.map(id=>{
  const s=summary.byQuestion[id]??{reviewed:0,candidateWins:0,legacyWins:0,ties:0,uncertain:0};
  const {reviewed,candidateWins,legacyWins,ties,uncertain}=s;
  if(![reviewed,candidateWins,legacyWins,ties,uncertain].every(count)
    ||reviewed>6||candidateWins+legacyWins+ties+uncertain!==reviewed)
    fail('invalid_family_counts');
  const decided=candidateWins+legacyWins+ties;
  return {questionId:id,pairs:6,reviewed,unreviewed:6-reviewed,
   candidateWins,legacyWins,ties,uncertain,decided,
   candidateRegressionAxes:{...(s.candidateRegressionAxes??{})},
   legacyRegressionAxes:{...(s.legacyRegressionAxes??{})},
   observedCandidateShare:decided?Number(((candidateWins+ties*0.5)/decided).toFixed(6)):null};
 });
 const allReviewed=summary.reviewed===72;
 const everyFamilyScorable=families.every(f=>f.decided>0);
 const anyObservedRegression=families.some(f=>f.legacyWins>f.candidateWins);
 // Development-only feedback can diagnose a single already-tested candidate.
 // GEPA may NOT interpret these scores as evaluation of a newly mutated prompt.
 return Object.freeze({
  schemaVersion:'yeoul-72-human-preference-gepa-evidence-v1',
  candidateSha256:plan.candidateSha256,
  protocolSha256:plan.sourceProtocolSha256,
  modelId:'deepseek/deepseek-v4.1-flash-1017',
  evidenceScope:'historical_development_questions_only',
  reviewed:summary.reviewed,unreviewed:summary.unreviewed,
  candidateWins:summary.candidateWins,legacyWins:summary.legacyWins,
  ties:summary.ties,uncertain:summary.uncertain,
  candidateRegressionAxes:{...summary.candidateRegressionAxes},
  legacyRegressionAxes:{...summary.legacyRegressionAxes},
  historicalModelGenerationsSeparatedInTime:true,
  familyEvidence:families,
  allHumanVotesRecorded:allReviewed,
  everyFamilyHasDecidedVote:everyFamilyScorable,
  anyObservedFamilyPreferenceRegression:anyObservedRegression,
  developmentDiagnosticsComplete:allReviewed&&everyFamilyScorable,
  feedbackBoundToSingleCandidate:true,
  feedbackAxisAttribution:'human_selected_on_definite_preference_only',
  reviewedCandidateRegressionAxisRanking:Object.entries(summary.candidateRegressionAxes)
   .sort(([a,n],[b,m])=>m-n||a.localeCompare(b)).map(([axis,count])=>({axis,count})),
  scoresUsableToJudgeUnseenGepaMutations:false,
  reviewerIdentityAuthenticated:false,
  providerReceiptsAuthenticated:false,
  independentBlindHoldoutPassed:false,
  qualityGainEstablished:false,
  productionEligible:false,
 });
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){
   if(!args[i]?.startsWith('--')||!args[i+1])fail('invalid_arguments');
   options[args[i].slice(2)]=args[i+1];
  }
  for(const name of ['original','candidate','actual','key','review','out']){
   if(!options[name])fail('missing_'+name);
  }
  privateDestination(options.out);
  const evidence=buildYeoulHumanGepaEvidence({
   original:JSON.parse(readFileSync(options.original,'utf8')),
   candidate:JSON.parse(readFileSync(options.candidate,'utf8')),
   actual:JSON.parse(readFileSync(options.actual,'utf8')),
   key:JSON.parse(readFileSync(options.key,'utf8')),
   review:JSON.parse(readFileSync(options.review,'utf8')),
  });
  writeFileSync(options.out,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({status:evidence.developmentDiagnosticsComplete?'DEVELOPMENT_FEEDBACK_READY':'PARTIAL_HUMAN_REVIEW',
   reviewed:evidence.reviewed,unreviewed:evidence.unreviewed,
   qualityGainEstablished:false,externalModelCalls:0}));
 }catch(error){
  console.error(error.message?.startsWith('YEOUL_HUMAN_GEPA_HOLD:')
   ?error.message:'YEOUL_HUMAN_GEPA_HOLD:cannot_verify_private_evidence');
  process.exitCode=1;
 }
}