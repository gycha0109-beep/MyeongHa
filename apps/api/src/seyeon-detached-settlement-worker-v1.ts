import type {
  NodePostgresDriverPoolV1,
  NodePostgresDriverClientV1,
} from './node-postgres-subject-pool.js';
import type { SeyeonAiPriceV1, SeyeonAiCallOutcomeV1, SeyeonAiTokenUsageV1 } from './seyeon-ai-usage-cost-v1.js';
import { createSeyeonAiCostEventV1 } from './seyeon-ai-usage-cost-v1';

/**
 * D4B-10A: offline-only detached settlement adapter.
 *
 * This module has NO HTTP handler, environment-variable reader, LOGIN
 * creation, Production pool factory, or AI dispatch authority. Its receipt
 * source is a server-private PORT, not a caller-supplied settlement event.
 * Until a durable server-owned receipt source is implemented and verified,
 * this adapter MUST NOT be bound to a Production worker.
 */
export const SEYEON_DETACHED_WORKER_LOGIN_V1 = 'myeongha_seyeon_settlement_login' as const;
export const SEYEON_DETACHED_WORKER_ROLE_V1 = 'myeongha_seyeon_settlement_worker' as const;

export const DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1 = `
select
  session_user::text as "sessionUser",
  current_user::text as "currentUser",
  r.rolcanlogin as "canLogin",
  r.rolinherit as "canInherit",
  r.rolsuper as "isSuper",
  r.rolbypassrls as "canBypassRls",
  r.rolcreatedb as "canCreateDb",
  r.rolcreaterole as "canCreateRole",
  pg_catalog.pg_has_role(session_user, 'myeongha_seyeon_settlement_worker', 'MEMBER') as "hasWorkerRole",
  (select count(*)::int from pg_catalog.pg_auth_members m
   where m.member = r.oid and m.roleid <>
     'myeongha_seyeon_settlement_worker'::regrole) as "otherMemberships",
  pg_catalog.pg_has_role(session_user, 'myeongha_api_executor', 'MEMBER') as "isApiMember",
  pg_catalog.pg_has_role(session_user, 'myeongha_seyeon_governed_executor', 'MEMBER') as "isGovernedMember",
  pg_catalog.pg_has_role(session_user, 'myeongha_seyeon_cost_meter_owner', 'MEMBER') as "isCostOwnerMember",
  pg_catalog.has_function_privilege(session_user,
    'public.cmd_settle_seyeon_ai_call_detached_v1(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE') as "canSettle",
  pg_catalog.has_function_privilege(session_user,
    'public.cmd_governed_start_seyeon_ai_call_v1(uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,bigint,bigint)',
    'EXECUTE') as "canStart",
  pg_catalog.has_table_privilege(session_user,
    'public.seyeon_ai_call_cost_events', 'SELECT') as "canReadLedger",
  pg_catalog.has_table_privilege(session_user,
    'public.seyeon_ai_governor_daily_budgets_v1', 'SELECT') as "canReadBudget"
from pg_catalog.pg_roles r
where r.rolname = session_user
`.trim();

const ENTER_ROLE_SQL_V1 = 'SET LOCAL ROLE myeongha_seyeon_settlement_worker';
const VERIFY_ROLE_SQL_V1 = 'select current_user::text as "currentUser"';
const SETTLE_SQL_V1 = `
select call_id::text as "callId", replayed,
       occupied_micro_usd::text as "occupiedMicroUsd",
       over_ceiling as "overCeiling"
from public.cmd_settle_seyeon_ai_call_detached_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb
)
`.trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function uuid(value: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error('Detached settlement receipt contains an invalid identifier.');
  }
  return value.toLowerCase();
}
function fail(): never {
  throw new Error('Detached settlement worker authority preflight rejected.');
}

/** This is an internal source record, NOT an input type for public API routes. */
export interface SeyeonServerStoredProviderReceiptV1 {
  readonly subjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly phase: 'chat' | 'post_turn';
  readonly callId: string;
  readonly purpose: string;
  readonly providerKey: string;
  readonly modelKey: string;
  /** Pinned at reservation time, never read from a client or current price. */
  readonly reservedPrice: SeyeonAiPriceV1;
  readonly providerResult: Readonly<{
    outcome: SeyeonAiCallOutcomeV1;
    httpStatus: number | null;
    elapsedMs: number;
    usage: SeyeonAiTokenUsageV1;
  }>;
}

/**
 * Required future authority: a PRIVATE durable source correlating the
 * committed reservation with a server-captured provider result. Neither
 * the queue ID nor a user bearer is a receipt. Do not implement this port
 * using HTTP request data, logs, or a caller-defined JSON payload.
 */
export interface SeyeonDetachedSettlementReceiptSourceV1 {
  loadNextStoredReceipt(): Promise<SeyeonServerStoredProviderReceiptV1 | null>;
  acknowledgeSettled(
    callId: string,
    result: Readonly<{ replayed: boolean; occupiedMicroUsd: bigint; overCeiling: boolean }>,
  ): Promise<void>;
}

