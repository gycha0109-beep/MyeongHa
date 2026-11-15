/** Independent metadata-only R16 cohort and evaluation partition boundary.
 * No dialogue export, rubric invention, human scoring, paid model transport, or owner approval.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHARACTER_IDS,digest} from './contracts-v1.mjs';
import {extractR16Metadata} from './r16-probe-contract-v1.mjs';

const invalid = reason => {throw new Error('CHARACTER_R16_COHORT_INVALID:'+reason);};
const sha = x => typeof x === 'string' && /^[a-f0-9]{64}$/u.test(x);
const exact = (x,keys) => x!==null && typeof x==='object' && !Array.isArray(x) &&
  Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const RUNTIME_SOURCES = Object.freeze([
  ['yeoul','YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
  ['seyeon','SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
  ['rahyeon','RAHYEON_CHARACTER_RUNTIME_DRAFT_V0_2.md'],
  ['baekheon','BAEKHEON_CHARACTER_RUNTIME_DRAFT_V0_1.md'],
]);

/** Inspect only the four actual checked-in runtime documents, retaining their DRAFT authority. */
export function loadRepositoryR16Registries() {
  return RUNTIME_SOURCES.map(([characterId,name])=>{
    const sourceRef='docs/character/'+name;
    const runtimeText=readFileSync(new URL('../../'+sourceRef,import.meta.url),'utf8');
    return extractR16Metadata({characterId,sourceRef,sourceSha256:digest(runtimeText),
      runtimeText,sourceAuthorityState:'DRAFT'});
  });
}

/** Tickets must be built by the existing R16 ticket contract from the same source registry.
 * Exact-content collisions across chars are observations, NOT confirmed contamination.
 * The same exact question in both development and validation is forbidden.
 */
