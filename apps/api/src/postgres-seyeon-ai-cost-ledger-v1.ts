import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import type { SeyeonAiCostEventV1 } from './seyeon-ai-usage-cost-v1.js';
import type { SeyeonProductionSubjectTransactionRunnerV1 } from './seyeon-production-subject-transaction-v1.js';
import {
  createOpenAiSeyeonStructuredProviderV1,
  type OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import type {
  SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_AI_COST_LEDGER_VERSION_V1 = 'seyeon-ai-cost-ledger-v1' as const;

const INSERT_SQL = `
select call_id::text as "callId", replayed
from public.cmd_record_seyeon_ai_call_cost_v1($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb)
`.trim();

const START_SQL = `
select call_id::text as "callId"
from public.cmd_start_seyeon_ai_call_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::text,$7::text,$8::text
)
`.trim();

const SETTLE_SQL = `
select call_id::text as "callId", replayed
from public.cmd_settle_seyeon_ai_call_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb
)
`.trim();

const TURN_TOTAL_SQL = `
select call_count as "callCount",
 known_cost_micro_usd::text as "knownCostMicroUsd",
 unknown_cost_calls as "unknownCostCalls",
 total_estimated_cost_micro_usd::text as "totalEstimatedCostMicroUsd"
from public.qry_seyeon_ai_turn_cost_v1($1::uuid,$2::uuid)
`.trim();

export interface SeyeonAiCostLedgerBindingV1 {
  readonly subjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly phase: 'chat' | 'post_turn';
}

function uuid(value: string, label: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error('Se-yeon cost ledger ' + label + ' must be a UUID.');
  }
  return value.toLowerCase();
}

export interface SeyeonAiCallStartV1 {
  readonly callId: string;
  readonly purpose: string;
  readonly providerKey: string;
  readonly modelKey: string;
}

function bindingParams(binding: SeyeonAiCostLedgerBindingV1): [
  string, string, string, 'chat' | 'post_turn'
] {
  if (binding.phase !== 'chat' && binding.phase !== 'post_turn') {
    throw new Error('Se-yeon cost ledger phase is invalid.');
  }
  return [
    uuid(binding.subjectId, 'subjectId'),
    uuid(binding.turnId, 'turnId'),
    uuid(binding.attemptId, 'attemptId'),
    binding.phase,
  ];
}

export async function startSeyeonAiCallV1(
  client: PostgresTransactionQueryV1,
  binding: SeyeonAiCostLedgerBindingV1,
  call: SeyeonAiCallStartV1,
): Promise<string> {
  const args = bindingParams(binding);
  const callId = uuid(call.callId, 'callId');
  if (!/^[a-z_]{1,64}$/u.test(call.purpose) ||
      !/^[a-zA-Z0-9._:/-]{1,128}$/u.test(call.providerKey) ||
      !/^[a-zA-Z0-9._:/-]{1,128}$/u.test(call.modelKey)) {
    throw new Error('Se-yeon cost ledger call start metadata is invalid.');
  }
  const result = await client.query<{callId: string}>(
    START_SQL, [...args,callId,call.purpose,call.providerKey,call.modelKey],
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 || row === undefined ||
      uuid(row.callId,'response callId') !== callId) {
    throw new Error('Se-yeon cost ledger start receipt is invalid.');
  }
  return callId;
}

export async function settleSeyeonAiCallV1(
  client: PostgresTransactionQueryV1,
  binding: SeyeonAiCostLedgerBindingV1,
  event: SeyeonAiCostEventV1,
): Promise<{ callId: string; replayed: boolean }> {
  const args = bindingParams(binding);
  const callId = uuid(event.callId, 'callId');
  if (event.schemaVersion !== 'seyeon-ai-cost-v1' ||
      event.invoiceReconciled !== false) {
    throw new Error('Se-yeon cost ledger settlement contract is invalid.');
  }
  const result = await client.query<{callId: string; replayed: boolean}>(
    SETTLE_SQL, [...args,JSON.stringify(event)],
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 || row === undefined ||
      uuid(row.callId,'response callId') !== callId ||
      typeof row.replayed !== 'boolean') {
    throw new Error('Se-yeon cost ledger settlement receipt is invalid.');
  }
  return Object.freeze({callId,replayed:row.replayed});
}

export async function insertSeyeonAiCallCostV1(
  client: PostgresTransactionQueryV1,
  binding: SeyeonAiCostLedgerBindingV1,
  event: SeyeonAiCostEventV1,
): Promise<{ callId: string; replayed: boolean }> {
  const subjectId = uuid(binding.subjectId, 'subjectId');
  const turnId = uuid(binding.turnId, 'turnId');
  const attemptId = uuid(binding.attemptId, 'attemptId');
  const callId = uuid(event.callId, 'callId');
  if (binding.phase !== 'chat' && binding.phase !== 'post_turn') {
    throw new Error('Se-yeon cost ledger phase is invalid.');
  }
  if (event.schemaVersion !== 'seyeon-ai-cost-v1' || event.invoiceReconciled !== false) {
    throw new Error('Se-yeon cost ledger requires the versioned estimate contract.');
  }
  const result = await client.query<{callId: string; replayed: boolean}>(
    INSERT_SQL,
    [subjectId,turnId,attemptId,binding.phase,JSON.stringify(event)],
  );
  const row = result.rows[0];
  if (result.rows.length !== 1 || row === undefined ||
      uuid(row.callId, 'response callId') !== callId ||
      typeof row.replayed !== 'boolean') {
    throw new Error('Se-yeon cost ledger did not return a matching write receipt.');
  }
  return Object.freeze({callId,replayed:row.replayed});
}

export async function readSeyeonAiTurnCostV1(
  client: PostgresTransactionQueryV1,
  subjectId: string,
  turnId: string,
): Promise<{
  callCount: number;
  knownCostMicroUsd: bigint;
  unknownCostCalls: number;
  totalEstimatedCostMicroUsd: bigint | null;
}> {
  const result = await client.query<Record<string,unknown>>(TURN_TOTAL_SQL,[
    uuid(subjectId,'subjectId'),uuid(turnId,'turnId'),
  ]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || row === undefined) {
    throw new Error('Se-yeon cost ledger summary must return exactly one row.');
  }
  const count = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid cost call count.');
    return n;
  };
  const money = (value: unknown): bigint => {
    if (typeof value !== 'string' || !/^[0-9]+$/u.test(value)) {
      throw new Error('Invalid PostgreSQL microUSD total.');
    }
    return BigInt(value);
  };
  return Object.freeze({
    callCount: count(row.callCount),
    knownCostMicroUsd: money(row.knownCostMicroUsd),
    unknownCostCalls: count(row.unknownCostCalls),
    totalEstimatedCostMicroUsd:
      row.totalEstimatedCostMicroUsd === null
        ? null : money(row.totalEstimatedCostMicroUsd),
  });
}

