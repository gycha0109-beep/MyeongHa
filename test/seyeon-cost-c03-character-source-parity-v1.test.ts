import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SEYEON_AUTHORED_PROJECTION_SOURCE_V2,
  SEYEON_CORE_ANCHOR_V2,
} from '../packages/character-content/src/seyeon-authored-projection-v2.js';
import {
  SEYEON_FACT_AUTHORITY_SOURCE_V1,
  SEYEON_FACT_AUTHORITY_REGISTRY_V1,
} from '../packages/character-content/src/seyeon-fact-authority-v1.js';

function gitBlobSha(text: string): string {
  const bytes=Buffer.from(text,'utf8');
  return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes)
    .digest('hex');
}
function fixture(path: string) {
  return readFileSync(new URL('../'+path, import.meta.url),'utf8');
}
const biblePath='docs/character/SEYEON_CHARACTER_BIBLE_DRAFT_V0_2.md';
const runtimePath='docs/character/SEYEON_CHARACTER_RUNTIME_DRAFT_V0_1.md';

describe('COST-03 authored character source vs runtime projection drift is a HARD HOLD',()=>{
  it('detects current Bible/Runtime SHA mismatches; draft never equals Production authority',()=>{
    const bible=fixture(biblePath),runtime=fixture(runtimePath);
    const currentBibleSha=gitBlobSha(bible);
    const currentRuntimeSha=gitBlobSha(runtime);
    expect(SEYEON_AUTHORED_PROJECTION_SOURCE_V2.bible.path).toBe(biblePath);
    expect(SEYEON_AUTHORED_PROJECTION_SOURCE_V2.runtime.path).toBe(runtimePath);
    expect(SEYEON_FACT_AUTHORITY_SOURCE_V1.path).toBe(biblePath);
    // These assertions describe the current unreconciled snapshot.
    // When authors reconcile the hashes, update the test to assert parity.
    expect(currentBibleSha).not.toBe(SEYEON_AUTHORED_PROJECTION_SOURCE_V2.bible.gitBlobSha);
    expect(currentBibleSha).not.toBe(SEYEON_FACT_AUTHORITY_SOURCE_V1.gitBlobSha);
    expect(currentRuntimeSha).not.toBe(SEYEON_AUTHORED_PROJECTION_SOURCE_V2.runtime.gitBlobSha);
    expect(SEYEON_AUTHORED_PROJECTION_SOURCE_V2.bible.authorityState)
      .toBe('draft_not_production_authority');
    expect(SEYEON_CORE_ANCHOR_V2).toContain('initiates_when_situation_stalls');
  });

  it('detects Bible Canon additions absent in the stale Fact Authority registry',()=>{
    const bible=fixture(biblePath);
    const keys=[
      'identity.birthday','family.structure','family.current_relationship',
      'life.occupation_or_social_role','life.current_living_base',
      'past_romance.existence','backstory.major_turning_points',
    ] as const;
    for(const key of keys){
      const line=bible.split('\n').find(s=>s.startsWith('| ' + String.fromCharCode(96) +key+String.fromCharCode(96)+' |'));
      expect(line).toBeDefined();
      expect(line).toContain('| '+String.fromCharCode(96)+'CANON'+String.fromCharCode(96)+' | '+String.fromCharCode(96)+'KNOWN'+String.fromCharCode(96)+' |');
      const registry=SEYEON_FACT_AUTHORITY_REGISTRY_V1.entries.find(e=>e.factKey===key);
      expect(registry).toBeDefined();
      expect(registry?.sourceAuthority).toBe('AUTHOR_UNDEFINED');
    }
  });

  it('recognizes authored context/relationship and drift rules independently',()=>{
    const runtime=fixture(runtimePath);
    expect(runtime).toContain('Event Ledger에 없는 사용자와의 과거 사건');
    expect(runtime).toContain('Relationship Projection이 뒷받침하지 않는 사랑');
    expect(runtime).toContain('R16.4 Long-Horizon / Drift Probes');
    expect(runtime).toContain('R13. REPETITION & DRIFT RISKS');
  });
});
