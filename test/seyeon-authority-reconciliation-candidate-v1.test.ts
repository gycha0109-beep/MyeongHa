import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {
  inspectSeyeonAuthorityReconciliationCandidateV1,
  SEYEON_AUTHORITY_RECONCILIATION_CANDIDATE_V1,
} from './support/seyeon-authority-reconciliation-candidate-v1.js';
import {
  SEYEON_FACT_AUTHORITY_REGISTRY_V1,
} from '../packages/character-content/src/seyeon-fact-authority-v1.js';
import {
  resolveCharacterFactAuthorityEntryV1,
  validateCharacterFactAuthorityRegistryV1,
} from '../packages/character-content/src/character-fact-authority-v1.js';

const bible=readFileSync(new URL('../docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md',import.meta.url),'utf8');
const report=()=>inspectSeyeonAuthorityReconciliationCandidateV1({bibleText:bible,runtimeText:runtime});

describe('COST-03 authority reconciliation remains draft-only / no Production grants',()=>{
  it('parses complete authored appendix and validates a separate non-executable registry candidate',()=>{
    const r=report();
    expect(r.status).toBe(SEYEON_AUTHORITY_RECONCILIATION_CANDIDATE_V1);
    expect(r.authoredFactsCount).toBeGreaterThan(45);
    expect(r.authoredFactsCount).toBeLessThan(100);
    expect(r.candidateRegistry.entries).toHaveLength(r.authoredFactsCount);
    expect(r.candidateRegistry.sourceBible.gitBlobSha).toBe(r.bibleBlobSha);
    expect(r.projectionMismatch).toEqual({bible:true,runtime:true,factRegistry:true});
    expect(r.ownerApprovalRecorded).toBe(false);
    expect(r.runtimePublicationAllowed).toBe(false);
    expect(r.personalSourceAccessAllowed).toBe(false);
    expect(validateCharacterFactAuthorityRegistryV1(r.candidateRegistry)).toBe(r.candidateRegistry);
    expect(r.changedOrNewCount).toBeGreaterThan(15);
  });
  it('preserves exact disclosure tier when historical undefined keys are proposed as known',()=>{
    const r=report();
    for(const [key,expectedLevel] of [
      ['identity.birthday','CONTEXTUAL'],
      ['life.occupation_or_social_role','PUBLIC'],
      ['past_romance.existence','FAMILIAR'],
      ['backstory.major_turning_points','ATTACHED'],
      ['family.structure','CONTEXTUAL'],
      ['family.current_relationship','CONTEXTUAL'],
    ] as const){
      const candidate=resolveCharacterFactAuthorityEntryV1(r.candidateRegistry,key);
      const production=resolveCharacterFactAuthorityEntryV1(SEYEON_FACT_AUTHORITY_REGISTRY_V1,key);
      expect(candidate?.sourceAuthority).toBe('CANON');
      expect(candidate?.characterKnowledge).toBe('KNOWN');
      expect(candidate?.disclosureDefault).toBe(expectedLevel);
      expect(production?.sourceAuthority).toBe('AUTHOR_UNDEFINED');
    }
  });
  it('cannot convert dynamic relationship claims to fixed Canon',()=>{
    const r=report();
    expect(r.dynamicKeysRequiringSeparateAuthority).toEqual(['relationship.dynamic_self_claims']);
    expect(r.candidateRegistry.entries.find(e=>e.factKey==='relationship.dynamic_self_claims')).toBeUndefined();
    expect(r.candidateValuesForReviewOnly.get('relationship.dynamic_self_claims')).toContain('사랑');
  });
  it('retains actual author undefined facts without inventing an exact birth year or proper place name',()=>{
    const r=report();
    const birth=resolveCharacterFactAuthorityEntryV1(r.candidateRegistry,'identity.birth_year');
    expect(birth?.sourceAuthority).toBe('AUTHOR_UNDEFINED');
    expect(birth?.disclosureDefault).toBe('NOT_APPLICABLE');
    expect(r.candidateValuesForReviewOnly.get('identity.birth_year')).toBe('미정');
    expect(r.reviewRows.some(x=>x.factKey==='past_romance.existence' &&
      x.difference==='CHANGED_AUTHORITY_OR_DISCLOSURE')).toBe(true);
  });
  it('rejects truncated or rewritten source rather than silently accepting partial authority',()=>{
    expect(()=>inspectSeyeonAuthorityReconciliationCandidateV1({
      bibleText:'',runtimeText:runtime,
    })).toThrow();
    expect(()=>inspectSeyeonAuthorityReconciliationCandidateV1({
      bibleText:bible.replace('| '+String.fromCharCode(96)+'relationship.dynamic_self_claims'+String.fromCharCode(96)+' |','| relationship.dynamic_self_claims |'),
      runtimeText:runtime,
    })).toThrow();
  });
  it('never imports test support from the Production turn runtime',()=>{
    const f=readFileSync(new URL('../apps/api/src/production-seyeon-chat-runtime-v1.ts',import.meta.url),'utf8');
    expect(f).not.toContain('seyeon-authority-reconciliation-candidate-v1');
    expect(SEYEON_FACT_AUTHORITY_REGISTRY_V1.entries.find(x=>x.factKey==='identity.birthday')?.sourceAuthority)
      .toBe('AUTHOR_UNDEFINED');
  });
  it('tracks Canon adoption and disclosure tier separately without granting either',()=>{
    const r=report();
    expect(r.reviewSummary.missingInServer).toBeGreaterThan(0);
    const birth=r.reviewRows.find(x=>x.factKey==='identity.birthday');
    expect(birth).toMatchObject({
      missingFromServer:false,
      authorityChanged:true,
      knowledgeChanged:true,
      disclosureChanged:true,
      existingState:'AUTHOR_UNDEFINED',
      existingKnowledge:'NOT_APPLICABLE',
      existingDisclosure:'NOT_APPLICABLE',
      candidateState:'CANON',
      candidateKnowledge:'KNOWN',
      candidateDisclosure:'CONTEXTUAL',
    });
    const name=r.reviewRows.find(x=>x.factKey==='identity.name');
    expect(name).toMatchObject({
      missingFromServer:false,authorityChanged:false,
      knowledgeChanged:false,disclosureChanged:false,
      candidateDisclosure:'PUBLIC',
    });
    const neverGuessed=r.reviewRows.find(x=>x.factKey==='identity.birth_year');
    expect(neverGuessed?.missingFromServer).toBe(true);
    expect(neverGuessed?.candidateState).toBe('AUTHOR_UNDEFINED');
    expect(r.reviewSummary.disclosureChanged).toBe(
      r.reviewRows.filter(x=>x.disclosureChanged).length,
    );
    expect(r.reviewSummary.authorityChanged).toBe(
      r.reviewRows.filter(x=>x.authorityChanged).length,
    );
    expect(r.ownerApprovalRecorded).toBe(false);
    expect(r.runtimePublicationAllowed).toBe(false);
    expect(r.personalSourceAccessAllowed).toBe(false);
  });
});
