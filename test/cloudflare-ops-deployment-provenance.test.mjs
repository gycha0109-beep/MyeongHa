import { describe, expect, it } from 'vitest';
import { resolveCloudflareOpsVersionMetadataV1 } from '../scripts/local/deploy-cloudflare-ops.mjs';

describe('Cloudflare Ops deployment provenance', () => {
  it('records the full exact commit in the Worker Version tag and message', () => {
    const commit = '0123456789abcdef0123456789abcdef01234567';
    expect(resolveCloudflareOpsVersionMetadataV1(commit)).toEqual({
      tag: `ops-${commit}`,
      message: `ops-feat/ops/cloudflare-authdb-clean-snapshot-20261021@${commit}`,
    });
  });

  it.each([
    '', '0123456789abcdef', 'g'.repeat(40), 'A'.repeat(40),
  ])('rejects a non-exact commit SHA (%s)', (commit) => {
    expect(() => resolveCloudflareOpsVersionMetadataV1(commit))
      .toThrow('Cloudflare Ops deployment requires an exact Git commit SHA');
  });
});
