// Watchtower-Track: ops
// No plaintext credential is persisted. The private key stays on the operator PC.
import {
  randomBytes, createPublicKey, publicEncrypt, privateDecrypt, constants,
  pbkdf2Sync, createHmac, createHash, sign, verify,
} from 'node:crypto';
import { open, readFile } from 'node:fs/promises';

export const RECOVERY_ROLE = 'myeongha_cf_api_login';
const hash = value => createHash('sha256').update(value).digest('hex');
export function recipientProof(privateKey) {
  const key = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
  const challenge = Buffer.from('MYEONGHA_CF_HANDOFF_V2:' + key);
  // Exercise OAEP decryption locally as well as proving possession by signature.
  const sample = randomBytes(48);
  const cipher = publicEncrypt({ key: createPublicKey(privateKey), oaepHash: 'sha256' }, sample);
  if (!privateDecrypt({ key: privateKey, oaepHash: 'sha256' }, cipher).equals(sample)) {
    throw new Error('RECIPIENT_ROUNDTRIP_FAILED');
  }
  return { key, signature: sign('sha256', challenge, privateKey).toString('base64') };
}
export function validateRecipient(key, signature) {
  const recipient = createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' });
  if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails?.modulusLength < 3072 ||
      !verify('sha256', Buffer.from('MYEONGHA_CF_HANDOFF_V2:' + key), recipient,
        Buffer.from(signature, 'base64'))) throw new Error('RECIPIENT_PROOF_REJECTED');
  return recipient;
}
export function scramVerifier(password) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const stored = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
  const server = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored.toString('base64')}:${server.toString('base64')}`;
}
export async function durableWriteExclusive(filename, bytes) {
  const file = await open(filename, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  if (!(await readFile(filename)).equals(Buffer.from(bytes))) throw new Error('CHECKPOINT_READBACK_FAILED');
}
export async function prepareRecovery({ key, signature, filename, persist = durableWriteExclusive }) {
  const recipient = validateRecipient(key, signature);
  const password = randomBytes(48).toString('hex');
  const ciphertext = publicEncrypt({ key: recipient, padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256' }, Buffer.from(password));
  await persist(filename, ciphertext);
  return { password, verifier: scramVerifier(password), ciphertext,
    checkpoint: { role: RECOVERY_ROLE, recipientFingerprint: hash(recipient.export({ format: 'der', type: 'spki' })),
      ciphertextSha256: hash(ciphertext), state: 'ENCRYPTED_CREDENTIAL_DURABLE_BEFORE_MUTATION' } };
}
export async function mutateAfterDurableHandoff({ candidate, publish, checkpoint, mutate }) {
  const receipt = await publish();
  if (!Number.isSafeInteger(receipt?.id) || receipt.id <= 0) throw new Error('Durable handoff upload failed');
  await checkpoint({ ...candidate.checkpoint, artifactId: receipt.id,
    state: 'PASSWORD_MUTATION_ABOUT_TO_START_OUTCOME_MUST_BE_RECONCILED' });
  // A failed/uncertain mutation is propagated; it is never retried here.
  return mutate(candidate.verifier);
}
