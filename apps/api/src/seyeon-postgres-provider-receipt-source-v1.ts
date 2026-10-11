import type { NodePostgresDriverClientV1, NodePostgresDriverPoolV1 } from './node-postgres-subject-pool.js';
import {
  DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1,
  SEYEON_DETACHED_WORKER_ROLE_V1,
  verifySeyeonDetachedWorkerLoginV1,
  type SeyeonDetachedSettlementReceiptSourceV1,
  type SeyeonServerStoredProviderReceiptV1,
} from './seyeon-detached-settlement-worker-v1.js';
import {
  createSeyeonAiCostEventV1,
  type SeyeonAiCallOutcomeV1,
  type SeyeonAiTokenUsageV1,
} from './seyeon-ai-usage-cost-v1.js';

/**
 * D4B-10C3: offline-only private PostgreSQL receipt source.
 * No HTTP route, schedule, credential reader, inference or Production login.
 * This client may use ONLY the separately provisioned strict worker principal.
 */
export const SEYEON_PROVIDER_RECEIPT_SOURCE_VERSION_V1 =
  'seyeon-provider-receipt-source-v1' as const;

export const CLAIM_SEYEON_PROVIDER_RECEIPT_SQL_V1 = `
select call_id::text as "callId",
       subject_id::text as "subjectId",
       turn_id::text as "turnId",
       attempt_id::text as "attemptId",
       phase, purpose, provider_key as "providerKey", model_key as "modelKey",
       price_version as "priceVersion",
       input_rate::text as "inputRate",
       cached_input_rate::text as "cachedInputRate",
       output_rate::text as "outputRate",
       provider_event as "providerEvent",
       claim_token::text as "claimToken"
from public.cmd_claim_seyeon_provider_receipt_v1()
`.trim();

export const ACK_SEYEON_PROVIDER_RECEIPT_SQL_V1 = `
select public.cmd_ack_seyeon_provider_receipt_v1(
  $1::uuid,$2::uuid
) as "acknowledged"
`.trim();

const SET_ROLE = 'SET LOCAL ROLE myeongha_seyeon_settlement_worker';
const VERIFY_ROLE = 'select current_user::text as "currentUser"';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const KEY = /^[a-zA-Z0-9._:/-]{1,128}$/u;
const PURPOSE = /^[a-z_]{1,64}$/u;
const OUTCOMES:readonly SeyeonAiCallOutcomeV1[] = [
  'response_received','http_failure','network_failure','timeout',
  'invalid_content_type','invalid_response',
];
const EXPECTED_KEYS = Object.keys(createSeyeonAiCostEventV1({
  callId:'00000000-0000-4000-8000-000000000000',
  purpose:'event_extraction',providerKey:'openai-responses',modelKey:'offline-model',
  outcome:'timeout',httpStatus:null,elapsedMs:0,
  usage:{inputTokens:null,outputTokens:null,cachedInputTokens:null,reasoningTokens:null},
})).sort();

function fail(): never {
  throw new Error('Private Provider receipt is not authoritative.');
}
function exactId(value:unknown):string {
  if (typeof value!=='string'||!UUID.test(value)) return fail();
  return value.toLowerCase();
}
function exactKey(value:unknown, pattern:RegExp):string {
  if (typeof value!=='string'||!pattern.test(value)) return fail();
  return value;
}
function amount(value:unknown, allowZero:boolean):number {
  if (typeof value!=='string'||!/^(0|[1-9][0-9]*)$/u.test(value)) return fail();
  const parsed=Number(value);
  if (!Number.isSafeInteger(parsed)||parsed<0||(!allowZero&&parsed===0)) return fail();
  return parsed;
}
function nonnegative(value:unknown):number {
  if (typeof value!=='number'||!Number.isSafeInteger(value)||value<0) return fail();
  return value;
}
function nullable(value:unknown):number|null {
  if (value===null) return null;
  return nonnegative(value);
}
function record(value:unknown):Record<string,unknown> {
  if (typeof value!=='object'||value===null||Array.isArray(value)) return fail();
  return value as Record<string,unknown>;
}

