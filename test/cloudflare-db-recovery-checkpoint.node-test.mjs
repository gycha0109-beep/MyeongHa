// Watchtower-Track: ops
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, privateDecrypt, pbkdf2Sync, createHmac, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { recipientProof, validateRecipient, prepareRecovery, mutateAfterDurableHandoff } from '../scripts/operations/cloudflare-db-recovery-checkpoint.mjs';
const pair = () => generateKeyPairSync('rsa', { modulusLength: 3072 });
const { privateKey } = pair();
const proof = recipientProof(privateKey);

test('rejects a recipient that cannot prove private-key possession', () => {
  const other = recipientProof(pair().privateKey);
  assert.throws(() => validateRecipient(proof.key, other.signature));
});
test('a failed recovery write stops before returning any mutation credential', async () => {
  await assert.rejects(prepareRecovery({ ...proof, filename: 'unused', persist: async () => { throw Error('disk full'); } }));
});
test('upload failure or missing receipt prevents password mutation', async () => {
  let mutations = 0;
  for (const publish of [async () => { throw Error('upload failed'); }, async () => ({})]) {
    await assert.rejects(mutateAfterDurableHandoff({ candidate: { checkpoint: {} }, publish,
      checkpoint: async () => {}, mutate: async () => { mutations++; } }));
  }
  assert.equal(mutations, 0);
});
test('records durable receipt before exactly one mutation and never retries an uncertain write', async () => {
  const order = [];
  await assert.rejects(mutateAfterDurableHandoff({ candidate: { checkpoint: {}, verifier: 'synthetic' },
    publish: async () => { order.push('publish'); return { id: 123 }; },
    checkpoint: async data => { assert.equal(data.artifactId, 123); order.push('checkpoint'); },
    mutate: async () => { order.push('mutate'); throw Error('connection lost after write'); },
  }));
  assert.deepEqual(order, ['publish', 'checkpoint', 'mutate']);
});
test('durable encrypted candidate can be recovered after a later authentication failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cf-recovery-test-'));
  try {
    const filename = path.join(dir, 'encrypted.bin');
    const candidate = await prepareRecovery({ ...proof, filename });
    const disk = await readFile(filename);
    const recovered = privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, disk).toString();
    assert.equal(recovered, candidate.password);
    assert.match(recovered, /^[a-f0-9]{96}$/);
    assert.equal(disk.includes(Buffer.from(recovered)), false);
    assert.equal(JSON.stringify(candidate.checkpoint).includes(recovered), false);
    // Independently recompute the verifier, catching malformed SCRAM encodings.
    const [, roundsSalt, keys] = candidate.verifier.split('$');
    const [rounds, salt] = roundsSalt.split(':');
    const salted = pbkdf2Sync(recovered, Buffer.from(salt, 'base64'), Number(rounds), 32, 'sha256');
    const stored = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest('base64');
    const server = createHmac('sha256', salted).update('Server Key').digest('base64');
    assert.equal(keys, stored + ':' + server);
    await assert.rejects(prepareRecovery({ ...proof, filename })); // uncertain attempts never overwrite
  } finally { await rm(dir, { recursive: true, force: true }); }
});
