import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  buildSeyeonSecurityFourCellOfflinePlanV1,
  SEYEON_SECURITY_EVAL_CELLS_V1,
} from '../scripts/seyeon-security-four-cell-eval-plan-v1.mjs';
import { SEYEON_DIALOGUE_PATH_CASE_IDS_V1 } from '../scripts/seyeon-dialogue-path-eval-core-v1.mjs';

describe('four-cell security paid-evaluation readiness (no model dispatch)', () => {
  it('runs the executable with no network, no paid model secrets, and HOLD verdict', () => {
    const evidence = JSON.parse(execFileSync(
      process.execPath, ['scripts/run-seyeon-security-four-cell-offline-v1.mjs'],
      { encoding: 'utf8', env: { PATH: process.env.PATH } },
    ));
    expect(evidence.schemaVersion).toBe('seyeon-security-four-cell-plan-v1');
    expect(evidence.cells.map(c => c.cell)).toEqual(['A','B','C','D']);
    expect(evidence.cells.map(c => c.plannedCalls)).toEqual([20,20,12,12]);
    expect(evidence.callCeiling).toBe(64);
    expect(evidence.pilotEligible).toBe(true);
    expect(evidence.actualCalls).toBe(0);
    expect(evidence.estimatedCostUsd).toBeNull();
    expect(evidence.modelSecurityValidated).toBe(false);
    expect(evidence.paidEvaluationPermitted).toBe(false);
    expect(evidence.verdict).toBe('HOLD_PAID_EVAL_LOCKED');
    expect(evidence.cells[0].boundaryCharactersPerCall).toBe(619);
    expect(evidence.cells[1].boundaryCharactersPerCall).toBe(260);
    const text = JSON.stringify(evidence);
    expect(text).not.toContain('OPENAI_API_KEY');
    expect(text).not.toContain('sk-');
    expect(text).not.toContain('promptText');
  });

  it('caps any pilot to four synthetic IDs, counts all four topologies and requires renewed authorization for sixteen', () => {
    const args = { v1Characters: 619, v2Characters: 260 };
    const pilot = buildSeyeonSecurityFourCellOfflinePlanV1({
      ...args, caseIds: SEYEON_DIALOGUE_PATH_CASE_IDS_V1.slice(0, 4),
    });
    expect(pilot.cells.map(c => c.topology)).toEqual([
      'legacy_five','legacy_five','fast_three','fast_three',
    ]);
    expect(SEYEON_SECURITY_EVAL_CELLS_V1.map(c => c.stages.length)).toEqual([5,5,3,3]);
    expect(pilot.cells[0].boundaryCharactersAcrossCalls -
      pilot.cells[1].boundaryCharactersAcrossCalls).toBe(4 * 5 * 359);
    const full = buildSeyeonSecurityFourCellOfflinePlanV1({
      ...args, caseIds: SEYEON_DIALOGUE_PATH_CASE_IDS_V1,
    });
    expect(full.callCeiling).toBe(256);
    expect(full.pilotEligible).toBe(false);
    expect(full.verdict).toBe('HOLD_PAID_EVAL_LOCKED');
    expect(() => buildSeyeonSecurityFourCellOfflinePlanV1({
      ...args, caseIds: ['N01','N01'],
    })).toThrow('Invalid or duplicate');
    expect(() => buildSeyeonSecurityFourCellOfflinePlanV1({
      ...args, caseIds: ['USER_PRIVATE_DATA'],
    })).toThrow('Invalid or duplicate');
  });

  it('retains explicit disabled paid evaluations until a separately approved change', () => {
    const workflowPaths = [
      '.github/workflows/seyeon-dialogue-path-real-api-eval-v1.yml',
      '.github/workflows/seyeon-model-eval-v1.yml',
    ];
    for (const path of workflowPaths) {
      const content = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
      expect(content).toContain('if: ${{ false }}');
      expect(content).toContain('Cost incident hold');
    }
    const costContract = readFileSync(
      new URL('../apps/api/src/seyeon-cost-governor-contract-v1.ts', import.meta.url),
      'utf8',
    );
    expect(costContract).toContain('Not a Production admission port');
    expect(costContract).toContain('single atomic database transaction');
  });
});