export function inspectR16CohortBoundary({registries,tickets=[]}) {
  if(!Array.isArray(registries)||registries.length<2||registries.length>CHARACTER_IDS.length||
    !Array.isArray(tickets))invalid('inputs');
  const catalog=new Map(), sourceOwners=new Map(), contentOwners=new Map();
  let probeCount=0;
  for(const r of registries){
    if(!exact(r,['schemaVersion','characterId','sourceRef','sourceSha256','sourceAuthorityClaim',
      'categories','probeCount','probes','humanReviewVerified','qualityGainEstablished','promptContentExported'])||
      r.schemaVersion!=='character-r16-probe-metadata-v1'||
      !CHARACTER_IDS.includes(r.characterId)||catalog.has(r.characterId)||
      !sha(r.sourceSha256)||!Array.isArray(r.probes)||r.probes.length<4||
      !Array.isArray(r.categories)||r.humanReviewVerified!==false||
      r.qualityGainEstablished!==false||r.promptContentExported!==false||
      !['DRAFT','APPROVED','OTHER_VERIFIED'].includes(r.sourceAuthorityClaim)||
      typeof r.sourceRef!=='string'||!/^docs\/character\/[A-Z0-9_]+\.md$/u.test(r.sourceRef)||
      !r.sourceRef.split('/').at(-1).startsWith(r.characterId.toUpperCase()+'_CHARACTER_RUNTIME_'))
      invalid('registry_identity');
    const previousOwner=sourceOwners.get(r.sourceSha256);
    if(previousOwner && previousOwner!==r.characterId)invalid('identical_character_runtime_source');
    sourceOwners.set(r.sourceSha256,r.characterId);
    const probes=new Map(), classes=new Set();
    for(const p of r.probes){
      if(!exact(p,['characterId','probeClass','category','ordinal','probeId',
        'promptDigest','sourceSha256','sourceRef','sourceAuthorityClaim','humanReviewVerified','productionAuthorized'])||
        p.characterId!==r.characterId||p.sourceSha256!==r.sourceSha256||
        p.sourceRef!==r.sourceRef||p.sourceAuthorityClaim!==r.sourceAuthorityClaim||
        p.humanReviewVerified!==false||p.productionAuthorized!==false||
        !/^R16\.[1-5]$/u.test(p.probeClass)||
        !['persona','relationship','memory','long_horizon','open_world'][Number(p.probeClass.split('.')[1])-1]||
        p.category!==['persona','relationship','memory','long_horizon','open_world'][Number(p.probeClass.split('.')[1])-1]||
        !Number.isSafeInteger(p.ordinal)||p.ordinal<1||
        !sha(p.promptDigest)||p.probeId!==r.characterId+':'+p.probeClass+':'+p.promptDigest.slice(0,16)||
        probes.has(p.probeId))invalid('probe_source_binding');
      probes.set(p.probeId,p);
      classes.add(p.probeClass);
      if(!contentOwners.has(p.promptDigest))contentOwners.set(p.promptDigest,new Set());
      contentOwners.get(p.promptDigest).add(r.characterId);
      probeCount++;
    }
    if(!['R16.1','R16.2','R16.3','R16.4'].every(k=>classes.has(k))||
      JSON.stringify([...classes].sort())!==JSON.stringify([...r.categories].sort())||
      r.probeCount!==probes.size)invalid('categories_or_counts');
    catalog.set(r.characterId,{registry:r,probes});
  }
  const collisionDigests=[...contentOwners.entries()].filter(([,owners])=>owners.size>1);
  const seenTickets=new Set(), digestSplit=new Map(), familySplit=new Map(), counts={development:0,optimizer_validation:0};
  let duplicateAcrossSplits=0;
  for(const t of tickets){
    if(!exact(t,['schemaVersion','characterId','probeId','probeClass','familyId','split',
      'sourceSha256','promptDigest','promptContentExported','reviewStatus',
      'scoreEstablished','externalCallsAuthorized'])||
      t.schemaVersion!=='character-r16-development-ticket-v1'||
      !catalog.has(t.characterId)||!['development','optimizer_validation'].includes(t.split)||
      typeof t.familyId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(t.familyId)||
      t.promptContentExported!==false||t.reviewStatus!=='source_unreviewed'||
      t.scoreEstablished!==false||t.externalCallsAuthorized!==false)invalid('ticket_schema');
    const item=catalog.get(t.characterId),probe=item.probes.get(t.probeId);
    if(!probe||t.probeClass!==probe.probeClass||t.sourceSha256!==item.registry.sourceSha256||
      t.promptDigest!==probe.promptDigest)invalid('cross_character_or_source_ticket');
    const key=t.characterId+'|'+t.probeId+'|'+t.split;
    if(seenTickets.has(key))invalid('repeated_ticket');
    seenTickets.add(key);
    const familyKey=t.characterId+'|'+t.familyId;
    if(familySplit.has(familyKey)&&familySplit.get(familyKey)!==t.split)
      invalid('family_crosses_development_validation');
    familySplit.set(familyKey,t.split);
    if(digestSplit.has(t.promptDigest)&&digestSplit.get(t.promptDigest)!==t.split)
      duplicateAcrossSplits++;
    digestSplit.set(t.promptDigest,t.split);
    counts[t.split]++;
  }
  if(duplicateAcrossSplits)invalid('same_probe_content_crosses_dev_validation');
  const missing=CHARACTER_IDS.filter(id=>!catalog.has(id));
  const collisionCharacters=[...new Set(collisionDigests.flatMap(([,s])=>[...s]))].sort();
  return Object.freeze({
    schemaVersion:'character-r16-cohort-boundary-v1',
    availableRuntimeCharacters:[...catalog.keys()],
    missingRuntimeCharacters:missing,
    runtimeAuthorities:registries.map(r=>({characterId:r.characterId,authorityClaim:r.sourceAuthorityClaim,
      r16ProbeCount:r.probeCount,r16Categories:r.categories})),
    totalR16Probes:probeCount,exactSharedProbeTextGroups:collisionDigests.length,
    potentialSharedTextCharacters:collisionCharacters,
    ticketCounts:counts,
    sameProbeAcrossDevelopmentAndValidation:false,
    crossCharacterSemanticContaminationUnverified:true,
    sourceAuthenticityIndependentlyVerified:false,
    humanReviewVerified:false,qualityGainEstablished:false,
    independentEvaluationReady:false,optimizerAdmissionAuthorized:false,
    externalCallsAuthorized:false,productionEligible:false,
    rawProbeTextIncluded:false,
  });
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2){
    console.error('CHARACTER_R16_COHORT_USAGE');process.exitCode=2;
  }else{
    try{
      console.log(JSON.stringify(inspectR16CohortBoundary({registries:loadRepositoryR16Registries()})));
    }catch(_e){
      console.error('CHARACTER_R16_COHORT_REFUSED');process.exitCode=1;
    }
  }
}
