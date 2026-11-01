// Watchtower-Track: security
// R26: real Cost Governor RESERVATION for a DB-pinned, native wire packet.
// Named disposable PostgreSQL only. NEVER permits external Provider dispatch.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {buildSeyeonTurnInterpreterRequestV2} from './seyeon-character-runtime-v2.js';
import {
  executePostgresSubjectTransactionV1,
} from './postgres-subject-execution.js';
import {
  startGovernedSeyeonAiCallV1,
  type SeyeonAiGovernorAdmissionV1,
} from './postgres-seyeon-ai-cost-ledger-v1.js';
import {
  quoteSeyeonCostGovernorMaximumV1,
} from './seyeon-cost-governor-server-policy-v1.js';
import {
  assertSeyeonR21OfflineDerivedSourceClosureV1,
} from './seyeon-r21-offline-derived-source-closure-v1.js';
import {
  assertSeyeonR35OfflineActualWireV1,
  type SeyeonR35OfflineWireReceiptV1,
} from './seyeon-r35-offline-actual-provider-wire-pin-v1.js';
import type {PersistSeyeonR20OfflineDigestBoundInputV1} from
  './seyeon-positive-raw-projection-digest-bind-r20-candidate.js';
import type {OpenAiSeyeonStructuredProviderConfigV1} from
  './openai-seyeon-structured-provider-v1.js';

export const SEYEON_R26_G4_DISPOSABLE_V1=Object.freeze({
  database:'myeongha_seyeon_positive_pin_candidate_test',
  phase:'chat',
  purpose:'turn_interpretation',
  provider:'openai-responses',
  model:'seyeon-r35-offline',
  productionMounted:false,
  permitsProvider:false,
  permitsHttpReveal:false,
  permitsAtomicCommit:false,
} as const);

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const PG_SHA=/^sha256:pg-jsonb:v1:[a-f0-9]{64}$/u;
const digest=(v:unknown)=>'sha256:v1:'+
  createHash('sha256').update(canonicalJson(v)).digest('hex');

export class SeyeonR26OfflineG4HoldV1 extends Error {
  readonly code='R26_G4_DISPOSABLE_RESERVATION_HOLD' as const;
  constructor(){
    super('Governed offline reservation and both original sources are not jointly proved.');
    this.name='SeyeonR26OfflineG4HoldV1';
  }
}

export interface ReserveSeyeonR26OfflineG4InputV1{
  /** Existing R20/R21 committed Pin, server-assembled model Context. */
  readonly pinInput:PersistSeyeonR20OfflineDigestBoundInputV1;
  /** Returned only after the R35 source Pin transaction committed. */
  readonly wireAttestation:SeyeonR35OfflineWireReceiptV1;
  readonly call:Parameters<NonNullable<
    OpenAiSeyeonStructuredProviderConfigV1['meteredBeforeDispatch']
  >>[0];
  /** EXACT bytes produced by native Provider before its fetch, unchanged. */
  readonly requestBody:string;
  /** Offline trusted server-owned quote/certification only, never from browser. */
  readonly governor:SeyeonAiGovernorAdmissionV1;
}
export interface SeyeonR26OfflineG4ReceiptV1{
  readonly status:'disposable_governed_reservation_committed_without_dispatch';
  readonly callId:string;
  readonly selectedSourcesDigest:string;
  readonly wireBodyDigest:string;
  readonly inputCeilingTokens:number;
  readonly outputCeilingTokens:number;
  readonly reservedMicroUsd:string;
  readonly bucketUtcDate:string;
  readonly permitsProvider:false;
  readonly permitsAtomicCommit:false;
  readonly permitsHttpReveal:false;
}

/**
 * The R35 receipt is an untrusted correlation value, not a DB signature.
 * R26 reconstructs the complete original/model/wire proof and re-reads each
 * CURRENT original Grant/JSONB via the SECURITY DEFINER R20 inspector.
 * The SAME Subject transaction invokes the existing atomic DB Cost Governor:
 * no policy/budget/Grant bypass, duplicate Call ID, or zero-cost fallthrough.
 *
 * A quoted/reserved call is NEVER sent here. The actual paid Provider hook
 * MUST unconditionally throw after this candidate returns. Production G4
 * remains prohibited pending source/Provider/settlement release authorization.
 */
