/**
 * COST-03/04 draft authoring diff. No runtime import, source grant,
 * canonical publication, API, DB write, or Production authority.
 *
 * The Bible is a draft. The registry candidate exists solely for Owner review.
 * A textual fact and disclosure permission are distinct.
 */
import { createHash } from 'node:crypto';
import {
  CHARACTER_FACT_AUTHORITY_REGISTRY_SCHEMA_VERSION_V1,
  CHARACTER_DISCLOSURE_DEFAULTS_V1,
  CHARACTER_KNOWLEDGE_STATES_V1,
  CHARACTER_SOURCE_AUTHORITY_STATES_V1,
  validateCharacterFactAuthorityRegistryV1,
  type CharacterFactAuthorityEntryV1,
  type CharacterFactAuthorityRegistryV1,
} from '../../packages/character-content/src/character-fact-authority-v1.js';
import {
  SEYEON_FACT_AUTHORITY_REGISTRY_V1,
} from '../../packages/character-content/src/seyeon-fact-authority-v1.js';
import {
  SEYEON_AUTHORED_PROJECTION_SOURCE_V2,
} from '../../packages/character-content/src/seyeon-authored-projection-v2.js';

export const SEYEON_AUTHORITY_RECONCILIATION_CANDIDATE_V1 =
  'draft_owner_review_only_never_runtime_admission' as const;

