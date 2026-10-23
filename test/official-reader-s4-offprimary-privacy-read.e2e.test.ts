import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync, mkdtempSync, rmSync, writeFileSync,
} from 'node:fs';
import {
  createHmac, generateKeyPairSync, randomBytes, sign,
} from 'node:crypto';
import { join } from 'node:path';
import {
  createOfficialReaderNodeOffPrimaryPrivacyReadPortV1,
  officialReaderRecoveryAcceptanceSignaturePayloadV1,
} from '../apps/api/src/official-reader-node-offprimary-privacy-read-v1.js';

const SUBJECT='a1111111-1111-4111-8111-111111111111';
const SIBLING='c3333333-3333-4333-8333-333333333333';
const EPOCH='b2222222-2222-4222-8222-222222222222';
const SELECTOR='original-reader-s6-synthetic-scope';
const CHECKPOINT='durable-s4-replay-checkpoint-001';
const CERT='reader-privacy-recovery-acceptance-v1.json';
const roots:string[]=[];
afterEach(()=>{
  for(const root of roots.splice(0)) {
    chmodSync(root,0o700);
    rmSync(root,{recursive:true,force:true});
  }
});
function fixture() {
  // The private contract explicitly rejects temporary mounts (/tmp) and
  // symlinks. This disposable test uses only the local checked-out workspace.
  const root=mkdtempSync(join(process.cwd(),'.reader-s4-privacy-test-'));
  roots.push(root);
  const seal=randomBytes(32);
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const certificatePath=join(root,CERT);
  const issuedAtEpochMs=Date.now()-500;
  function writeAcceptance(options:{
    restoreEpoch?:string; signed?:boolean; expiresAtEpochMs?:number;
    reconciliationDigest?:string;
  }={}) {
    const restoreEpoch=options.restoreEpoch??EPOCH;
    const content={
      restoreEpoch,
      ledgerCheckpoint:CHECKPOINT,
      reconciliationDigest: options.reconciliationDigest ?? 'sha256:'+'a'.repeat(64),
      issuedAtEpochMs,
      validUntilEpochMs:options.expiresAtEpochMs??Date.now()+15_000,
    };
    const signatureBase64Url=sign(
      null,officialReaderRecoveryAcceptanceSignaturePayloadV1(content),privateKey,
    ).toString('base64url');
    writeFileSync(certificatePath,JSON.stringify({
      version:'official-reader-privacy-recovery-acceptance-v1',
      ...content,
      signatureBase64Url:options.signed===false
        ? signatureBase64Url.slice(0,-2)+'xy'
        : signatureBase64Url,
    }),{mode:0o600});
  }
  writeAcceptance();
  const port=createOfficialReaderNodeOffPrimaryPrivacyReadPortV1({
    ledgerRoot:root,
    ledgerSealKey:seal,
    recoverySignerPublicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString(),
    expectedRestoreEpoch:EPOCH,
  });
  const tombstone=join(root,'account-subject-deny-'+createHmac('sha256',seal)
    .update(['account-subject-deny',SUBJECT].join('|'),'utf8')
    .digest('hex')+'.json');
  return {root,port,tombstone,writeAcceptance};
}
describe('Privacy #2318 off-primary S4 restore lease and Subject denial',()=>{
  it('accepts only a live signed restore checkpoint and never approves service release',async()=>{
    const x=fixture();
    const lease=await x.port.acquireReadLease({subjectId:SUBJECT,selector:SELECTOR});
    expect(lease).toMatchObject({
      contractVersion:'official-reader-privacy-read-lease-v1',
      subjectId:SUBJECT,selector:SELECTOR,
      restoreEpoch:EPOCH,ledgerCheckpoint:CHECKPOINT,
    });
    expect(lease).not.toBeNull();
    if(!lease)throw Error('expected synthetic lease');
    expect(lease.expiresAtEpochMs).toBeLessThanOrEqual(Date.now()+3_000);
    expect(x.port.isLeaseCurrent({
      lease,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(true);
    expect(x.port.isLeaseCurrent({
      lease,subjectId:SUBJECT,selector:'other-reader',currentEpochMs:Date.now(),
    })).toBe(false);
  });
  it('denies an existing lease and new requests as soon as a Subject tombstone appears',async()=>{
    const x=fixture();
    const lease=await x.port.acquireReadLease({subjectId:SUBJECT,selector:SELECTOR});
    if(!lease)throw Error('expected synthetic lease');
    writeFileSync(x.tombstone,'synthetic-deny-only',{mode:0o600});
    expect(x.port.isLeaseCurrent({
      lease,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(false);
    await expect(x.port.acquireReadLease({
      subjectId:SUBJECT,selector:SELECTOR,
    })).resolves.toBeNull();
  });
  it('never maps an uppercase UUID alias to a missing deletion tombstone',async()=>{
    const x=fixture();
    const before=await x.port.acquireReadLease({
      subjectId:SUBJECT.toUpperCase(),selector:SELECTOR,
    });
    // Even before a known denial, the independent authority must use only
    // the canonical UUID bytes used when sealing the deletion ledger.
    expect(before).toBeNull();
    writeFileSync(x.tombstone,'synthetic-deny-only',{mode:0o600});
    await expect(x.port.acquireReadLease({
      subjectId:SUBJECT.toUpperCase(),selector:SELECTOR,
    })).resolves.toBeNull();
    const uppercaseLease={
      contractVersion:'official-reader-privacy-read-lease-v1' as const,
      subjectId:SUBJECT.toUpperCase(),selector:SELECTOR,
      restoreEpoch:EPOCH,ledgerCheckpoint:CHECKPOINT,
      expiresAtEpochMs:Date.now()+1_000,
    };
    expect(x.port.isLeaseCurrent({
      lease:uppercaseLease,subjectId:SUBJECT.toUpperCase(),
      selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(false);
  });
  it('scopes independent Subject deletion denial to only the exact member',async()=>{
    const x=fixture();
    const siblingLease=await x.port.acquireReadLease({
      subjectId:SIBLING,selector:SELECTOR,
    });
    expect(siblingLease?.subjectId).toBe(SIBLING);
    writeFileSync(x.tombstone,'synthetic-deny-only',{mode:0o600});
    expect(await x.port.acquireReadLease({
      subjectId:SUBJECT,selector:SELECTOR,
    })).toBeNull();
    expect(await x.port.acquireReadLease({
      subjectId:SIBLING,selector:SELECTOR,
    })).toMatchObject({subjectId:SIBLING});
    if(!siblingLease)throw Error('expected sibling lease');
    expect(x.port.isLeaseCurrent({
      lease:siblingLease,subjectId:SIBLING,
      selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(true);
  });
  it('never trusts an expired, mismatched, or incorrectly signed checkpoint',async()=>{
    const x=fixture();
    const lease=await x.port.acquireReadLease({subjectId:SUBJECT,selector:SELECTOR});
    if(!lease)throw Error('expected synthetic lease');
    for(const mutation of [
      {restoreEpoch:'c3333333-3333-4333-8333-333333333333'},
      {signed:false},
      {expiresAtEpochMs:Date.now()-100},
    ]) {
      x.writeAcceptance(mutation);
      expect(x.port.isLeaseCurrent({
        lease,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
      })).toBe(false);
      await expect(x.port.acquireReadLease({
        subjectId:SUBJECT,selector:SELECTOR,
      })).resolves.toBeNull();
    }
  });
  it('invalidates an active lease when the signed reconciliation is replaced without changing the restore epoch',async()=>{
    const x=fixture();
    const lease=await x.port.acquireReadLease({subjectId:SUBJECT,selector:SELECTOR});
    if(!lease)throw Error('expected synthetic lease');
    expect(lease.acceptanceProofDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(x.port.isLeaseCurrent({
      lease,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(true);
    // Still-valid certificate, same epoch/checkpoint, different signed
    // reconciliation. An old paid-read should not proceed after rotation.
    x.writeAcceptance({reconciliationDigest:'sha256:'+'b'.repeat(64)});
    expect(x.port.isLeaseCurrent({
      lease,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(false);
    const replacement=await x.port.acquireReadLease({subjectId:SUBJECT,selector:SELECTOR});
    expect(replacement).not.toBeNull();
    if(!replacement)throw Error('expected new signed lease');
    expect(replacement.acceptanceProofDigest).not.toBe(lease.acceptanceProofDigest);
    expect(x.port.isLeaseCurrent({
      lease:replacement,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(true);
  });
  it('fails closed when the independent ledger directory becomes unsafe',async()=>{
    const x=fixture();
    const lease=await x.port.acquireReadLease({subjectId:SUBJECT,selector:SELECTOR});
    if(!lease)throw Error('expected synthetic lease');
    chmodSync(x.root,0o777);
    expect(x.port.isLeaseCurrent({
      lease,subjectId:SUBJECT,selector:SELECTOR,currentEpochMs:Date.now(),
    })).toBe(false);
    await expect(x.port.acquireReadLease({
      subjectId:SUBJECT,selector:SELECTOR,
    })).resolves.toBeNull();
  });
});
