import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YEOUL_NEW_FAMILY_DRAFTS } from './yeoul-new-scenario-families-v1.mjs';
import { buildPrivateSemanticReviewHtml, inspectPrivateSemanticReviewDraft, runPrivateSemanticReview } from './yeoul-private-semantic-review-v1.mjs';

const MODELS=['z-ai/glm-5.3-flash','deepseek/deepseek-v4.1-flash-1017','minimax/minimax-m3.1-flash','qwen/qwen3.8-27b'];
const VARIANTS=['baseline','language_rules','conversation_examples'];
const MARK='PRIVATE_LEGACY_QUESTION_NOT_FOR_PUBLIC_LOGS';
const fixture=({archived=true}={})=>{
  const responses=[];
  for(let n=1;n<=12;n++)for(const model of MODELS)
    for(const variant of VARIANTS)for(const repeat of [1,2])
      responses.push({id:'Y'+String(n).padStart(2,'0'),model,variant,repeat,
        input:'원본 질문 '+n+' '+MARK,reply:'가상 답변',
        evaluation:{rating:'good',source:'synthetic',note:''},questionDiscrimination:null});
  const result={schemaVersion:'yeoul-evaluation-export-v1',experimentRunId:42572722295,scope:'all-288',
    sourceExperiment:{attemptedCalls:288,successfulCalls:288},
    responses,
    surveyState:{groups:Object.fromEntries(Array.from({length:9},(_,i)=>['G'+i,{discrimination:''}]))}};
  if(archived){
    result.responses.forEach((r,i)=>{if(i%8===0)r.questionDiscrimination='unreviewed_auto_candidate';});
    for(const group of Object.values(result.surveyState.groups))group.discrimination='unreviewed_auto_candidate';
  }
  return result;
};
const blank=(original=fixture())=>{
  // Only the locally generated private HTML can supply the source-bound review fingerprint.
  const html=buildPrivateSemanticReviewHtml(original,{knownOriginalAutoFields:true});
  const binding=html.match(/data-review-binding="([a-f0-9]{64})"/u)?.[1];
  assert.ok(binding);
  return {schemaVersion:'yeoul-private-semantic-review-draft-v1',sourceBinding:binding,
    cases:YEOUL_NEW_FAMILY_DRAFTS.map(f=>({familyId:f.familyId,decision:'pending',overlapIds:[],evidence:''}))};
};

test('private 12×8 review has escaped source and no external resources',()=>{
  const source=fixture();
  const original=JSON.stringify(source);
  const html=buildPrivateSemanticReviewHtml(source,{knownOriginalAutoFields:true});
  assert.equal((html.match(/class="candidate"/gu)||[]).length,8);
  assert.equal((html.match(/<h3>Y\d{2}<\/h3>/gu)||[]).length,12);
  assert.ok(html.includes(MARK));
  assert.ok(html.includes('검토 초안 JSON 저장'));
  assert.ok(!html.includes('https://'));
  assert.ok(!html.includes('fetch('));
  assert.equal(JSON.stringify(source),original);
  assert.throws(()=>buildPrivateSemanticReviewHtml(source),/private_row_contract/);
  source.responses[0].input='X <script>alert(1)</script> &';
  for(const row of source.responses)if(row.id==='Y01')row.input=source.responses[0].input;
  const escaped=buildPrivateSemanticReviewHtml(source,{knownOriginalAutoFields:true});
  assert.ok(escaped.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp;'));
  assert.ok(!escaped.includes('<script>alert(1)</script>'));
});

test('eight unreviewed cases stay pending regardless of generated browser',()=>{
  const result=inspectPrivateSemanticReviewDraft(fixture(),blank(),{knownOriginalAutoFields:true});
  assert.deepEqual(result.counts,{pending:8,distinct:0,overlap:0,hold:0});
  assert.equal(result.originalQuestionsCompared,12);
  assert.equal(result.independentSemanticReviewVerified,false);
  assert.equal(result.optimizerInputAuthorized,false);
  assert.equal(result.externalCalls,0);
  assert.ok(!JSON.stringify(result).includes(MARK));
});

test('record overlap, distinct and hold without granting independent validation',()=>{
  const d=blank();
  d.cases[0]={...d.cases[0],decision:'overlap',overlapIds:['Y01','Y06'],evidence:'두 질문의 의도 확인 필요'};
  d.cases[1]={...d.cases[1],decision:'distinct',evidence:'평가 상황이 다름'};
  d.cases[2]={...d.cases[2],decision:'hold',evidence:'판단 근거 부족'};
  const r=inspectPrivateSemanticReviewDraft(fixture(),d,{knownOriginalAutoFields:true});
  assert.deepEqual(r.counts,{pending:5,distinct:1,overlap:1,hold:1});
  assert.equal(r.reviewEntriesRecorded,2);
  assert.equal(r.unresolvedFamilies,6);
  assert.deepEqual(r.overlapFamilyIds,[d.cases[0].familyId]);
  assert.equal(r.ownerApprovalVerified,false);
  assert.equal(r.independentFinalHoldoutReady,false);
  assert.ok(!JSON.stringify(r).includes('두 질문의 의도'));
});

test('tampering with case key, source, approval or changed order is refused',()=>{
  const original=fixture();const d=blank();
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,{...d,ownerApproved:true},{knownOriginalAutoFields:true}),/draft_schema/);
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,{...d,cases:[...d.cases].reverse()},{knownOriginalAutoFields:true}),/case_shape/);
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,{...d,cases:[...d.cases.slice(0,7)]},{knownOriginalAutoFields:true}),/draft_schema/);
  const forged=blank();forged.cases[0].approved=true;
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,forged,{knownOriginalAutoFields:true}),/case_shape/);
  original.responses.pop();
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,d,{knownOriginalAutoFields:true}),/known_unreviewed_original_required/);
});

