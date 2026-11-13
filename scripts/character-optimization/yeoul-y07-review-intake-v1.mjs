/** Read-only local intake of the human-edited Y07 failure worksheet.
 * Exact comparison with the source-derived sheet prevents changes to archived
 * questions, answers, user comments, or labels. Review notes never leave local files.
 * Checkmarks and prose are authoring assertions, never authenticated owner approval.
 */
import { lstat, readFile, realpath, open } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrivateY07ReviewSheet } from './yeoul-y07-private-human-review-v1.mjs';

const ROOT=resolve(fileURLToPath(new URL('../../', import.meta.url)));
const within=(base,path)=>path===base||path.startsWith(base+sep);
const fail=(code)=>{ throw new Error('YEOUL_Y07_REVIEW_INTAKE_INVALID:'+code); };
const line=(value)=>typeof value==='string'&&value.length<=2000
  && !/[\u0000-\u001F\u007F]/u.test(value) && value.trim().length>0;
const VALID_OPTIONS=[
 '인격·말투 불일치',
 '한국어·대화 자연스러움 문제',
 '과도한 부드러움 또는 공격성',
 '사실·관계·기억 문제 의심 — 추가 근거 확인',
 '기존 사용자 평가와 다르게 문제 없음',
 '판단 보류',
];
const variantIds=['baseline','language_rules','conversation_examples'];
const blank='_미작성_';

/** Returns metadata only, never user-reviewed notes, archived prompts or replies. */
export function inspectPrivateY07ReviewSubmission({source,markdown,knownOriginalAutoFields=true}){
 if(typeof markdown!=='string'||markdown.length>160000||markdown.trim().length===0)
   fail('worksheet_required');
 const expected=buildPrivateY07ReviewSheet(source,{knownOriginalAutoFields}).split('\n');
 const received=markdown.replace(/\r\n?/gu,'\n').split('\n');
 if(expected.length!==received.length)fail('protected_line_count_changed');

 const editable=new Map();
 const decisionGroups=[];
 let sectionIndex=0;
 for(let i=0;i<expected.length;i++){
   if(expected[i]!=='**사람 검토 판정 (직접 작성)**')continue;
   if(sectionIndex>=6)fail('duplicate_selection_section');
   const choices=[];
   for(let c=0;c<VALID_OPTIONS.length;c++){
     const idx=i+2+c,expectedText='- [ ] '+VALID_OPTIONS[c];
     if(expected[idx]!==expectedText)fail('template_choice_structure');
     editable.set(idx,{type:'choice',sectionIndex,option:c});
     choices.push(idx);
   }
   const evidence=expected.indexOf('**관찰 근거(반드시 직접 작성):**',i+8);
   const revision=expected.indexOf('**수정 방향(선택):**',evidence+1);
   const next=expected.indexOf('**사람 검토 판정 (직접 작성)**',i+1);
   if(evidence<0||revision<0||(next>=0&&revision>=next)
       ||expected[evidence+2]!==blank||expected[revision+2]!==blank)
     fail('template_note_structure');
   editable.set(evidence+2,{type:'evidence',sectionIndex});
   editable.set(revision+2,{type:'revision',sectionIndex});
   decisionGroups.push({choices,evidence:evidence+2,revision:revision+2,
      variant:variantIds[Math.floor(sectionIndex/2)],repeat:1+sectionIndex%2});
   sectionIndex++;
 }
 if(sectionIndex!==6)fail('exact_six_review_sections_required');

 const summaryFields=['**Y07 실패의 공통 원인(직접 작성):**','**여울 규칙/표현 수정 제안(직접 작성):**'];
 for(let idx=0;idx<summaryFields.length;idx++){
   const anchor=summaryFields[idx],matches=expected.map((v,i)=>v===anchor?i:-1).filter(i=>i>=0);
   if(matches.length!==1||expected[matches[0]+2]!==blank)
     fail('template_summary_structure');
   editable.set(matches[0]+2,{type:idx===0?'summaryCause':'summaryProposal'});
 }
 const finish=expected.findIndex(x=>x==='**6건 검토 완료 여부:** - [ ] 미완료  - [ ] 전체 직접 확인');
 if(finish<0||expected.lastIndexOf(expected[finish])!==finish)
   fail('template_completion_structure');
 editable.set(finish,{type:'completion'});

 for(let i=0;i<received.length;i++){
   const allowed=editable.get(i);
   if(!allowed){
     if(received[i]!==expected[i])fail('archived_text_modified');
     continue;
   }
   const actual=received[i];
   if(allowed.type==='choice'){
     if(actual!==expected[i]&&actual!==expected[i].replace('[ ]','[x]'))
       fail('invalid_choice_line');
   }else if(allowed.type==='completion'){
     if(!/^\*\*6건 검토 완료 여부:\*\* - \[[ x]\] 미완료  - \[[ x]\] 전체 직접 확인$/u.test(actual))
       fail('invalid_completion_flags');
   }else if(actual!==blank&&!line(actual))fail('review_note_must_be_one_line');
 }
 const choicesCount=Object.fromEntries(VALID_OPTIONS.map((_,i)=>[i,0]));
 const reviews=[];
 for(const group of decisionGroups){
   const marked=group.choices.map((idx,c)=>
     received[idx]===expected[idx].replace('[ ]','[x]')?c:-1).filter(x=>x>=0);
   if(marked.length>1)fail('contradictory_human_marks');
   const choice=marked.length?marked[0]:null;
   const hasEvidence=received[group.evidence]!==blank;
   const hasRevision=received[group.revision]!==blank;
   if(choice!==null&&!hasEvidence)fail('selected_without_written_evidence');
   if(choice!==null)choicesCount[choice]++;
   reviews.push(Object.freeze({questionId:'Y07',variant:group.variant,repeat:group.repeat,
     status:choice===null?'pending':choice===5?'reviewed_pending_judgment':'review_submitted_unverified',
     selectedCategory:choice===null?null:VALID_OPTIONS[choice],
     writtenEvidencePresent:hasEvidence,writtenRevisionPresent:hasRevision}));
 }
 const reviewedCount=reviews.filter(x=>x.status==='review_submitted_unverified').length;
 const pendingCount=reviews.length-reviewedCount;
 const check=received[finish];
 const markedIncomplete=check.includes('- [x] 미완료');
 const markedComplete=check.includes('- [x] 전체 직접 확인');
 if(markedComplete&&(markedIncomplete||pendingCount>0))fail('unverified_completion_claim');
 return Object.freeze({
   schemaVersion:'yeoul-y07-private-human-review-intake-v1',
   sourceScope:'historic_development_ratings_not_independent_holdout',
   characterId:'yeoul',questionId:'Y07',
   modelId:'deepseek/deepseek-v4.1-flash-1017',
   historicalResponsesChecked:6,
   humanSelectionsProvided:reviewedCount,
   pendingOrUndecidedResponses:pendingCount,
   countsByCategory:Object.freeze(Object.fromEntries(
     VALID_OPTIONS.map((label,i)=>[label,choicesCount[i]]))),
   byCase:Object.freeze(reviews),
   completionBoxMarked:markedComplete,
   completionClaimIsAuthenticated:false,
   originalQuestionAnswerAndRatingsUntouched:true,
   humanReviewStatementsAuthenticated:false,
   ownerApprovalVerified:false,
   originalUserRatingsModified:false,
   sourceIsIndependentHoldout:false,
   approvedExamplesForPrompt:[],
   modelQualityGainEstablished:false,
   readyForPaidExperiment:false,productionEligible:false,
   externalCalls:0,decision:'HOLD_UNTIL_VERIFIED_HUMAN_REVIEW_AND_SEPARATE_30_ITEM_PACKET',
 });
}

