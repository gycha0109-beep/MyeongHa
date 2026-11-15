/** Import a locally authored browser Y07 JSON draft into the existing
 * source-locked, metadata-only Markdown review intake.
 * Assertions made inside JSON NEVER confer owner review authority.
 */
import { readFile, realpath, lstat, open } from 'node:fs/promises';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrivateY07ReviewSheet } from './yeoul-y07-private-human-review-v1.mjs';
import { inspectPrivateY07ReviewSubmission } from './yeoul-y07-review-intake-v1.mjs';

const ROOT=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const MODEL='deepseek/deepseek-v4.1-flash-1017';
const OPTION_MAP=Object.freeze({
  pending:null,
  persona:'인격·말투 불일치',
  korean_naturalness:'한국어·대화 자연스러움 문제',
  excessive_softness:'과도한 부드러움 또는 공격성',
  excessive_aggression:'과도한 부드러움 또는 공격성',
  unverified_fact_or_memory_suspected:'사실·관계·기억 문제 의심 — 추가 근거 확인',
  no_issue_on_review:'기존 사용자 평가와 다르게 문제 없음',
  hold:'판단 보류',
});
const KEYS=Object.freeze(['baseline:1','baseline:2','language_rules:1',
  'language_rules:2','conversation_examples:1','conversation_examples:2']);
const DOCUMENT_FIELDS=Object.freeze(['schemaVersion','sourceExperimentRunId','datasetRole',
 'characterId','modelId','questionId','decisions','enteredCount','allEntriesEntered',
 'reviewerAuthorityVerified','ownerApproved','canonViolationConfirmed',
 'independentQualityGainEstablished','externalCalls','productionEligible']);
const ENTRY_FIELDS=Object.freeze(['key','decision','evidence','direction']);
const denial=reason=>{throw new Error('YEOUL_Y07_BROWSER_DRAFT_INTAKE_INVALID:'+reason);};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,fields)=>plain(x)&&Object.keys(x).sort().join('|')===[...fields].sort().join('|');
const within=(parent,target)=>target===parent||target.startsWith(parent+sep);
const clean=value=>{
 if(typeof value!=='string'||value.length>1500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value))
   denial('invalid_review_note');
 const line=value.trim().replace(/\s+/gu,' ');
 if(line.length>1500)denial('note_too_long');
 return line;
};

/** Return only trusted metadata counts; original reply, prompt and human prose are omitted. */
export function inspectPrivateY07BrowserDraft({source,draft,knownOriginalAutoFields=true}) {
 if(!exact(draft,DOCUMENT_FIELDS)
   ||draft.schemaVersion!=='yeoul-y07-private-human-review-draft-v1'
   ||draft.sourceExperimentRunId!==42572722295
   ||draft.datasetRole!=='historical_development_only'
   ||draft.characterId!=='yeoul'||draft.questionId!=='Y07'||draft.modelId!==MODEL
   ||draft.reviewerAuthorityVerified!==false||draft.ownerApproved!==false
   ||draft.canonViolationConfirmed!==false||draft.independentQualityGainEstablished!==false
   ||draft.productionEligible!==false||draft.externalCalls!==0
   ||!Array.isArray(draft.decisions)||draft.decisions.length!==6)
   denial('untrusted_browser_draft');
 const edited=[];
 const seen=new Set();
 for(const [i,row] of draft.decisions.entries()){
   if(!exact(row,ENTRY_FIELDS)||row.key!==KEYS[i]||seen.has(row.key)
     ||!Object.hasOwn(OPTION_MAP,row.decision))denial('invalid_or_reordered_case');
   seen.add(row.key);
   const evidence=clean(row.evidence),direction=clean(row.direction);
   if(row.decision!=='pending' && (!evidence || evidence==='_미작성_'))
     denial('decision_requires_evidence');
   if(evidence==='_미작성_'||direction==='_미작성_')denial('placeholder_is_not_review');
   edited.push({key:row.key,option:OPTION_MAP[row.decision],evidence,direction});
 }
 const entered=edited.filter(row=>row.option!==null).length;
 if(draft.enteredCount!==entered||draft.allEntriesEntered!==(entered===6))
   denial('forged_browser_progress');
 // Generate the immutable source-linked worksheet from the original 288 records.
 const text=buildPrivateY07ReviewSheet(source,{knownOriginalAutoFields});
 const lines=text.split('\n');
 let sectionIndex=0;
 for(let i=0;i<lines.length;i++){
   if(lines[i]!=='**사람 검토 판정 (직접 작성)**')continue;
   if(sectionIndex>=6)denial('too_many_review_sections');
   const row=edited[sectionIndex++];
   const choiceIdx=lines.indexOf(row.option===null?'___never_selected___':'- [ ] '+row.option,i+2);
   const evidenceIdx=lines.indexOf('**관찰 근거(반드시 직접 작성):**',i+8);
   const revisionIdx=lines.indexOf('**수정 방향(선택):**',evidenceIdx+1);
   const next=lines.indexOf('**사람 검토 판정 (직접 작성)**',i+1);
   if(evidenceIdx<0||revisionIdx<0||(next>=0&&revisionIdx>=next))denial('template_mismatch');
   if(row.option!==null){
     if(choiceIdx<i+2||choiceIdx>=i+8)denial('unknown_selected_category');
     lines[choiceIdx]=lines[choiceIdx].replace('- [ ]','- [x]');
   }
   if(row.evidence)lines[evidenceIdx+2]=row.evidence;
   if(row.direction)lines[revisionIdx+2]=row.direction;
 }
 if(sectionIndex!==6)denial('incomplete_review_sections');
 const metadata=inspectPrivateY07ReviewSubmission({
   source,markdown:lines.join('\n'),knownOriginalAutoFields
 });
 if(metadata.humanSelectionsProvided+metadata.pendingOrUndecidedResponses!==6)
   denial('metadata_coverage');
 // Intentionally do not mark the historical worksheet's completion box.
 return Object.freeze({
   schemaVersion:'yeoul-y07-browser-draft-intake-v1',
   sourceFormat:'untrusted_local_browser_json',
   inspectedBy:'existing_source_locked_markdown_intake_v1',
   historicalResponsesChecked:6,
   browserEntriesImported:6,
   browserSelectionsEntered:entered,
   reviewedCount:metadata.humanSelectionsProvided,
   pendingOrUndecidedResponses:metadata.pendingOrUndecidedResponses,
   byCase:metadata.byCase,
   countsByCategory:metadata.countsByCategory,
   reviewedWorksheetGeneratedOnlyInMemory:true,
   originalConversationOrHumanNotesExported:false,
   originalUserRatingsModified:false,
   ownerApprovalVerified:false,
   independentQualityGainEstablished:false,
   newConfidentialHoldoutVerified:false,
   readyForPaidExperiment:false,
   productionEligible:false,
   externalCalls:0,
   decision:'HOLD_PENDING_INDEPENDENT_HUMAN_AUTHORITY_AND_30_ITEM_REVIEW'
 });
}