export async function reserveSeyeonR26OfflineGovernedWireV1(
  input:ReserveSeyeonR26OfflineG4InputV1,
):Promise<SeyeonR26OfflineG4ReceiptV1>{
  try{
    const {pinInput,wireAttestation,call,requestBody,governor}=input;
    const selection=pinInput.selection;
    const count=selection?.selectedPersonalRecordCount;
    if((count!==1&&count!==2)||selection.selectedMemoryCount!==count
      ||!UUID.test(pinInput.attemptId)
      ||!UUID.test(call.callId)||call.purpose!=='turn_interpretation'
      ||call.modelKey!==SEYEON_R26_G4_DISPOSABLE_V1.model
      ||call.providerKey!==SEYEON_R26_G4_DISPOSABLE_V1.provider
      ||wireAttestation.status!=='disposable_db_pin_and_pre_dispatch_wire_attested'
      ||wireAttestation.attemptId!==pinInput.attemptId
      ||wireAttestation.selectedSourcesDigest!==selection.selectedSourcesDigest
      ||wireAttestation.finalModelContextDigest!==digest(pinInput.finalModelContext)
      ||wireAttestation.permitsProvider!==false
      ||wireAttestation.permitsAtomicCommit!==false
      ||wireAttestation.permitsHttpReveal!==false
      ||governor.policy.providerKey!==SEYEON_R26_G4_DISPOSABLE_V1.provider
      ||governor.policy.modelKey!==SEYEON_R26_G4_DISPOSABLE_V1.model
      ||governor.policy.allowedPurposes.length!==1
      ||governor.policy.allowedPurposes[0]!=='turn_interpretation'
      ||!Number.isSafeInteger(governor.policy.maximumOutputTokens)
      ||governor.policy.maximumOutputTokens>32_768)
      throw new SeyeonR26OfflineG4HoldV1();

    assertSeyeonR21OfflineDerivedSourceClosureV1({
      envelope:pinInput.sourceEnvelope,
      retrievedMemories:pinInput.retrievedMemories,
      sourceCandidates:pinInput.sourceCandidates,
      expectedOriginalMemoryCount:count,
    });
    const matched=assertSeyeonR35OfflineActualWireV1({
      pinned:{
        status:'disposable_original_and_projection_digests_committed',
        selectedPersonalRecordCount:count,
        selectedSourcesDigest:wireAttestation.selectedSourcesDigest,
        finalModelContextDigest:wireAttestation.finalModelContextDigest,
        permitsProvider:false,permitsAtomicCommit:false,permitsHttpReveal:false,
      },
      pinInput,call,requestBody,
      enforcedOutputTokens:governor.policy.maximumOutputTokens,
    });
    if(matched!==wireAttestation.wireBodyDigest)
      throw new SeyeonR26OfflineG4HoldV1();

    const exactBytes=Buffer.byteLength(requestBody,'utf8');
    if(call.requestBodyBytes!==exactBytes)
      throw new SeyeonR26OfflineG4HoldV1();
    const tokenBound=await governor.certifiedInputTokenUpperBound(
      buildSeyeonTurnInterpreterRequestV2(pinInput.finalModelContext),
      exactBytes,requestBody,
    );
    const quote=quoteSeyeonCostGovernorMaximumV1({
      policy:governor.policy,
      request:{
        purpose:'turn_interpretation',
        providerKey:call.providerKey,modelKey:call.modelKey,
        serializedRequestBytes:exactBytes,
        verifiedInputTokenUpperBound:tokenBound,
        enforcedOutputTokenLimit:governor.policy.maximumOutputTokens,
      },
    });
    const charged=await executePostgresSubjectTransactionV1({
      pool:pinInput.pool,verifiedEvidence:pinInput.verifiedEvidence,
      execute:async({client,resolvedSubject})=>{
        if(resolvedSubject.subjectKind!=='member'||!UUID.test(resolvedSubject.subjectId))
          throw new SeyeonR26OfflineG4HoldV1();
        const db=await client.query<{name:unknown}>('select current_database() as name');
        if(db.rows.length!==1||db.rows[0]?.name!==SEYEON_R26_G4_DISPOSABLE_V1.database)
          throw new SeyeonR26OfflineG4HoldV1();
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '7000ms'");
        const read=await client.query<{original:unknown}>(`
select seyeon_positive_candidate.inspect_pinned_raw_source_r20(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid
) as original
`.trim(),[
          resolvedSubject.subjectId,pinInput.threadId,pinInput.turnId,
          pinInput.attemptId,
        ]);
        const original=read.rows.length===1?read.rows[0]?.original:null;
        if(!original||typeof original!=='object'||Array.isArray(original))
          throw new SeyeonR26OfflineG4HoldV1();
        const proof=original as Record<string,unknown>;
        if(proof.sourceCount!==count
          ||proof.selectedSourcesDigest!==selection.selectedSourcesDigest
          ||!Array.isArray(proof.sources)||proof.sources.length!==count)
          throw new SeyeonR26OfflineG4HoldV1();
        for(let index=0;index<count;index++){
          const source=selection.selectedSources[index];
          const row=proof.sources[index];
          if(!source||!row||typeof row!=='object'||Array.isArray(row))
            throw new SeyeonR26OfflineG4HoldV1();
          const current=row as Record<string,unknown>;
          if(current.ordinal!==index||current.recordKind!=='memory'
            ||current.recordId!==source.recordId||current.grantId!==source.grantId
            ||current.recordType!==source.recordType
            ||current.schemaVersion!==source.schemaVersion
            ||typeof current.pgPayloadDigest!=='string'
            ||!PG_SHA.test(current.pgPayloadDigest)
            ||digest({
              kind:'memory',recordId:source.recordId,grantId:source.grantId,
              recordType:source.recordType,schemaVersion:source.schemaVersion,
              payload:current.payload,
            })!==source.rawRecordDigest)
            throw new SeyeonR26OfflineG4HoldV1();
        }
        return startGovernedSeyeonAiCallV1(client,{
          subjectId:resolvedSubject.subjectId,turnId:pinInput.turnId,
          attemptId:pinInput.attemptId,phase:'chat',
        },{
          callId:call.callId,purpose:call.purpose,
          providerKey:call.providerKey,modelKey:call.modelKey,
          requestBodyBytes:exactBytes,quote,
        });
      },
    });
    // Reservation committed. Intentional HARD STOP: a real Provider result
    // would require independent dispatch and settlement authorization.
    return Object.freeze({
      status:'disposable_governed_reservation_committed_without_dispatch' as const,
      callId:charged.callId,selectedSourcesDigest:selection.selectedSourcesDigest,
      wireBodyDigest:matched,inputCeilingTokens:quote.inputCeilingTokens,
      outputCeilingTokens:quote.outputCeilingTokens,
      reservedMicroUsd:charged.ceilingMicroUsd.toString(),
      bucketUtcDate:charged.bucketUtcDate,
      permitsProvider:false as const,permitsAtomicCommit:false as const,
      permitsHttpReveal:false as const,
    });
  }catch{
    throw new SeyeonR26OfflineG4HoldV1();
  }
}