export async function runLocalPrivateY07ReviewIntake({sourceFile,reviewFile,outputFile}){
 const paths=[sourceFile,reviewFile,outputFile];
 if(paths.some(x=>typeof x!=='string'||!x.trim()))fail('all_paths_required');
 const repo=await realpath(ROOT);
 const [source,review,output]=paths.map(path=>resolve(path));
 for(const candidate of [source,review,output])if(within(repo,candidate))fail('repository_boundary');
 const [sourceInfo,reviewInfo]=await Promise.all([lstat(source),lstat(review)]);
 if([sourceInfo,reviewInfo].some(s=>!s.isFile()||s.isSymbolicLink()||s.size>2*1024*1024))
   fail('unsafe_input');
 const [realSource,realReview,parent]=await Promise.all([realpath(source),realpath(review),realpath(dirname(output))]);
 if(within(repo,realSource)||within(repo,realReview)||within(repo,parent)
   ||within(parent,repo)||[realSource,realReview].includes(output))fail('unsafe_realpath');
 const canonicalOutput=resolve(parent,basename(output));
 if([realSource,realReview].includes(canonicalOutput))fail('overwrite_original');
 const [sourceJson,worksheet]=await Promise.all([readFile(realSource,'utf8'),readFile(realReview,'utf8')]);
 const result=inspectPrivateY07ReviewSubmission({source:JSON.parse(sourceJson),markdown:worksheet});
 const handle=await open(canonicalOutput,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(result,null,2)+'\n','utf8');}finally{await handle.close();}
 return {status:'review_submission_unverified',reviewed:result.humanSelectionsProvided,
   pending:result.pendingOrUndecidedResponses,ownerApprovalVerified:false,
   externalCalls:0,output:canonicalOutput};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 const keys=['--private-original','--reviewed-sheet','--private-result'];
 if(args.length!==6||keys.some((k,i)=>args[2*i]!==k)){
   console.error('Usage: node yeoul-y07-review-intake-v1.mjs --private-original /local/288.json --reviewed-sheet /local/review.md --private-result /local/result.json');
   process.exitCode=1;
 }else{
   runLocalPrivateY07ReviewIntake({sourceFile:args[1],reviewFile:args[3],outputFile:args[5]})
    .then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{console.error('YEOUL_Y07_REVIEW_INTAKE_REFUSED');process.exitCode=1;});
 }
}