test('unsubstantiated decisions, invalid references and wrong archival counts fail closed',()=>{
  const original=fixture();
  const d=blank();d.cases[0].decision='overlap';
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,d,{knownOriginalAutoFields:true}),/evidence_required/);
  d.cases[0].evidence='검토됨';
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,d,{knownOriginalAutoFields:true}),/overlap_references_required/);
  d.cases[0].overlapIds=['Y99'];
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,d,{knownOriginalAutoFields:true}),/legacy_reference/);
  d.cases[0].overlapIds=['Y01','Y01'];
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,d,{knownOriginalAutoFields:true}),/legacy_reference/);
  d.cases[0].overlapIds=['Y01'];d.cases[1].decision='distinct';d.cases[1].overlapIds=['Y02'];d.cases[1].evidence='구별됨';
  assert.throws(()=>inspectPrivateSemanticReviewDraft(original,d,{knownOriginalAutoFields:true}),/unexpected_overlap_references/);
  d.cases[1].overlapIds=[];
  const invalid=fixture();invalid.responses[0].questionDiscrimination=null;
  assert.throws(()=>buildPrivateSemanticReviewHtml(invalid,{knownOriginalAutoFields:true}),/unrecognized_original_auto_field_counts/);
});

test('local file IO rejects overwrite and keeps original private source unchanged',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'yeoul-private-semantic-'));
  try{
    const original=fixture(),bytes=JSON.stringify(original);
    const input=join(folder,'original.json'),html=join(folder,'review.html');
    await writeFile(input,bytes);
    const printed=await runPrivateSemanticReview({input,output:html,knownOriginalAutoFields:true});
    assert.equal(printed.externalCalls,0);
    assert.equal((await readFile(html,'utf8')).includes(MARK),true);
    assert.equal(await readFile(input,'utf8'),bytes);
    await assert.rejects(()=>runPrivateSemanticReview({input,output:html,knownOriginalAutoFields:true}),/EEXIST/);
    const draft=join(folder,'draft.json'),result=join(folder,'result.json');
    await writeFile(draft,JSON.stringify(blank()));
    const summary=await runPrivateSemanticReview({input,output:result,draft,knownOriginalAutoFields:true});
    assert.equal(summary.counts.pending,8);
    assert.ok(!(await readFile(result,'utf8')).includes(MARK));
    assert.equal(await readFile(draft,'utf8'),JSON.stringify(blank()));
    await assert.rejects(()=>runPrivateSemanticReview({input,output:result,draft,knownOriginalAutoFields:true}),/EEXIST/);
    const insideRepo=resolve(fileURLToPath(new URL('../../',import.meta.url)),'private-result.json');
    await assert.rejects(()=>runPrivateSemanticReview({input,output:insideRepo,draft,knownOriginalAutoFields:true}),/unsafe_output/);
    if(process.platform!=='win32')assert.equal((await stat(result)).mode&0o077,0);
  }finally{await rm(folder,{recursive:true,force:true});}
});

test('private drafts are bound to the exact legacy question set and current candidate manifest',()=>{
  const source=fixture();
  const draft=blank(source);
  const report=inspectPrivateSemanticReviewDraft(source,draft,{knownOriginalAutoFields:true});
  assert.equal(report.draftBoundToCurrentLocalQuestionSet,true);
  assert.equal(report.sourceBytesAuthenticated,false);
  assert.ok(!JSON.stringify(report).includes(draft.sourceBinding),
    'private question binding must never be serialized to the metadata summary');

  const altered=fixture();
  for(const row of altered.responses)if(row.id==='Y01')row.input='변경된 가상 원본 질문';
  assert.throws(()=>inspectPrivateSemanticReviewDraft(altered,draft,{knownOriginalAutoFields:true}),
    /source_binding_mismatch/);
  assert.doesNotThrow(()=>inspectPrivateSemanticReviewDraft(altered,blank(altered),{knownOriginalAutoFields:true}));
  assert.throws(()=>inspectPrivateSemanticReviewDraft(source,{...draft,sourceBinding:'0'.repeat(64)},
    {knownOriginalAutoFields:true}),/source_binding_mismatch/);
  const missing=structuredClone(draft);delete missing.sourceBinding;
  assert.throws(()=>inspectPrivateSemanticReviewDraft(source,missing,{knownOriginalAutoFields:true}),/draft_schema/);
});
