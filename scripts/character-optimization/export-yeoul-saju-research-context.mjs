/**
 * LOCAL RESEARCH ONLY: compute Saju canonical career semantics and export
 * a source-correlated authoring context. This is NOT an admitted CharacterGroundingBundleV2.
 * No new claim, customer data, official issuance, or model call.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2);
const arg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]};
const fail=m=>{throw Error(m)};
const saju=arg('--saju-root'),birthPath=arg('--birth-file'),sourcePath=arg('--source'),outPath=arg('--out'),at=arg('--now');
if(!saju||!birthPath||!sourcePath||!outPath||!at)fail('REQUIRED: --saju-root --birth-file --source --out --now');
const src=JSON.parse(readFileSync(resolve(sourcePath),'utf8'));
if(src.sourceKind!=='saju_engine_derived_research_only'||src.state!=='research_only'||src.productionIssuance!==false||src.domain!=='career'||!Array.isArray(src.evidence))fail('NOT_RESEARCH_SOURCE');
const sourceHash=createHash('sha256').update(JSON.stringify(src)).digest('hex');
const birth=JSON.parse(readFileSync(resolve(birthPath),'utf8'));
if(birth.researchOnly!==true||birth.sourceHash!==sourceHash||!birth.birth||!Number.isFinite(Date.parse(at)))fail('UNPINNED_RESEARCH_BIRTH');
const loader=async file=>import(pathToFileURL(join(resolve(saju),'dist',file)).href);
const [{calculateCanonicalSajuSnapshot},{PRODUCTION_DEFAULT_CALCULATION_POLICY},{runInterpretation},{createCareerNatalReadingCandidateRegistry},{buildReadingCompositionEvidence},{buildPreviewSemanticTextBindingsV1},{buildPreviewSemanticQualifierBindingsV1},{buildCanonicalReadingSemanticBundleV1},{buildOfficialReadingPlanV1},{renderOfficialReadingV1}]=await Promise.all([
 loader('calculation/calculation-engine.js'),
 loader('production/production-calculation-policy.js'),
 loader('interpretation/interpretation-engine.js'),
 loader('research/career-natal-reading-candidate.js'),
 loader('reading/reading-profile-authorization.js'),
 loader('preview/preview-semantic-text-projection.js'),
 loader('preview/preview-semantic-qualifier-projection.js'),
 loader('reading/canonical-reading-semantics.js'),
 loader('reading/official-reading-plan.js'),
 loader('reading/official-reading-renderer.js'),
]);
const now=new Date(at);
const snap=calculateCanonicalSajuSnapshot(birth.birth,PRODUCTION_DEFAULT_CALCULATION_POLICY,{now});
const intent={domain:'career',temporalScope:'natal'};
const registry=createCareerNatalReadingCandidateRegistry(now.toISOString());
const execution=runInterpretation(snap,registry,{now});
const composition=buildReadingCompositionEvidence(snap,execution,registry,{requestId:'yeoul-career-complete-female',intent},{narrativePolicyVersion:'yeoul-career-complete-research-v1'});
if(!composition.evidence)fail('CANONICAL_EVIDENCE_ABSENT');
const evidence=composition.evidence.bundle, targetClaimIds=composition.selection.targetClaimIds;
const texts=buildPreviewSemanticTextBindingsV1({intent,registry,evidence,targetClaimIds});
const qualifiers=buildPreviewSemanticQualifierBindingsV1({intent,registry,evidence,targetClaimIds});
const semantics=buildCanonicalReadingSemanticBundleV1({intent,evidence,targetClaimIds,semanticTextBindings:texts,semanticQualifierBindings:qualifiers});
const report=renderOfficialReadingV1(semantics,buildOfficialReadingPlanV1(semantics),{preferredDetail:'standard'});
if(report.reportHash!==src.officialReportHash||!src.readingId.endsWith(report.reportHash.slice(0,16)))fail('SOURCE_REPORT_HASH_MISMATCH');
const selectedByClaim=new Map(semantics.units.filter(u=>targetClaimIds.includes(u.claimId)&&u.role==='primary').map(u=>[u.claimId,u]));
const linked=new Map();
const units=[];
for(const e of src.evidence.filter(e=>e.kind==='natal')){
 const claimId=e.origin.split(';')[0];
 const u=selectedByClaim.get(claimId);
 if(!u||!u.canonicalText?.summary||!u.canonicalText.headline||!e.text.includes(u.canonicalText.headline)||!e.text.includes(u.canonicalText.summary))fail('SOURCE_SEMANTIC_MISMATCH:'+e.id);
 const associatedFacts=semantics.canonicalFacts.filter(f=>u.factRefs.includes(f.ref)&&f.fact?.status==='resolved').map(f=>({
  ref:f.ref,
  path:f.path,
  value:f.fact.value,
 }));
 if(associatedFacts.length>30)fail('EXCESSIVE_CANONICAL_FACTS');
 for(const f of associatedFacts)linked.set(f.ref,f);
 units.push({
  evidenceId:e.id,canonicalUnitId:u.unitId,claimId,
  title:u.canonicalText.headline,summary:u.canonicalText.summary,
  taxonomy:u.taxonomy,semanticKey:u.semanticKey,
  qualifiers:(u.semanticQualifiers??[]).map(q=>({kind:q.kind,semanticKeys:q.semanticKeys,canonicalText:q.canonicalText,prohibitedExtensions:q.prohibitedExtensions})),
  prohibitedExtensions:u.prohibitedExtensions,
  upstreamClaimRefs:u.upstreamClaimRefs,relatedFactRefs:associatedFacts.map(f=>f.ref),sourceRefs:u.sourceRefs,
 });
}
if(units.length!==src.evidence.filter(e=>e.kind==='natal').length||units.length<3)fail('MISSING_NATAL_UNITS');
const includedClaims=new Map(units.map(u=>[u.claimId,u.evidenceId]));
const relations=semantics.claimRelations.filter(r=>includedClaims.has(r.fromClaimId)&&includedClaims.has(r.toClaimId)).map(r=>({
 fromEvidenceId:includedClaims.get(r.fromClaimId),toEvidenceId:includedClaims.get(r.toClaimId),relation:r.relation,reason:r.reason??null,
}));
const ctx={
 schemaVersion:'saju-career-research-authoring-context-v1',
 sourceKind:'saju_engine_derived_research_context_only',
 researchOnly:true,officialIssuance:false,sourceHash,readingId:src.readingId,
 officialReportHash:src.officialReportHash,
 snapshotId:snap.snapshotId,calculationHash:snap.calculationHash,sourceSemanticHash:semantics.semanticHash,
 generationSource:'Saju canonical reading semantics (research, not admitted CharacterGroundingBundleV2)',
 units,linkedCanonicalFacts:[...linked.values()],relations,
 limitations:src.limitations,
};
if(JSON.stringify(ctx).length>45000)fail('AUTHORING_CONTEXT_TOO_LARGE');
writeFileSync(resolve(outPath),JSON.stringify(ctx,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({status:'RESEARCH_CONTEXT_EXPORTED',natalUnits:units.length,facts:linked.size,relations:relations.length,sourceHash,output:resolve(outPath)}));
