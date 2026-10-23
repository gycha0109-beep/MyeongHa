import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  SEYEON_DIALOGUE_PATH_EXPECTED_STAGE_COUNTS_V1 as EXPECTED,
  verifySeyeonDialoguePathStageTopologyV1 as verify,
} from '../scripts/seyeon-dialogue-path-eval-core-v1.mjs';

describe('5→3 measured model stage topology (no provider calls)', () => {
  it('accepts only the complete original five and candidate three distinct stages', () => {
    expect(Object.values(EXPECTED.legacy_5_terra).reduce((a,b)=>a+b,0)).toBe(5);
    expect(Object.values(EXPECTED.fast_3_luna_terra).reduce((a,b)=>a+b,0)).toBe(3);
    for (const [route, stages] of Object.entries(EXPECTED)) {
      expect(verify(route, stages)).toBe(true);
      expect(verify(route, {...stages})).toBe(true);
    }
  });
  it('rejects missing, duplicate, wrong-path, fallback and unknown stages even when calls match', () => {
    for (const [route, stages] of Object.entries(EXPECTED)) {
      const [first, second] = Object.keys(stages);
      expect(verify(route, { ...stages, [first]: 0, [second]: 2 })).toBe(false);
      const missing = {...stages};
      delete missing[first];
      expect(verify(route, missing)).toBe(false);
      expect(verify(route, {...stages, other:1})).toBe(false);
      expect(verify(route, {...stages, fallback:1})).toBe(false);
      expect(verify(route, null)).toBe(false);
      expect(verify(route, [])).toBe(false);
    }
    expect(verify('legacy_5_terra', EXPECTED.fast_3_luna_terra)).toBe(false);
    expect(verify('fast_3_luna_terra', EXPECTED.legacy_5_terra)).toBe(false);
    expect(verify('unknown', {})).toBe(false);
  });
  it('the guarded real benchmark checks per-case counted stages before blind outputs', () => {
    const src=readFileSync(new URL('../scripts/run-seyeon-dialogue-path-real-api-eval-v1.mjs',
      import.meta.url),'utf8');
    const before=src.indexOf('const beforeStages =');
    const measured=src.indexOf('const stageCounts =');
    const held=src.indexOf('STAGE_TOPOLOGY_HOLD');
    const blind=src.indexOf("if (outcome === 'admitted' && approvedReviewIds.has(spec.id))");
    expect(before).toBeGreaterThan(0);
    expect(measured).toBeGreaterThan(before);
    expect(held).toBeGreaterThan(measured);
    expect(blind).toBeGreaterThan(held);
    expect(src).toContain('verifySeyeonDialoguePathStageTopologyV1(route, stageCounts)');
    expect(src).toContain('stageCounts,');
    expect(src).toContain('const PAID_EXECUTION_ADMITTED = false');
    expect(src).not.toContain('process.env.OPENAI_API_KEY');
  });
});
