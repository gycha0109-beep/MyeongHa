import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyIsolatedPg18LinuxProof } from '../../scripts/operations/verify-isolated-pg18-product-linux-proof-phase11.mjs';

const ORIGINAL = readFileSync('docs/operations/POSTGRES_REAL_PRODUCT_PATH_LINUX_OBSERVATION_20261105.json');
const MAIN = 'b536a7e232f9f7810c0ba5c02e906789c706c369';

describe('independent original isolated PG18 Linux evidence', () => {
  it('accepts only exact original bytes and the actual source revision', () => {
    const result = verifyIsolatedPg18LinuxProof(ORIGINAL, MAIN);
    expect(result).toMatchObject({
      status: 'VALIDATED_ISOLATED_ONLY',
      poolRequested: 96, poolMax: 2,
      baselineSuccessful: 12,
      contendedSuccessful: 16,
      contendedUnavailable: 16,
      productionCapacityProven: false, drReady: false,
    });
  });
  it('rejects a changed source, a changed byte, and a truncated proof', () => {
    expect(() => verifyIsolatedPg18LinuxProof(ORIGINAL, '0'.repeat(40))).toThrow();
    const altered = Buffer.from(ORIGINAL);
    altered[40] ^= 1;
    expect(() => verifyIsolatedPg18LinuxProof(altered, MAIN)).toThrow();
    expect(() => verifyIsolatedPg18LinuxProof(ORIGINAL.subarray(0,-1), MAIN)).toThrow();
  });
});
