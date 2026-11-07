import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Phase 8-A exact-main read-only observation, 2026-11-07 KST.
// These known repository-only version IDs pair with distinct applied remote IDs.
// The only observed SQL text difference is the final "\\n\\ncommit;\\n".
// A matching digest after excluding that suffix does NOT prove ledger version
// identity, deployment actor, historical apply semantics, or Hosted DR readiness.
// Watchtower-Track: ops
const sourceMainSha = 'dba6f436e90e9a83c27137fa218ab5115d048cf4';
const trailingLocalTransactionTerminator = '\n\ncommit;\n';
const pairs = [
  {
    repositoryVersion: '20261027125500',
    appliedRemoteVersion: '20261027043527',
    filename: '20261027125500_chat_credit_delivered_ack_private_v1.sql',
    repositoryBytes: 4776,
    remoteBytes: 4766,
    repositorySha256: 'f7e5c9ddf7beda8b3438d2683f30a6287c085a25ff2dc9a20935ed84fe508ad2',
    remoteSha256: 'c493715f0ecdac66e18b8649dce1ab79d15b20c926811b5399d1f735fb6af235',
  },
  {
    repositoryVersion: '20261027163500',
    appliedRemoteVersion: '20261027074247',
    filename: '20261027163500_commerce_owner_sandbox_credit_checkout_v1.sql',
    repositoryBytes: 4320,
    remoteBytes: 4310,
    repositorySha256: '7ecf4d7c31dae19bd91aa88e090ba361f103b3a25e8a5f699f9fc1c715bd6368',
    remoteSha256: '3e44a8b80c97274760f64d655d3f596862041401003ecc108907e6fd04242186',
  },
  {
    repositoryVersion: '20261027185000',
    appliedRemoteVersion: '20261027081929',
    filename: '20261027185000_owner_kcp_sandbox_private_prepare_v1.sql',
    repositoryBytes: 12365,
    remoteBytes: 12355,
    repositorySha256: '6592feb9dbe20243ebe1b6f876cf0e82c74d313934d1187d3fa648e77fdbd89f',
    remoteSha256: '3673df5921fd53443623130dc37036b23da8b331ad2232d4911515a1a93b4176',
  },
  {
    repositoryVersion: '20261028110500',
    appliedRemoteVersion: '20261028011357',
    filename: '20261028110500_owner_sandbox_signed_receipt_persistence_v1.sql',
    repositoryBytes: 9270,
    remoteBytes: 9260,
    repositorySha256: 'f1f051cadc4745a599d1eb31f370567376d12f07f1a4ceecd19185da22082b6c',
    remoteSha256: 'e248ae6880f6765305274c4541763a3a93d12ab6822540ef6f1b2f3e1e0967c4',
  },
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

it('anchors the four observed remote-only SQL version pairs to exact repository bytes, without promoting DR gates', () => {
  expect(sourceMainSha).toMatch(/^[a-f0-9]{40}$/);
  expect(pairs).toHaveLength(4);
  expect(new Set(pairs.map(pair => pair.appliedRemoteVersion)).size).toBe(4);
  for (const pair of pairs) {
    const bytes = readFileSync(`supabase/migrations/${pair.filename}`);
    const sourceText = bytes.toString('utf8');
    expect(bytes.length).toBe(pair.repositoryBytes);
    expect(sha256(bytes)).toBe(pair.repositorySha256);
    expect(sourceText.endsWith(trailingLocalTransactionTerminator)).toBe(true);
    const remoteComparableBytes = Buffer.from(
      sourceText.slice(0, -trailingLocalTransactionTerminator.length),
      'utf8',
    );
    expect(remoteComparableBytes.length).toBe(pair.remoteBytes);
    expect(pair.repositoryBytes - pair.remoteBytes).toBe(10);
    expect(sha256(remoteComparableBytes)).toBe(pair.remoteSha256);
    expect(pair.appliedRemoteVersion).not.toBe(pair.repositoryVersion);
  }
});
