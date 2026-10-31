import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import {selectSeyeonExactModelPersonalSourcesV1} from '../apps/api/src/seyeon-exact-model-personal-source-selection-v1.js';
import {createSeyeonAttemptZeroPersonalProofV1} from '../apps/api/src/seyeon-attempt-zero-personal-proof-v1.js';

const repair=readFileSync(new URL('../scripts/operations/seyeon-security-s0/production-17-zero-source-selection-census-pin-20261101.sql',import.meta.url),'utf8');
const original=readFileSync(new URL('../supabase/migrations/1640_seyeon_zero_personal_source_pre_model_pin_v1.sql',import.meta.url),'utf8');
const digest=(value:unknown)=>'sha256:v1:'+createHash('sha256').update(canonicalJson(value)).digest('hex');
const ids={
  subjectId:'a0000000-0000-4000-8000-000000000011',
  threadId:'a0000000-0000-4000-8000-000000000012',
  turnId:'a0000000-0000-4000-8000-000000000013',
  attemptId:'a0000000-0000-4000-8000-000000000014',
};

describe('production zero-source G1 selection census compatibility',()=>{
  it('uses the currently generated exact ten-key selection shape',()=>{
    const selection=selectSeyeonExactModelPersonalSourcesV1({
      retrievedMemories:[],sourceCandidates:[],requiredPersonalRecordCount:0,
    });
    expect(Object.keys(selection).sort()).toEqual([
      'permitsAtomicCommit','permitsHttpReveal','persistedBeforeModel',
      'selectedMemoryCount','selectedModelSourceCensusDigest',
      'selectedPersonalRecordCount','selectedSources','selectedSourcesDigest',
      'selectedUnpinnedDerivedSources','version',
    ].sort());
    expect(selection.selectedSources).toEqual([]);
    expect(selection.selectedUnpinnedDerivedSources).toEqual([]);
    expect(selection.selectedMemoryCount).toBe(0);
    expect(selection.selectedSourcesDigest).toBe(digest([]));
    expect(selection.selectedModelSourceCensusDigest).toBe(digest({
      originalPersonalSources:[],unpinnedDerivedSources:[],
    }));
    expect(repair).toContain(digest([]));
    expect(repair).toContain(digest({originalPersonalSources:[],unpinnedDerivedSources:[]}));
  });

  it('keeps original 14-key zero proof unchanged',()=>{
    const proof=createSeyeonAttemptZeroPersonalProofV1({
      ...ids,context:{
        version:'seyeon-production-context-v1',
        retrievedMemories:[],
        personalRecordAdmissions:[],
        personalRecordProjectionCandidates:[],
      },
    });
    expect(Object.keys(proof)).toHaveLength(14);
    expect(proof.recordCount).toBe(0);
    expect(proof.records).toEqual([]);
    expect(proof.unsupportedSchemaCount).toBe(0);
  });

  it('repairs only the installed owner function and forbids derived-source forgery',()=>{
    expect(original).toContain('v_selection_keys <> 8');
    expect(repair).toContain("definition:=replace(definition,'v_selection_keys <> 8','v_selection_keys <> 10');");
    expect(repair).toContain("v_selection -> ''selectedUnpinnedDerivedSources'' is distinct from ''[]''::jsonb");
    expect(repair).toContain("v_selection -> ''selectedMemoryCount'' is distinct from ''0''::jsonb");
    expect(repair).toContain('selectedModelSourceCensusDigest');
    expect(repair).toContain('grant create on schema public to myeongha_seyeon_chat_runtime_owner;');
    expect(repair).toContain('revoke create on schema public from myeongha_seyeon_chat_runtime_owner;');
    expect(repair).toContain('set local role myeongha_seyeon_chat_runtime_owner;');
    expect(repair).toContain('revoke myeongha_seyeon_chat_runtime_owner from current_user;');
    expect(repair).toContain('Operator membership was not restored');
    expect(repair).toMatch(/commit;\s*$/u);
    expect(repair).not.toMatch(/\b(?:drop|truncate|delete)\s+(?:table|from)\s+public\.chat_turn/iu);
  });
});
