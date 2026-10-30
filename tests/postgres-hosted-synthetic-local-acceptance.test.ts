import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('local synthetic-only Hosted recovery acceptance contract', () => {
  it('passes its offline mock verification without contacting any recovery target', () => {
    const output = execFileSync(process.execPath, [
      'scripts/verify-postgres-hosted-synthetic-local-acceptance.mjs',
    ], { encoding: 'utf8', timeout: 15000 });
    expect(output).toContain('Hosted synthetic local acceptance verifier PASS');
  });
});