export async function runLocalY07BrowserDraftIntake({sourceFile,draftFile,outputFile}){
 if([sourceFile,draftFile,outputFile].some(x=>typeof x!=='string'||!x.trim()))
   denial('paths_required');
 const root=await realpath(ROOT);
 const paths=[sourceFile,draftFile,outputFile].map(path=>resolve(path));
 if(paths.some(p=>within(root,p)))denial('repository_path');
 const [s,d]=await Promise.all([lstat(paths[0]),lstat(paths[1])]);
 if(!s.isFile()||s.isSymbolicLink()||s.size>2*1024*1024
   ||!d.isFile()||d.isSymbolicLink()||d.size>30000)denial('invalid_input');
 const [rs,rd,parent]=await Promise.all([
   realpath(paths[0]),realpath(paths[1]),realpath(dirname(paths[2]))
 ]);
 if(within(root,rs)||within(root,rd)||within(root,parent)||within(parent,root)
    ||rs===rd)denial('unsafe_file_locations');
 const out=resolve(parent,basename(paths[2]));
 if(out===rs||out===rd)denial('overwrite_input');
 const [sourceJson,draftJson]=await Promise.all([readFile(rs,'utf8'),readFile(rd,'utf8')]);
 const result=inspectPrivateY07BrowserDraft({source:JSON.parse(sourceJson),draft:JSON.parse(draftJson)});
 const handle=await open(out,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(result,null,2)+'\n','utf8');}finally{await handle.close();}
 return {status:'human_authored_draft_unverified',reviewed:result.reviewedCount,
   pending:result.pendingOrUndecidedResponses,ownerApprovalVerified:false,externalCalls:0,output:out};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const a=process.argv.slice(2);
 if(a.length!==6||a[0]!=='--private-original'||a[2]!=='--browser-draft'||a[4]!=='--private-result'){
   console.error('Usage: node yeoul-y07-browser-draft-intake-v1.mjs --private-original /local/288.json --browser-draft /local/review-draft.json --private-result /local/summary.json');
   process.exitCode=1;
 }else{
   runLocalY07BrowserDraftIntake({sourceFile:a[1],draftFile:a[3],outputFile:a[5]})
     .then(x=>console.log(JSON.stringify(x)))
     .catch(()=>{console.error('YEOUL_Y07_BROWSER_DRAFT_INTAKE_REFUSED');process.exitCode=1;});
 }
}
