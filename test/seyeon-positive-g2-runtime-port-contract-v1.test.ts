// Watchtower-Track: security
// Staged positive G1/G2 runtime adapter only. No Production DB, Provider,
// positive Projector, owner ACL, or HTTP Reveal is enabled by these tests.
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {canonicalJson} from '../packages/domain/src/index.js';
import type {PostgresTransactionQueryV1} from '../apps/api/src/postgres-subject-execution.js';
import {createSeyeonPositiveS0OwnerDbPortsV1} from
  '../apps/api/src/postgres-seyeon-positive-memory-source-runtime-v1.js';

const ids={
  subject:'d1000000-0000-4000-8000-000000000001',
  thread:'d2000000-0000-4000-8000-000000000002',
  turn:'d3000000-0000-4000-8000-000000000003',
  attempt:'d4000000-0000-4000-8000-000000000004',
  user:'d5000000-0000-4000-8000-000000000005',
  assistant:'d6000000-0000-4000-8000-000000000006',
  chatOutbox:'d7000000-0000-4000-8000-000000000007',
  postOutbox:'d8000000-0000-4000-8000-000000000008',
};
const hash=(value:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(value)).digest('hex');
const original={
  schemaVersion:'seyeon-post-turn-analysis-snapshot-v1',
  mode:'OFF' as const,
  turnId:ids.turn,
  assistantMessageId:ids.assistant,
  userMessageId:ids.user,
  preparedAt:'2026-10-21T03:00:00.000Z',
  productionAuthorityRef:'synthetic-staged-g2-only',
  interpretation:{},envelope:{},eventAuthorityEvidence:{},
  priorEvents:[],relationshipBefore:{},productionCausalBindings:[],
  identity:{
    experimentalEventId:ids.attempt,
    experimentalEventDedupeKey:'synthetic-staged-g2-event',
    productionEventId:ids.chatOutbox,
    relationshipSyncOutboxEventId:ids.postOutbox,
  },
};
const input=(snapshot:unknown,snapshotHash:string)=>({
  subjectId:ids.subject,threadId:ids.thread,turnId:ids.turn,
  attemptId:ids.attempt,assistantMessageId:ids.assistant,
  chatOutboxEventId:ids.chatOutbox,postTurnOutboxEventId:ids.postOutbox,
  postTurnSnapshot:snapshot,postTurnSnapshotHash:snapshotHash,
  selectedSourcesDigest:'sha256:v1:'+'a'.repeat(64),
  finalModelContextDigest:'sha256:v1:'+'b'.repeat(64),
});

describe('Se-yeon staged positive G2 official Snapshot admission',()=>{
  it('rejects a rehashed forged or malformed official Snapshot BEFORE DB',async()=>{
    let queries=0;
    const port=createSeyeonPositiveS0OwnerDbPortsV1({
      query:async()=>{queries++;throw Error('unexpected DB call');},
    } as unknown as PostgresTransactionQueryV1);
    for(const forged of [
      {...original,turnId:'d3000000-0000-4000-8000-000000000099'},
      {...original,assistantMessageId:'d6000000-0000-4000-8000-000000000099'},
      {...original,unknownPrivateContent:'unapproved-derived'},
      {...original,identity:{...original.identity,unknown:'unregistered'}},
      {...original,mode:'NOT_REGISTERED'},
    ]){
      await expect(port.commitAfterValidation(input(forged,hash(forged))))
        .rejects.toThrow();
    }
    await expect(port.commitAfterValidation(input(
      original,'sha256:v1:'+'0'.repeat(64),
    ))).rejects.toThrow();
    expect(queries).toBe(0);
  });

  it('does not grant local authority to a rehashed replacement UserMessage',async()=>{
    let calls=0;
    const port=createSeyeonPositiveS0OwnerDbPortsV1({
      query:async()=>{
        calls++;
        throw Error('seyeon_positive_g2_snapshot_original_user_message_mismatch');
      },
    } as unknown as PostgresTransactionQueryV1);
    const forged={...original,
      userMessageId:'d5000000-0000-4000-8000-000000000099'};
    await expect(port.commitAfterValidation(input(forged,hash(forged))))
      .rejects.toThrow(
        'seyeon_positive_g2_snapshot_original_user_message_mismatch',
      );
    // It must reach the owner G2 RPC. Only the actual PostgreSQL lock/read
    // in PR #2426 can attest the original DB UserMessage (not this mock).
    expect(calls).toBe(1);
  });
});
