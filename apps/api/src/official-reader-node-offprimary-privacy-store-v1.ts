import {
  constants, existsSync, lstatSync, readFileSync,
} from 'node:fs';
import {
  lstat, open, unlink, realpath, readdir,
} from 'node:fs/promises';
import {
  createCipheriv, createDecipheriv, createHmac,
  randomBytes, randomUUID, timingSafeEqual,
} from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';

import type {
  OfficialReaderAccountDeletionLedgerPortV1,
  OfficialReaderDurableDeletionFenceV1,
  OfficialReaderProtectedKeyErasurePortV1,
} from './official-reader-private-account-deletion-lifecycle-v1.js';
import type {
  OfficialReaderProtectedBodyKeyV1,
} from './official-reader-protected-body-crypto-v1.js';
import type {
  PrivateOfficialReaderPaidAnswerKeyResolverV1,
} from './official-reader-private-paid-answer-reread-v1.js';

/**
 * S4 Node-only reference implementation of the existing Owner ports.
 * Both directories MUST be independently persistent, backed-up Postgres
 * MUST NEVER contain them, and the host must provide correct mount,
 * permissions, and durability guarantees. This is not a serverless /tmp
 * fallback or a claim that arbitrary filesystem unlink securely erases SSDs.
 *
 * All files carry AES-256-GCM authentication. Plaintext DEKs, identifiers,
 * private answer bodies, and raw ledger manifests are never logged.
 * Off-primary mounts and external key-material durability still require
 * Privacy Owner operational acceptance before public activation.
 */
export interface OfficialReaderOffPrimaryStoreConfigV1 {
  readonly ledgerRoot: string;
  readonly keyRoot: string;
  readonly ledgerSealKey: Uint8Array;
  readonly keySealKey: Uint8Array;
}

export interface OfficialReaderOffPrimaryKeyStoreV1
  extends OfficialReaderProtectedKeyErasurePortV1,
    PrivateOfficialReaderPaidAnswerKeyResolverV1 {
  issueUniqueKey(): Promise<OfficialReaderProtectedBodyKeyV1>;
}

export interface OfficialReaderOffPrimaryRestoreCatalogV1 {
  /** Off-primary durable deletion proof survives a restored PostgreSQL backup. */
  listAccountDeletionFences(): Promise<readonly OfficialReaderDurableDeletionFenceV1[]>;
  isSubjectTombstoned(subjectId: string): Promise<boolean>;
}

export interface OfficialReaderOffPrimaryStoreV1 {
  readonly ledger: OfficialReaderAccountDeletionLedgerPortV1;
  readonly keys: OfficialReaderOffPrimaryKeyStoreV1;
  readonly restoreCatalog: OfficialReaderOffPrimaryRestoreCatalogV1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const KEY_REF = /^reader-dek-v1:[0-9a-f-]{36}$/u;
const MAX_LEDGER_BYTES = 20 * 1024 * 1024;
const MAX_MANIFEST_ITEMS = 50_000;
const VERSION = 'official-reader-offprimary-sealed-record-v1' as const;
const MAX_RECORD_BYTES = 24 * 1024 * 1024;
const ROOT_MODE_MASK = 0o077;

function denied(): never {
  throw new Error('Protected Reader off-primary privacy storage is unavailable.');
}

function uuid(input: unknown): string {
  if (typeof input !== 'string' || !UUID.test(input)) return denied();
  return input.toLowerCase();
}

function nonEmpty(input: unknown, max = 256): string {
  if (typeof input !== 'string' || input.length === 0
      || input.length > max || input.trim() !== input) return denied();
  return input;
}

function configKey(value: Uint8Array): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) return denied();
  return Buffer.from(value);
}

function assertRoot(directory: string): string {
  if (typeof directory !== 'string' || !isAbsolute(directory)
      || resolve(directory) !== directory || directory === '/'
      || directory.startsWith('/tmp/') || directory.startsWith('/var/tmp/')
      || directory.startsWith('/run/') || directory.includes('\0')) return denied();
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || (stat.mode & ROOT_MODE_MASK) !== 0) return denied();
  return directory;
}

