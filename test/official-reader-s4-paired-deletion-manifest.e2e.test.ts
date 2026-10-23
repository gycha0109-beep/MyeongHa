import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import {
  createOfficialReaderNodeOffPrimaryStoreV1,
} from '../apps/api/src/official-reader-node-offprimary-privacy-store-v1.js';
import {
  createOfficialReaderAccountPrivacyDeletionPortV1,
} from '../apps/api/src/official-reader-private-account-deletion-lifecycle-v1.js';

const SUBJECT='a1111111-1111-4111-8111-111111111111';
const READING='b2222222-2222-4222-8222-222222222222';
const JOB='c3333333-3333-4333-8333-333333333333';
const BODY_A='d4444444-4444-4444-8444-444444444444';
const BODY_B='e5555555-5555-4555-8555-555555555555';
const KEY_A='reader-dek-v1:f6666666-6666-4666-8666-666666666666';
const KEY_B='reader-dek-v1:a7777777-7777-4777-8777-777777777777';
const roots: string[]=[];
afterEach(()=>{
  for (const root of roots.splice(0)) {
    chmodSync(root,0o700);
    rmSync(root,{recursive:true,force:true});
  }
});

function fixture() {
  const root=mkdtempSync(join(process.cwd(),'.reader-s4-pair-test-'));
  roots.push(root);
  const ledgerRoot=join(root,'ledger');
  const keyRoot=join(root,'keys');
  mkdirSync(ledgerRoot,{mode:0o700});
  mkdirSync(keyRoot,{mode:0o700});
  const config={
    ledgerRoot,keyRoot,
    ledgerSealKey:randomBytes(32),
    keySealKey:randomBytes(32),
  };
  return {store:createOfficialReaderNodeOffPrimaryStoreV1(config),config};
}

describe('private Reader erasure keeps each body paired with its original key',()=>{
  it('persists and re-reads the exact pair mapping in the durable refund fence',async()=>{
    const {store,config}=fixture();
    // Lexicographic ordering of bodies and keys is deliberately opposite.
    const input={
      jobId:JOB,subjectId:SUBJECT,officialReadingId:READING,
      readerCharacterId:'seyeon',
      bodyIds:[BODY_B,BODY_A],
      keyRefs:[KEY_B,KEY_A],
    };
    const saved=await store.scopeLedger.recordScopeDeletionFence(input);
    expect(saved.bodyIds).toEqual([BODY_A,BODY_B]);
    expect(saved.keyRefs).toEqual([KEY_A,KEY_B]);
    const reopened=createOfficialReaderNodeOffPrimaryStoreV1(config);
    expect(await reopened.scopeLedger.readScopeDeletionFence(JOB))
      .toMatchObject({bodyIds:[BODY_A,BODY_B],keyRefs:[KEY_A,KEY_B]});
    // Immutable job ID cannot silently accept a different body->key binding.
    await expect(reopened.scopeLedger.recordScopeDeletionFence({
      ...input,keyRefs:[KEY_A,KEY_B],
    })).rejects.toThrow();
  });

  it('preserves each pair in an account-deletion fence instead of independently sorting the keys',async()=>{
    const {store}=fixture();
    const saved=await store.ledger.recordAccountDeletionFence({
      subjectId:SUBJECT,deletionJobId:JOB,
      bodyIds:[BODY_B,BODY_A],keyRefs:[KEY_B,KEY_A],
    });
    expect(saved.bodyIds).toEqual([BODY_A,BODY_B]);
    expect(saved.keyRefs).toEqual([KEY_A,KEY_B]);
    expect(await store.ledger.readAccountDeletionFence({
      subjectId:SUBJECT,deletionJobId:JOB,
    })).toMatchObject({
      bodyIds:[BODY_A,BODY_B],keyRefs:[KEY_A,KEY_B],
    });
  });

  it('refuses a ledger that swapped two keys between legitimate bodies',async()=>{
    const swapped={
      version:'official-reader-account-deletion-fence-v1' as const,
      subjectId:SUBJECT,deletionJobId:JOB,
      fenceId:'97777777-7777-4777-8777-777777777777',
      bodyIds:[BODY_A,BODY_B],
      keyRefs:[KEY_B,KEY_A],
    };
    const readAccountDeletionFence=vi.fn(async()=>swapped);
    const recordAccountDeletionFence=vi.fn(async()=>swapped);
    const destroyKey=vi.fn(async()=>{});
    const port=createOfficialReaderAccountPrivacyDeletionPortV1({
      ledger:{
        recordAccountDeletionFence,
        readAccountDeletionFence,
        acknowledgeAccountKeyErasure:async()=>true,
      },
      keys:{destroyKey,isKeyDestroyed:async()=>false},
    });
    await expect(port.fenceBeforeDatabaseDeletion({
      subjectId:SUBJECT,deletionJobId:JOB,
      manifest:{entries:[
        {bodyId:BODY_B,encryptionKeyRef:KEY_B},
        {bodyId:BODY_A,encryptionKeyRef:KEY_A},
      ]},
    })).rejects.toThrow();
    expect(recordAccountDeletionFence).toHaveBeenCalledTimes(1);
    expect(readAccountDeletionFence).not.toHaveBeenCalled();
    expect(destroyKey).not.toHaveBeenCalled();
  });
});
