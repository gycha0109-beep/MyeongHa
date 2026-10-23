// Watchtower-Track: security
// R24 disposable-only G2->G3 boundary. Never mount on Vercel Fetch routes.
// Node 'finish' is OS handoff only; no proxy/client arrival guarantee.
import type {ServerResponse} from 'node:http';
import type {PostgresSubjectPoolV1} from './postgres-subject-execution.js';
import type {VerifiedSubjectIdentityEvidenceV1} from './subject-identity-resolver.js';
import type {SeyeonR23OfflineG2CommitReceiptV1} from './seyeon-g2-atomic-exact-final-source-commit-r23-candidate.js';
import {
  createSeyeonOriginalGrantPgSendAdapterV1,
} from './seyeon-original-grant-pg-send-adapter-v1.js';
import {
  assertSeyeonNodeChatResponseMetadataV1,
  sendSeyeonNodeOriginalGrantResponseV1,
  type SeyeonNodeChatResponseMetadataV1,
  type SeyeonNodeOriginalGrantSendOutcomeV1,
} from './seyeon-node-original-grant-send-boundary-v1.js';

export const SEYEON_R24_OFFLINE_G3_COMMITTED_NODE_REVEAL_V1=Object.freeze({
  version:'seyeon-r24-offline-g3-committed-node-reveal-v1',
  database:'myeongha_seyeon_positive_pin_candidate_test',
  transport:'node:http.ServerResponse',
  originalRightsSource:'seyeon_positive_candidate.reveal_http_r5',
  modes:Object.freeze(['first','committed_replay'] as const),
  productionMounted:false,
  permitsVercelFetch:false,
  permitsReaderHistory:false,
  permitsProvider:false,
} as const);

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
export class SeyeonR24OfflineG3HoldV1 extends Error{
  readonly code='R24_OFFLINE_G3_ORIGINAL_RIGHTS_HOLD' as const;
  constructor(){
    super('Offline committed source is not authorized for this response.');
    this.name='SeyeonR24OfflineG3HoldV1';
  }
}
export interface SendSeyeonR24OfflineG3InputV1{
  readonly receipt:SeyeonR23OfflineG2CommitReceiptV1;
  readonly pool:PostgresSubjectPoolV1;
  /** Must be produced by the server's auth verifier, not the request body. */
  readonly verifiedEvidence:VerifiedSubjectIdentityEvidenceV1;
  readonly threadId:string;
  readonly response:ServerResponse;
  readonly requestSignal:AbortSignal;
  readonly metadata:SeyeonNodeChatResponseMetadataV1;
  /** HTTP replays require a NEW DB locked original-rights query every time. */
  readonly purpose:'first'|'committed_replay';
  readonly deadlineMs?:number;
}

/**
 * Server-side orchestration of EXISTING R23 G2 receipt, R13 original-Grant
 * locked DB read, and R10 Node non-streaming response. Nothing here grants
 * authorization: R5 verifies current, immutable original Grant/Record and
 * committed Attempt/message in the same live DB transaction held until
 * Node socket finish; null emits 503/no-store instead of cached assistant.
 *
 * DO NOT expose this in Production. In particular, a Vercel Fetch Response,
 * stale committed replay cache, or an untrusted HTTP client cannot satisfy
 * D-04 S/R linearization. The actual trusted proxy/client final hop and
 * post-Preflight derived lineage still have G0 technical HOLD.
 */
export async function sendSeyeonR24OfflineG3V1(
  input:SendSeyeonR24OfflineG3InputV1,
):Promise<SeyeonNodeOriginalGrantSendOutcomeV1>{
  const r=input?.receipt, meta=input?.metadata;
  try{
    if(!r||r.status!=='disposable_atomic_v2_committed'
      ||r.replayed!==false||r.permitsProvider!==false
      ||r.permitsHttpReveal!==false
      ||input.verifiedEvidence?.kind!=='member'
      ||!UUID.test(input.verifiedEvidence.verifiedAuthUserId)
      ||!UUID.test(input.threadId)
      ||!UUID.test(r.turnId)||!UUID.test(r.attemptId)
      ||!UUID.test(r.assistantMessageId)||!UUID.test(r.postTurnOutboxEventId)
      ||!meta||meta.turnId!==r.turnId
      ||meta.assistantMessageId!==r.assistantMessageId
      ||meta.replayed!==(input.purpose==='committed_replay')
      ||(input.purpose!=='first'&&input.purpose!=='committed_replay')){
      throw new SeyeonR24OfflineG3HoldV1();
    }
    assertSeyeonNodeChatResponseMetadataV1(meta);
  }catch{
    // Failure is BEFORE any Postgres connection or socket write.
    throw new SeyeonR24OfflineG3HoldV1();
  }
  const withLockedOriginalGrant=createSeyeonOriginalGrantPgSendAdapterV1({
    verifiedEvidence:input.verifiedEvidence,
    pool:input.pool,
    threadId:input.threadId,
    turnId:r.turnId,
    committedAttemptId:r.attemptId,
    committedAssistantMessageId:r.assistantMessageId,
    expectedDisposableDatabase:
      SEYEON_R24_OFFLINE_G3_COMMITTED_NODE_REVEAL_V1.database,
  });
  // The Node sender does not read model/client text; it only serializes what
  // the locked R5 DB owner returned. Every replay constructs a fresh adapter.
  return sendSeyeonNodeOriginalGrantResponseV1({
    response:input.response,
    requestSignal:input.requestSignal,
    withLockedOriginalGrant,
    chatResponseMetadata:meta,
    ...(input.deadlineMs===undefined?{}:{deadlineMs:input.deadlineMs}),
  });
}
