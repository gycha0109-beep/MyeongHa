import {
  createCipheriv, createDecipheriv, randomBytes,
} from 'node:crypto';

/**
 * S4 private paid-answer encryption boundary (not a delivery permission).
 *
 * Keys are provided by a trusted, external-to-row key authority and never
 * stored in Commerce, Chat, DB, logs or serialized answer records. The AAD
 * pins every ciphertext to one server-owned Subject/Thread/Turn/Attempt,
 * official Reading, Reader, Bundle, Release and originating purchase Grant.
 * This module does not select a key manager or activate paid storage.
 */
export const OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1 = 'aes-256-gcm-v1' as const;
const MAX_PLAINTEXT_BYTES = 262_144;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export interface OfficialReaderProtectedBodyIdentityV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly safeMessageId: string;
  readonly officialReadingId: string;
  readonly readerCharacterId: string;
  readonly readerContentBundleId: string;
  readonly contentReleaseId: string;
  readonly originatingEntitlementGrantId: string;
  readonly productId: string;
  readonly sourceResponseHash: string;
}

export interface OfficialReaderProtectedBodyKeyV1 {
  readonly keyRef: string;
  /** A fresh 256-bit key supplied by an approved private key provider. */
  readonly keyBytes: Uint8Array;
}

export interface OfficialReaderProtectedBodyCiphertextV1 {
  readonly version: typeof OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1;
  readonly keyRef: string;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly ciphertext: Uint8Array;
}

function invalid(): never {
  throw new Error('Protected Reader body encryption operation is unavailable.');
}

function aadFor(identity: OfficialReaderProtectedBodyIdentityV1): Buffer {
  if (identity === null || typeof identity !== 'object') return invalid();
  const uuidFields = [
    identity.subjectId, identity.threadId, identity.turnId, identity.attemptId,
    identity.safeMessageId, identity.officialReadingId,
    identity.readerContentBundleId, identity.contentReleaseId,
    identity.originatingEntitlementGrantId, identity.productId,
  ];
  if (uuidFields.some((value) => typeof value !== 'string' || !UUID.test(value))) {
    return invalid();
  }
  if (typeof identity.readerCharacterId !== 'string'
      || identity.readerCharacterId.length === 0
      || identity.readerCharacterId.length > 128
      || typeof identity.sourceResponseHash !== 'string'
      || !/^sha256:(?:v1:)?[0-9a-f]{64}$/u.test(identity.sourceResponseHash)) {
    return invalid();
  }
  return Buffer.from(JSON.stringify([
    'myeongha:official-reader:protected-answer:aad:v1',
    ...uuidFields.map((value) => value.toLowerCase()),
    identity.readerCharacterId,
    identity.sourceResponseHash,
  ]), 'utf8');
}

function loadKey(value: OfficialReaderProtectedBodyKeyV1): Buffer {
  if (!value || typeof value !== 'object'
      || typeof value.keyRef !== 'string'
      || value.keyRef.trim() !== value.keyRef || value.keyRef.length === 0
      || value.keyRef.length > 256
      || !(value.keyBytes instanceof Uint8Array)
      || value.keyBytes.byteLength !== KEY_BYTES) {
    return invalid();
  }
  // Work on a private copy so internal crypto never owns the key provider's
  // retained key bytes. Clear this copy after the operation.
  return Buffer.from(value.keyBytes);
}

export function encryptOfficialReaderProtectedBodyV1(input: {
  readonly identity: OfficialReaderProtectedBodyIdentityV1;
  readonly body: string;
  readonly key: OfficialReaderProtectedBodyKeyV1;
}): OfficialReaderProtectedBodyCiphertextV1 {
  if (typeof input.body !== 'string' || input.body.trim().length === 0) {
    return invalid();
  }
  const plaintext = Buffer.from(input.body, 'utf8');
  if (plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT_BYTES) {
    plaintext.fill(0);
    return invalid();
  }
  const aad = aadFor(input.identity);
  const keyBytes = loadKey(input.key);
  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', keyBytes, iv, { authTagLength: AUTH_TAG_BYTES });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Object.freeze({
      version: OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1,
      keyRef: input.key.keyRef,
      iv: Uint8Array.from(iv),
      authTag: Uint8Array.from(authTag),
      ciphertext: Uint8Array.from(ciphertext),
    });
  } finally {
    plaintext.fill(0);
    keyBytes.fill(0);
    aad.fill(0);
  }
}

export function decryptOfficialReaderProtectedBodyV1(input: {
  readonly identity: OfficialReaderProtectedBodyIdentityV1;
  readonly encrypted: OfficialReaderProtectedBodyCiphertextV1;
  readonly key: OfficialReaderProtectedBodyKeyV1;
}): string {
  const encrypted = input.encrypted;
  if (!encrypted || encrypted.version !== OFFICIAL_READER_PROTECTED_CIPHER_VERSION_V1
      || encrypted.keyRef !== input.key.keyRef
      || !(encrypted.iv instanceof Uint8Array)
      || encrypted.iv.byteLength !== IV_BYTES
      || !(encrypted.authTag instanceof Uint8Array)
      || encrypted.authTag.byteLength !== AUTH_TAG_BYTES
      || !(encrypted.ciphertext instanceof Uint8Array)
      || encrypted.ciphertext.byteLength === 0
      || encrypted.ciphertext.byteLength > MAX_PLAINTEXT_BYTES) {
    return invalid();
  }

  const aad = aadFor(input.identity);
  const keyBytes = loadKey(input.key);
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm', keyBytes, Buffer.from(encrypted.iv),
      { authTagLength: AUTH_TAG_BYTES },
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(encrypted.authTag));
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext)),
      decipher.final(),
    ]);
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    return invalid();
  } finally {
    plaintext?.fill(0);
    keyBytes.fill(0);
    aad.fill(0);
  }
}