function recordFilename(secret: Buffer, type: string, ...identities: string[]): string {
  return type + '-' + createHmac('sha256', secret)
    .update([type, ...identities].join('|'), 'utf8').digest('hex') + '.json';
}

function sealedBytes(secret: Buffer, label: string, value: unknown): Buffer {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.byteLength > MAX_LEDGER_BYTES) return denied();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, nonce);
  cipher.setAAD(Buffer.from(label, 'utf8'));
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = {
      version: VERSION,
      nonce: nonce.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      content: ciphertext.toString('base64url'),
    };
    return Buffer.from(JSON.stringify(envelope), 'utf8');
  } finally {
    plaintext.fill(0);
  }
}

function unsealBytes(secret: Buffer, label: string, raw: Buffer): unknown {
  if (raw.length === 0 || raw.length > MAX_RECORD_BYTES) return denied();
  try {
    const envelope = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    if (envelope.version !== VERSION
        || typeof envelope.nonce !== 'string'
        || typeof envelope.tag !== 'string'
        || typeof envelope.content !== 'string') return denied();
    const nonce = Buffer.from(envelope.nonce, 'base64url');
    const tag = Buffer.from(envelope.tag, 'base64url');
    const ciphertext = Buffer.from(envelope.content, 'base64url');
    if (nonce.length !== 12 || tag.length !== 16
        || ciphertext.length === 0 || ciphertext.length > MAX_LEDGER_BYTES) return denied();
    const decipher = createDecipheriv('aes-256-gcm', secret, nonce);
    decipher.setAAD(Buffer.from(label, 'utf8'));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext), decipher.final(),
    ]);
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } finally {
      plaintext.fill(0);
    }
  } catch {
    return denied();
  }
}

async function checkRoot(dir: string): Promise<void> {
  assertRoot(dir);
  const original = await lstat(dir);
  const actual = await realpath(dir);
  if (actual !== dir || !original.isDirectory()
      || (original.mode & ROOT_MODE_MASK) !== 0) return denied();
}

async function readSealed(
  dir: string, filename: string, secret: Buffer, label: string,
): Promise<unknown | null> {
  await checkRoot(dir);
  const target = join(dir, filename);
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_RECORD_BYTES
        || (info.mode & ROOT_MODE_MASK) !== 0) return denied();
    return unsealBytes(secret, label, await handle.readFile());
  } finally {
    await handle.close();
  }
}

async function syncDirectory(dir: string): Promise<void> {
  const handle = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeSealedOnce(
  dir: string, filename: string, secret: Buffer, label: string, value: unknown,
): Promise<void> {
  await checkRoot(dir);
  const bytes = sealedBytes(secret, label, value);
  const target = join(dir, filename);
  let handle;
  try {
    handle = await open(
      target, constants.O_WRONLY | constants.O_CREAT
        | constants.O_EXCL | constants.O_NOFOLLOW, 0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      bytes.fill(0);
      return;
    }
    bytes.fill(0);
    throw error;
  }
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    bytes.fill(0);
    await handle.close();
  }
  await syncDirectory(dir);
}

function sortedManifest(bodyIds: readonly string[], keyRefs: readonly string[]) {
  if (!Array.isArray(bodyIds) || !Array.isArray(keyRefs)
      || bodyIds.length !== keyRefs.length
      || bodyIds.length === 0 || bodyIds.length > MAX_MANIFEST_ITEMS) return denied();
  const ids = bodyIds.map(uuid).sort();
  const keys = keyRefs.map((ref) => nonEmpty(ref)).sort();
  if (new Set(ids).size !== ids.length
      || new Set(keys).size !== keys.length) return denied();
  return { ids, keys };
}