/** Validate the DB-stored JSON against the pinned cost quote, not a client's price. */
function receiptFromClaim(row:Record<string,unknown>):{
  receipt:SeyeonServerStoredProviderReceiptV1;
  claimToken:string;
} {
  const callId=exactId(row.callId);
  const subjectId=exactId(row.subjectId);
  const turnId=exactId(row.turnId);
  const attemptId=exactId(row.attemptId);
  const claimToken=exactId(row.claimToken);
  const phase=row.phase;
  if (phase!=='chat'&&phase!=='post_turn') return fail();
  const purpose=exactKey(row.purpose,PURPOSE);
  const providerKey=exactKey(row.providerKey,KEY);
  const modelKey=exactKey(row.modelKey,KEY);
  const priceVersion=exactKey(row.priceVersion,KEY);
  const reservedPrice=Object.freeze({
    priceVersion,providerKey,modelKey,
    inputMicroUsdPerMillion:amount(row.inputRate,false),
    cachedInputMicroUsdPerMillion:amount(row.cachedInputRate,true),
    outputMicroUsdPerMillion:amount(row.outputRate,false),
  });

  const event=record(row.providerEvent);
  const eventKeys=Object.keys(event).sort();
  if (eventKeys.length!==EXPECTED_KEYS.length ||
      eventKeys.some((key,i)=>key!==EXPECTED_KEYS[i])) return fail();
  const outcome=event.outcome;
  if (typeof outcome!=='string'||
      !OUTCOMES.includes(outcome as SeyeonAiCallOutcomeV1)) return fail();
  const usage:SeyeonAiTokenUsageV1=Object.freeze({
    inputTokens:nullable(event.inputTokens),
    cachedInputTokens:nullable(event.cachedInputTokens),
    outputTokens:nullable(event.outputTokens),
    reasoningTokens:nullable(event.reasoningTokens),
  });
  const httpStatus=nullable(event.httpStatus);
  const elapsedMs=nonnegative(event.elapsedMs);
  const normalized=createSeyeonAiCostEventV1({
    callId,purpose,providerKey,modelKey,
    outcome:outcome as SeyeonAiCallOutcomeV1,
    httpStatus,elapsedMs,usage,price:reservedPrice,
  });
  // Avoid silently accepting tampered cost, missing usage or an extra JSON field.
  for (const key of EXPECTED_KEYS) {
    if (normalized[key as keyof typeof normalized]!==event[key]) return fail();
  }
  return {
    claimToken,
    receipt:Object.freeze({
      callId,subjectId,turnId,attemptId,phase,purpose,providerKey,modelKey,
      reservedPrice,
      providerResult:Object.freeze({outcome:outcome as SeyeonAiCallOutcomeV1,
        httpStatus,elapsedMs,usage}),
    }),
  };
}

async function withRole<T>(
  pool:NodePostgresDriverPoolV1,
  execute:(client:NodePostgresDriverClientV1)=>Promise<T>,
):Promise<T> {
  const client=await pool.connect();
  let begun=false;
  let discard:Error|undefined;
  try {
    const preflight=await client.query(DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1);
    verifySeyeonDetachedWorkerLoginV1(preflight.rows);
    await client.query('BEGIN');begun=true;
    await client.query(SET_ROLE);
    const identity=await client.query(VERIFY_ROLE);
    if (identity.rows.length!==1 ||
        identity.rows[0]?.currentUser!==SEYEON_DETACHED_WORKER_ROLE_V1) return fail();
    const answer=await execute(client);
    // No receipt is published until the claim/ACK transaction commits.
    await client.query('COMMIT');begun=false;
    return answer;
  } catch(error) {
    discard=new Error('Private Provider receipt transaction outcome unknown.');
    if (begun) {
      try { await client.query('ROLLBACK'); } catch { /* discard connection */ }
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

/** The single-outstanding lease belongs to this process and is never client-supplied. */
export function createSeyeonPostgresProviderReceiptSourceV1(
  pool:NodePostgresDriverPoolV1,
):SeyeonDetachedSettlementReceiptSourceV1 {
  let pending:{callId:string;token:string}|null=null;
  return Object.freeze({
    async loadNextStoredReceipt(){
      if (pending!==null) return fail();
      const claim=await withRole(pool,async client=>{
        const rows=(await client.query(CLAIM_SEYEON_PROVIDER_RECEIPT_SQL_V1)).rows;
        if (rows.length>1) return fail();
        return rows.length===0 ? null : receiptFromClaim(rows[0]!);
      });
      if (claim===null) return null;
      pending={callId:claim.receipt.callId,token:claim.claimToken};
      return claim.receipt;
    },
    async acknowledgeSettled(callId:string,_result:Readonly<{
      replayed:boolean;occupiedMicroUsd:bigint;overCeiling:boolean;
    }>){
      const owned=pending;
      if (owned===null||exactId(callId)!==owned.callId) return fail();
      try {
        await withRole(pool,async client=>{
          const result=await client.query(ACK_SEYEON_PROVIDER_RECEIPT_SQL_V1,[
            owned.callId,owned.token,
          ]);
          if (result.rows.length!==1||
              result.rows[0]?.acknowledged!==true) return fail();
        });
      } finally {
        // After a lost ACK reply, release only the in-process claim. Database
        // fencing survives; the same event becomes claimable after lease expiry.
        pending=null;
      }
    },
  });
}