export function verifySeyeonDetachedWorkerLoginV1(
  rows: readonly Record<string, unknown>[],
): void {
  const row = rows[0];
  if (rows.length !== 1 || !row ||
      row.sessionUser !== SEYEON_DETACHED_WORKER_LOGIN_V1 ||
      row.currentUser !== SEYEON_DETACHED_WORKER_LOGIN_V1 ||
      row.canLogin !== true || row.canInherit !== false ||
      row.isSuper !== false || row.canBypassRls !== false ||
      row.canCreateDb !== false || row.canCreateRole !== false ||
      row.hasWorkerRole !== true || row.otherMemberships !== 0 ||
      row.isApiMember !== false || row.isGovernedMember !== false ||
      row.isCostOwnerMember !== false ||
      row.canSettle !== true || row.canStart !== false ||
      row.canReadLedger !== false || row.canReadBudget !== false) {
    fail();
  }
}

export interface SeyeonDetachedSettlementWorkerV1 {
  settleNext(): Promise<null | Readonly<{
    callId: string;
    replayed: boolean;
    occupiedMicroUsd: bigint;
    overCeiling: boolean;
  }>>;
  close(): Promise<void>;
}

function checkedResult(
  rows: readonly Record<string, unknown>[],
  callId: string,
): Readonly<{
  callId: string; replayed: boolean; occupiedMicroUsd: bigint; overCeiling: boolean;
}> {
  const row=rows[0];
  if (rows.length!==1 || !row || typeof row.callId!=='string' ||
      uuid(row.callId)!==callId || typeof row.replayed!=='boolean' ||
      typeof row.occupiedMicroUsd!=='string' ||
      !/^(0|[1-9][0-9]*)$/u.test(row.occupiedMicroUsd) ||
      typeof row.overCeiling!=='boolean') {
    throw new Error('Detached settlement DB response is invalid.');
  }
  return Object.freeze({
    callId, replayed: row.replayed,
    occupiedMicroUsd: BigInt(row.occupiedMicroUsd),
    overCeiling: row.overCeiling,
  });
}

function buildArguments(receipt: SeyeonServerStoredProviderReceiptV1) {
  const subjectId=uuid(receipt.subjectId);
  const turnId=uuid(receipt.turnId);
  const attemptId=uuid(receipt.attemptId);
  const callId=uuid(receipt.callId);
  if ((receipt.phase!=='chat' && receipt.phase!=='post_turn') ||
      receipt.reservedPrice.providerKey!==receipt.providerKey ||
      receipt.reservedPrice.modelKey!==receipt.modelKey ||
      typeof receipt.reservedPrice.priceVersion!=='string' ||
      !receipt.reservedPrice.priceVersion ||
      !/^[a-z_]{1,64}$/u.test(receipt.purpose)) {
    throw new Error('Detached receipt does not match the reserved provider policy.');
  }
  const event=createSeyeonAiCostEventV1({
    callId, purpose: receipt.purpose,
    providerKey: receipt.providerKey, modelKey: receipt.modelKey,
    outcome:receipt.providerResult.outcome,
    httpStatus:receipt.providerResult.httpStatus,
    elapsedMs:receipt.providerResult.elapsedMs,
    usage:receipt.providerResult.usage,
    price:receipt.reservedPrice,
  });
  return {callId, parameters:[subjectId,turnId,attemptId,receipt.phase,JSON.stringify(event)] as const};
}

/**
 * Test/offline driver binding only. No public RPC dispatch method: the worker
 * pulls from its privately configured receipt source and reconstructs cost
 * from the pinned server-owned price and provider usage.
 */
export function createSeyeonDetachedSettlementWorkerFromDriverV1(input: {
  readonly driverPool: NodePostgresDriverPoolV1;
  readonly source: SeyeonDetachedSettlementReceiptSourceV1;
}): SeyeonDetachedSettlementWorkerV1 {
  return Object.freeze({
    async settleNext() {
      const receipt=await input.source.loadNextStoredReceipt();
      if (receipt===null) return null;
      const {callId,parameters}=buildArguments(receipt);
      const client: NodePostgresDriverClientV1=await input.driverPool.connect();
      let begun=false;
      let discard: Error | undefined;
      try {
        const preflight=await client.query(DETACHED_WORKER_LOGIN_PREFLIGHT_SQL_V1);
        verifySeyeonDetachedWorkerLoginV1(preflight.rows);
        await client.query('BEGIN');
        begun=true;
        await client.query(ENTER_ROLE_SQL_V1);
        const proof=await client.query(VERIFY_ROLE_SQL_V1);
        if (proof.rows.length!==1 ||
            proof.rows[0]?.currentUser!==SEYEON_DETACHED_WORKER_ROLE_V1) fail();
        const result=checkedResult(
          (await client.query(SETTLE_SQL_V1, parameters)).rows, callId,
        );
        // A lost COMMIT reply is UNKNOWN, never silently acknowledged.
        await client.query('COMMIT');
        begun=false;
        await input.source.acknowledgeSettled(callId,result);
        return result;
      } catch (error) {
        discard=new Error('Detached settlement DB outcome requires safe replay.');
        if (begun) {
          try { await client.query('ROLLBACK'); }
          catch { /* connection is discarded regardless */ }
        }
        throw error;
      } finally {
        client.release(discard);
      }
    },
    close() { return input.driverPool.end(); },
  });
}