function validateFence(value: unknown, subjectId: string, deletionJobId: string):
  OfficialReaderDurableDeletionFenceV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return denied();
  const record = value as Record<string, unknown>;
  if (record.version !== 'official-reader-account-deletion-fence-v1'
      || record.subjectId !== subjectId || record.deletionJobId !== deletionJobId
      || typeof record.fenceId !== 'string' || !UUID.test(record.fenceId)) return denied();
  const rows = sortedManifest(
    record.bodyIds as readonly string[], record.keyRefs as readonly string[],
  );
  return Object.freeze({
    version: 'official-reader-account-deletion-fence-v1' as const,
    subjectId, deletionJobId,
    fenceId: record.fenceId.toLowerCase(),
    bodyIds: Object.freeze(rows.ids),
    keyRefs: Object.freeze(rows.keys),
  });
}

export function createOfficialReaderNodeOffPrimaryStoreV1(
  config: OfficialReaderOffPrimaryStoreConfigV1,
): OfficialReaderOffPrimaryStoreV1 {
  const ledgerRoot = assertRoot(config.ledgerRoot);
  const keyRoot = assertRoot(config.keyRoot);
  if (ledgerRoot === keyRoot
      || ledgerRoot.startsWith(keyRoot + '/')
      || keyRoot.startsWith(ledgerRoot + '/')) return denied();
  const ledgerSeal = configKey(config.ledgerSealKey);
  const keySeal = configKey(config.keySealKey);
  if (timingSafeEqual(ledgerSeal, keySeal)) return denied();

  function fenceName(subjectId: string, deletionJobId: string): string {
    return recordFilename(ledgerSeal, 'account-fence', subjectId, deletionJobId);
  }
  function ackName(subjectId: string, deletionJobId: string): string {
    return recordFilename(ledgerSeal, 'account-keys-erased', subjectId, deletionJobId);
  }
  function subjectDenyName(subjectId: string): string {
    return recordFilename(ledgerSeal, 'account-subject-deny', subjectId);
  }
  function keyName(keyRef: string): string {
    return recordFilename(keySeal, 'dek', keyRef);
  }
  function keyTombstoneName(keyRef: string): string {
    return recordFilename(keySeal, 'destroyed', keyRef);
  }
  async function readFence(subjectId: string, deletionJobId: string) {
    const name = fenceName(subjectId, deletionJobId);
    const raw = await readSealed(ledgerRoot, name, ledgerSeal, name);
    return raw === null ? null : validateFence(raw, subjectId, deletionJobId);
  }
  async function keyDestroyed(keyRef: string): Promise<boolean> {
    nonEmpty(keyRef);
    const name = keyTombstoneName(keyRef);
    const erased = await readSealed(keyRoot, name, keySeal, name);
    if (erased === null) return false;
    if (!erased || typeof erased !== 'object'
        || (erased as Record<string, unknown>).keyRef !== keyRef
        || (erased as Record<string, unknown>).type !== 'key-destroyed-v1') return denied();
    await checkRoot(keyRoot);
    try {
      await lstat(join(keyRoot, keyName(keyRef)));
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return true;
    }
  }

  const ledger: OfficialReaderAccountDeletionLedgerPortV1 = Object.freeze({
    async recordAccountDeletionFence(input) {
      const subjectId = uuid(input.subjectId);
      const deletionJobId = uuid(input.deletionJobId);
      const { ids, keys } = sortedManifest(input.bodyIds, input.keyRefs);
      // Persist a subject-level denial BEFORE any DB deletion. Even when
      // the main DB is restored to an older ACTIVE state, this off-primary
      // tombstone prevents a paid-answer read without enumerating SQL rows.
      const denyName = subjectDenyName(subjectId);
      await writeSealedOnce(ledgerRoot, denyName, ledgerSeal, denyName, {
        type: 'account-subject-deny-v1', subjectId, deletionJobId,
      });
      const deniedSubject = await readSealed(
        ledgerRoot, denyName, ledgerSeal, denyName,
      ) as Record<string, unknown> | null;
      if (!deniedSubject
          || deniedSubject.type !== 'account-subject-deny-v1'
          || deniedSubject.subjectId !== subjectId
          || deniedSubject.deletionJobId !== deletionJobId) return denied();

      const name = fenceName(subjectId, deletionJobId);
      const record: OfficialReaderDurableDeletionFenceV1 = {
        version: 'official-reader-account-deletion-fence-v1',
        subjectId, deletionJobId,
        fenceId: randomUUID(),
        bodyIds: ids,
        keyRefs: keys,
      };
      await writeSealedOnce(ledgerRoot, name, ledgerSeal, name, record);
      const saved = await readFence(subjectId, deletionJobId);
      if (saved === null
          || saved.bodyIds.length !== ids.length
          || saved.keyRefs.length !== keys.length
          || ids.some((id, index) => id !== saved.bodyIds[index])
          || keys.some((key, index) => key !== saved.keyRefs[index])) return denied();
      return saved;
    },

    async readAccountDeletionFence(input) {
      return readFence(uuid(input.subjectId), uuid(input.deletionJobId));
    },

    async acknowledgeAccountKeyErasure(input) {
      const subjectId = uuid(input.subjectId);
      const deletionJobId = uuid(input.deletionJobId);
      const fence = await readFence(subjectId, deletionJobId);
      if (!fence || fence.fenceId !== uuid(input.fenceId)) return denied();
      for (const keyRef of fence.keyRefs) {
        if (!(await keyDestroyed(keyRef))) return denied();
      }
      const name = ackName(subjectId, deletionJobId);
      await writeSealedOnce(ledgerRoot, name, ledgerSeal, name, {
        type: 'key-erasure-ack-v1',
        subjectId, deletionJobId, fenceId: fence.fenceId,
      });
      const ack = await readSealed(ledgerRoot, name, ledgerSeal, name);
      return !!ack && typeof ack === 'object'
        && (ack as Record<string, unknown>).type === 'key-erasure-ack-v1'
        && (ack as Record<string, unknown>).subjectId === subjectId
        && (ack as Record<string, unknown>).deletionJobId === deletionJobId
        && (ack as Record<string, unknown>).fenceId === fence.fenceId;
    },
  });

  const restoreCatalog: OfficialReaderOffPrimaryRestoreCatalogV1 = Object.freeze({
    async listAccountDeletionFences() {
      await checkRoot(ledgerRoot);
      const entries = await readdir(ledgerRoot);
      const names = entries.filter((name) =>
        /^account-fence-[0-9a-f]{64}\.json$/u.test(name)).sort();
      if (names.length > MAX_MANIFEST_ITEMS) return denied();
      const seen = new Set<string>();
      const fences: OfficialReaderDurableDeletionFenceV1[] = [];
      for (const name of names) {
        const raw = await readSealed(ledgerRoot, name, ledgerSeal, name);
        if (raw === null || typeof raw !== 'object') return denied();
        const record = raw as Record<string, unknown>;
        const subjectId = uuid(record.subjectId);
        const deletionJobId = uuid(record.deletionJobId);
        if (fenceName(subjectId, deletionJobId) !== name) return denied();
        const exact = validateFence(raw, subjectId, deletionJobId);
        const identity = subjectId + ':' + deletionJobId;
        if (seen.has(identity)) return denied();
        seen.add(identity);
        const deniedSubject = await this.isSubjectTombstoned(subjectId);
        if (!deniedSubject) return denied();
        fences.push(exact);
      }
      // A crash can occur after the irreversible Subject deny tombstone is
      // persisted but before its full body/key manifest is committed. That
      // incomplete external write MUST block restore reconciliation rather
      // than producing a false "all tombstones replayed" success.
      const denyNames = entries.filter((name) =>
        /^account-subject-deny-[0-9a-f]{64}\.json$/u.test(name));
      for (const name of denyNames) {
        const raw = await readSealed(ledgerRoot, name, ledgerSeal, name);
        if (!raw || typeof raw !== 'object') return denied();
        const record = raw as Record<string, unknown>;
        if (record.type !== 'account-subject-deny-v1') return denied();
        const subjectId = uuid(record.subjectId);
        const deletionJobId = uuid(record.deletionJobId);
        if (subjectDenyName(subjectId) !== name
            || !seen.has(subjectId + ':' + deletionJobId)) return denied();
      }
      return Object.freeze(fences);
    },
    async isSubjectTombstoned(subjectId) {
      const canonical = uuid(subjectId);
      const name = subjectDenyName(canonical);
      const raw = await readSealed(ledgerRoot, name, ledgerSeal, name);
      if (raw === null) return false;
      if (!raw || typeof raw !== 'object'
          || (raw as Record<string, unknown>).type !== 'account-subject-deny-v1'
          || (raw as Record<string, unknown>).subjectId !== canonical
          || typeof (raw as Record<string, unknown>).deletionJobId !== 'string') {
        return denied();
      }
      uuid((raw as Record<string, unknown>).deletionJobId);
      return true;
    },
  });

  const keys: OfficialReaderOffPrimaryKeyStoreV1 = Object.freeze({
    async issueUniqueKey() {
      const keyRef = 'reader-dek-v1:' + randomUUID();
      const keyBytes = randomBytes(32);
      const name = keyName(keyRef);
      if (await keyDestroyed(keyRef)) return denied();
      try {
        await writeSealedOnce(keyRoot, name, keySeal, name, {
          type: 'key-material-v1',
          keyRef, keyBytes: keyBytes.toString('base64url'),
        });
        const persisted = await readSealed(keyRoot, name, keySeal, name);
        if (!persisted || typeof persisted !== 'object'
            || (persisted as Record<string, unknown>).keyRef !== keyRef
            || (persisted as Record<string, unknown>).keyBytes !== keyBytes.toString('base64url')) {
          return denied();
        }
        return Object.freeze({ keyRef, keyBytes: Uint8Array.from(keyBytes) });
      } finally {
        keyBytes.fill(0);
      }
    },

    async destroyKey(keyRef) {
      if (!KEY_REF.test(keyRef)) return denied();
      const name = keyTombstoneName(keyRef);
      await writeSealedOnce(keyRoot, name, keySeal, name, {
        type: 'key-destroyed-v1', keyRef,
      });
      const tombstone = await readSealed(keyRoot, name, keySeal, name);
      if (!tombstone || typeof tombstone !== 'object'
          || (tombstone as Record<string, unknown>).keyRef !== keyRef) return denied();
      try {
        await unlink(join(keyRoot, keyName(keyRef)));
        await syncDirectory(keyRoot);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },

    async isKeyDestroyed(keyRef) {
      if (!KEY_REF.test(keyRef)) return denied();
      return keyDestroyed(keyRef);
    },

    resolveCachedKey(keyRef) {
      if (!KEY_REF.test(keyRef)) return null;
      assertRoot(keyRoot);
      // Synchronous local durable-mount read: NO network or PostgreSQL access
      // while the S1 Reader transaction lock is held. Re-check tombstones
      // before and after loading, so a concurrent deletion cannot be reused
      // on this process even if ciphertext was restored to the key path.
      if (existsSync(join(keyRoot, keyTombstoneName(keyRef)))) return null;
      const name = keyName(keyRef);
      let raw: Buffer;
      try {
        const target = join(keyRoot, name);
        const info = lstatSync(target);
        if (!info.isFile() || info.isSymbolicLink()
            || (info.mode & ROOT_MODE_MASK) !== 0
            || info.size > MAX_RECORD_BYTES) return null;
        raw = readFileSync(target);
      } catch {
        return null;
      }
      const value = unsealBytes(keySeal, name, raw);
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, unknown>;
      if (record.type !== 'key-material-v1' || record.keyRef !== keyRef
          || typeof record.keyBytes !== 'string') return null;
      const decoded = Buffer.from(record.keyBytes, 'base64url');
      if (decoded.length !== 32
          || existsSync(join(keyRoot, keyTombstoneName(keyRef)))) {
        decoded.fill(0);
        return null;
      }
      try {
        return Object.freeze({
          keyRef, keyBytes: Uint8Array.from(decoded),
        });
      } finally {
        decoded.fill(0);
        raw.fill(0);
      }
    },
  });

  return Object.freeze({ ledger, keys, restoreCatalog });
}
