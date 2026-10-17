import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  assertSeyeonPositiveProjectorsNotEnabledV1,
  SeyeonPositiveProjectorAdmissionHoldV1,
} from '../apps/api/src/seyeon-positive-projector-admission-hold-v1.js';
import {
  SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1,
  type SeyeonProductionPersonalRecordProjectorV1,
} from '../apps/api/src/seyeon-production-context-v1.js';

const SECRET = 'PRIVATE_PROJECTOR_CANDIDATE_CANARY';

describe('G0/R0 positive Projector fail-closed Production admission', () => {
  it('retains the published empty immutable Projector default', () => {
    expect(SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1).toEqual([]);
    expect(Object.isFrozen(SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1)).toBe(true);
    expect(() => assertSeyeonPositiveProjectorsNotEnabledV1()).not.toThrow();
    expect(() => assertSeyeonPositiveProjectorsNotEnabledV1([])).not.toThrow();
  });

  it('blocks any positive/ambiguous Projector before record source reads', () => {
    const candidate = {
      recordKind: 'memory_item',
      recordType: SECRET,
      schemaVersion: 'v1',
      project: () => ({
        summary: SECRET,
        claimKind: 'direct' as const,
        relevance: 1,
        salience: 1,
      }),
    } as unknown as SeyeonProductionPersonalRecordProjectorV1;
    for (const value of [
      [candidate], [candidate, candidate],
      null, undefined, {}, { length: 0 }, '[]',
    ]) {
      // Undefined triggers the published zero-only default and is intentional.
      if (value === undefined) {
        expect(() => assertSeyeonPositiveProjectorsNotEnabledV1()).not.toThrow();
        continue;
      }
      expect(() => assertSeyeonPositiveProjectorsNotEnabledV1(
        value as readonly SeyeonProductionPersonalRecordProjectorV1[],
      )).toThrow(SeyeonPositiveProjectorAdmissionHoldV1);
      try {
        assertSeyeonPositiveProjectorsNotEnabledV1(
          value as readonly SeyeonProductionPersonalRecordProjectorV1[],
        );
        throw new Error('Expected a denial');
      } catch (error) {
        expect(String(error)).not.toContain(SECRET);
      }
    }
  });

  it('is wired before both runtime DB lease and each Subject resolution', async () => {
    const runtime = await readFile(
      new URL('../apps/api/src/production-seyeon-chat-runtime-v1.ts', import.meta.url),
      'utf8',
    );
    const factory = runtime.indexOf('export function createProductionSeyeonChatRuntimeV1(');
    const factoryGuard = runtime.indexOf('assertSeyeonPositiveProjectorsNotEnabledV1();', factory);
    const pool = runtime.indexOf('const poolLease = createProductionPostgresSubjectPoolLeaseV1(', factory);
    const run = runtime.indexOf('async run(', factory);
    const runGuard = runtime.indexOf('assertSeyeonPositiveProjectorsNotEnabledV1();', run);
    const runner = runtime.indexOf('const runner =', run);
    const subject = runtime.indexOf("() => runner.resolveSubject()", run);
    expect(factory).toBeGreaterThan(-1);
    expect(factoryGuard).toBeGreaterThan(factory);
    expect(pool).toBeGreaterThan(factoryGuard);
    expect(run).toBeGreaterThan(pool);
    expect(runGuard).toBeGreaterThan(run);
    expect(runner).toBeGreaterThan(runGuard);
    expect(subject).toBeGreaterThan(runner);
  });

  it('does not claim source/Grant/Commit/Reveal authority from zero-projector success', async () => {
    expect(() => assertSeyeonPositiveProjectorsNotEnabledV1()).not.toThrow();
    const source = await readFile(
      new URL('../apps/api/src/seyeon-positive-projector-admission-hold-v1.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('G0/G1 DB and source-owner approval');
    expect(source).not.toContain('permitsProductionPositive: true');
  });
});