function blobSha(content:string):string {
  const bytes=Buffer.from(content,'utf8');
  return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
function cell(value:string):string{
  return value.trim().replace(/^`|`$/gu,'');
}
export interface SeyeonAuthoringReviewRowV1 {
  readonly factKey:string;
  readonly candidateState:'CANON'|'SOFT_CANON'|'AUTHOR_UNDEFINED';
  readonly candidateKnowledge:CharacterFactAuthorityEntryV1['characterKnowledge'];
  readonly candidateDisclosure:CharacterFactAuthorityEntryV1['disclosureDefault'];
  readonly sourceSection:string|null;
  readonly existingState:CharacterFactAuthorityEntryV1['sourceAuthority']|null;
  readonly existingDisclosure:CharacterFactAuthorityEntryV1['disclosureDefault']|null;
  readonly difference:'MISSING_IN_SERVER_REGISTRY'|'CHANGED_AUTHORITY_OR_DISCLOSURE'|'ALIGNED';
}
export function inspectSeyeonAuthorityReconciliationCandidateV1(input: {
  readonly bibleText:string;
  readonly runtimeText:string;
}) {
  const {bibleText,runtimeText}=input;
  if(typeof bibleText!=='string'||typeof runtimeText!=='string'||
    !bibleText.includes('# FACT AUTHORITY & BIOGRAPHY CLOSURE APPENDIX')||
    !runtimeText.includes('# R1. CORE RUNTIME ANCHOR')){
    throw new TypeError('COST-03 exact author drafts required');
  }
  const appendix=bibleText.split('# FACT AUTHORITY & BIOGRAPHY CLOSURE APPENDIX')[1]!;
  const entries:CharacterFactAuthorityEntryV1[]=[];
  const manualReviewKeys:string[]=[];
  const values=new Map<string,string>();
  for(const line of appendix.split('\n')){
    if(!/^\|\s*`[a-z0-9_.]+`\s*\|/u.test(line))continue;
    const tokens=line.trim().split('|').slice(1,-1).map(cell);
    if(tokens.length!==7) throw new TypeError('Invalid authored fact appendix row');
    const [factKey,value,sourceAuthority,characterKnowledge,disclosureDefault,section,closureNote]=tokens as [string,string,string,string,string,string,string];
    if(values.has(factKey))throw new TypeError('Duplicate authored fact key');
    values.set(factKey,value);
    if(sourceAuthority==='RUNTIME_DEPENDENT' || disclosureDefault==='DYNAMIC'){
      if(sourceAuthority!=='RUNTIME_DEPENDENT' || disclosureDefault!=='DYNAMIC'){
        throw new TypeError('Inconsistent dynamic relationship authority');
      }
      manualReviewKeys.push(factKey);
      continue;
    }
    if(!CHARACTER_SOURCE_AUTHORITY_STATES_V1.includes(sourceAuthority as never)||
       !CHARACTER_KNOWLEDGE_STATES_V1.includes(characterKnowledge as never)||
       !CHARACTER_DISCLOSURE_DEFAULTS_V1.includes(disclosureDefault as never)){
      throw new TypeError('Unsupported authored authority state');
    }
    if(sourceAuthority!=='CANON'&&sourceAuthority!=='SOFT_CANON'&&
       sourceAuthority!=='AUTHOR_UNDEFINED'){
      throw new TypeError('Unreviewed authored authority must remain manual');
    }
    entries.push(Object.freeze({
      factKey,sourceAuthority:sourceAuthority as CharacterFactAuthorityEntryV1['sourceAuthority'],
      characterKnowledge:characterKnowledge as CharacterFactAuthorityEntryV1['characterKnowledge'],
      disclosureDefault:disclosureDefault as CharacterFactAuthorityEntryV1['disclosureDefault'],
      sourceSection:section||null,
      closureNote:closureNote||'Authored appendix owner review pending',
    }));
  }
  if(entries.length<45||entries.length>100||manualReviewKeys.length!==1)
    throw new TypeError('Authored appendix unexpected completeness');
  const bibleSha=blobSha(bibleText),runtimeSha=blobSha(runtimeText);
  const candidateRegistry:CharacterFactAuthorityRegistryV1=
    validateCharacterFactAuthorityRegistryV1(Object.freeze({
      schemaVersion:CHARACTER_FACT_AUTHORITY_REGISTRY_SCHEMA_VERSION_V1,
      characterId:'seyeon',
      sourceBible:Object.freeze({
        path:'docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',gitBlobSha:bibleSha,
      }),
      entries:Object.freeze(entries),
    }));
  const old=new Map<string,CharacterFactAuthorityEntryV1>(SEYEON_FACT_AUTHORITY_REGISTRY_V1.entries.map(e=>[e.factKey,e]));
  const reviewRows:SeyeonAuthoringReviewRowV1[]=entries.map(entry=>{
    const previous=old.get(entry.factKey);
    const difference=previous===undefined?'MISSING_IN_SERVER_REGISTRY':
      previous.sourceAuthority!==entry.sourceAuthority||
      previous.characterKnowledge!==entry.characterKnowledge||
      previous.disclosureDefault!==entry.disclosureDefault||
      previous.sourceSection!==entry.sourceSection?
      'CHANGED_AUTHORITY_OR_DISCLOSURE':'ALIGNED';
    return Object.freeze({
      factKey:entry.factKey,
      candidateState:entry.sourceAuthority as SeyeonAuthoringReviewRowV1['candidateState'],
      candidateKnowledge:entry.characterKnowledge,
      candidateDisclosure:entry.disclosureDefault,
      sourceSection:entry.sourceSection,
      existingState:previous?.sourceAuthority??null,
      existingDisclosure:previous?.disclosureDefault??null,
      difference,
    });
  });
  const projectionMismatch={
    bible:SEYEON_AUTHORED_PROJECTION_SOURCE_V2.bible.gitBlobSha!==bibleSha,
    runtime:SEYEON_AUTHORED_PROJECTION_SOURCE_V2.runtime.gitBlobSha!==runtimeSha,
    factRegistry:SEYEON_FACT_AUTHORITY_REGISTRY_V1.sourceBible.gitBlobSha!==bibleSha,
  };
  return Object.freeze({
    status:SEYEON_AUTHORITY_RECONCILIATION_CANDIDATE_V1,
    bibleBlobSha:bibleSha,runtimeBlobSha:runtimeSha,
    projectionMismatch:Object.freeze(projectionMismatch),
    authoredFactsCount:entries.length,
    dynamicKeysRequiringSeparateAuthority:Object.freeze(manualReviewKeys),
    changedOrNewCount:reviewRows.filter(r=>r.difference!=='ALIGNED').length,
    reviewRows:Object.freeze(reviewRows),
    candidateRegistry,
    candidateValuesForReviewOnly:values,
    ownerApprovalRecorded:false,
    runtimePublicationAllowed:false,
    personalSourceAccessAllowed:false,
  });
}