/**
 * Durable start precedes network dispatch. Failed start prevents a paid call.
 * Settlement failures are logged without repeating inference; a started row
 * remains visible for reconciliation instead of disappearing from cost totals.
 */
export function createPersistingSeyeonAiProviderV1(input: {
  readonly config: OpenAiSeyeonStructuredProviderConfigV1;
  readonly runner: SeyeonProductionSubjectTransactionRunnerV1;
  readonly getBinding: () => SeyeonAiCostLedgerBindingV1 | null;
}): SeyeonStructuredProviderPortV2 {
  const descriptor = createOpenAiSeyeonStructuredProviderV1(input.config);
  return Object.freeze({
    providerKey: descriptor.providerKey,
    modelKey: descriptor.modelKey,
    async generate(request: Parameters<SeyeonStructuredProviderPortV2['generate']>[0]) {
      const events: SeyeonAiCostEventV1[] = [];
      const observer = input.config.observeMetric;
      const state: { binding: SeyeonAiCostLedgerBindingV1 | null; callId: string | null } = {
        binding: null, callId: null,
      };
      const provider = createOpenAiSeyeonStructuredProviderV1({
        ...input.config,
        async beforeDispatch(call) {
          // Any caller-provided admission gate must approve before a DB start
          // so a refused network call does not leave a false paid-call record.
          await input.config.beforeDispatch?.(call);
          const binding = input.getBinding();
          if (binding === null) {
            console.error('MYEONGHA_SEYEON_COST_BINDING_MISSING');
            throw new Error('AI cost binding is unavailable before dispatch.');
          }
          await input.runner.run(binding.subjectId, client =>
            startSeyeonAiCallV1(client,binding,call),
          );
          state.binding = binding;
          state.callId = call.callId;
        },
        observeMetric(event) {
          if (event.callId !== state.callId) {
            console.error('MYEONGHA_SEYEON_COST_CALL_ID_MISMATCH');
            return;
          }
          events.push(event);
          try {
            observer?.(event);
          } catch {
            console.error('MYEONGHA_SEYEON_COST_EXTERNAL_OBSERVER_FAILED');
          }
        },
      });
      try {
        return await provider.generate(request);
      } finally {
        for (const event of events) {
          if (state.binding === null || state.callId !== event.callId) {
            console.error('MYEONGHA_SEYEON_COST_BINDING_MISSING');
            continue;
          }
          try {
            await input.runner.run(state.binding.subjectId, client =>
              settleSeyeonAiCallV1(client,state.binding!,event),
            );
          } catch {
            // Keep the started row for reconciliation. Never retry inference.
            console.error('MYEONGHA_SEYEON_COST_SETTLEMENT_FAILED');
          }
        }
        if (state.callId !== null && events.length === 0) {
          console.error('MYEONGHA_SEYEON_COST_PROVIDER_EVENT_MISSING');
        }
      }
    },
  });
}
