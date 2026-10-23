#!/usr/bin/env node
// S4/S6 offline installation of externally SIGNED restore acceptance.
// The signing PRIVATE key and recovery evidence are never generated here.
// This cannot turn on the public Reader route. A missing signed certificate
// leaves protected-answer serving fail-closed.

import {
  createPublicKey, verify,
} from 'node:crypto';
import {
  constants, lstatSync,
} from 'node:fs';
import {
  readFile, open, lstat, rename, unlink,
} from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';

const CONFIRM = 'INSTALL_OWNER_SIGNED_READER_RECOVERY_EVIDENCE';
const MAX_BYTES = 16_384;

function fail() {
  throw new Error('Reader recovery acceptance installation is unavailable.');
}

const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--certificate'
    || args[2] !== '--confirmation' || args[3] !== CONFIRM) fail();
const inputFile = args[1];
if (typeof inputFile !== 'string' || !isAbsolute(inputFile)
    || resolve(inputFile) !== inputFile) fail();

const root = process.env.MYEONGHA_READER_PRIVACY_LEDGER_ROOT;
const signer = process.env.MYEONGHA_READER_PRIVACY_RECOVERY_PUBLIC_KEY_PEM;
const expected = process.env.MYEONGHA_READER_PRIVACY_EXPECTED_RESTORE_EPOCH;
if (!root || !isAbsolute(root) || resolve(root) !== root
    || root === '/' || root.startsWith('/tmp/') || root.startsWith('/run/')
    || !signer || !expected) fail();

const rootStat = lstatSync(root);
if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
    || (rootStat.mode & 0o077) !== 0) fail();

const publicKey = createPublicKey(signer);
if (publicKey.asymmetricKeyType !== 'ed25519') fail();

const inputStat = await lstat(inputFile);
if (!inputStat.isFile() || inputStat.isSymbolicLink()
    || inputStat.size === 0 || inputStat.size > MAX_BYTES) fail();

const raw = await readFile(inputFile);
let certificate;
try { certificate = JSON.parse(raw.toString('utf8')); } catch { fail(); }
const cert = certificate;
if (!cert || typeof cert !== 'object' || Array.isArray(cert)
    || cert.version !== 'official-reader-privacy-recovery-acceptance-v1'
    || cert.restoreEpoch !== expected
    || typeof cert.ledgerCheckpoint !== 'string'
    || cert.ledgerCheckpoint.length < 16 || cert.ledgerCheckpoint.length > 256
    || typeof cert.reconciliationDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(cert.reconciliationDigest)
    || !Number.isSafeInteger(cert.issuedAtEpochMs)
    || !Number.isSafeInteger(cert.validUntilEpochMs)
    || cert.issuedAtEpochMs > Date.now()
    || cert.validUntilEpochMs <= Date.now()
    || cert.validUntilEpochMs - cert.issuedAtEpochMs > 24 * 60 * 60 * 1000
    || typeof cert.signatureBase64Url !== 'string') fail();

const signBytes = Buffer.from(JSON.stringify([
  cert.version,
  cert.restoreEpoch,
  cert.ledgerCheckpoint,
  cert.reconciliationDigest,
  cert.issuedAtEpochMs,
  cert.validUntilEpochMs,
]), 'utf8');
const signature = Buffer.from(cert.signatureBase64Url, 'base64url');
if (signature.length !== 64
    || !verify(null, signBytes, publicKey, signature)) fail();

// Atomic replacement of only the Owner-signed certificate. Operator checks
// and signs the complete recovery/privacy evidence out-of-band first.
// No plaintext, account IDs, key refs or signed raw material in stdout.
const target = join(root, 'reader-privacy-recovery-acceptance-v1.json');
const temp = join(root, '.reader-acceptance-staging-' + process.pid + '.json');
let fd;
try {
  fd = await open(
    temp, constants.O_CREAT | constants.O_EXCL
      | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600,
  );
  await fd.writeFile(raw);
  await fd.sync();
  await fd.close();
  fd = undefined;
  await rename(temp, target);
  const dir = await open(root, constants.O_RDONLY | constants.O_DIRECTORY);
  try { await dir.sync(); } finally { await dir.close(); }
} finally {
  if (fd) await fd.close();
  try { await unlink(temp); } catch { /* already renamed */ }
  raw.fill(0);
}
process.stdout.write('Reader signed recovery evidence installed; public paid-read route remains OFF.\n');
