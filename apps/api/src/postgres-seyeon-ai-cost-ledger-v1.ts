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
 * One provider call => one awaited Subject-scoped insert, even if the provider
 * rejects. Metering failure is explicit but never triggers a second inference.
 * A process crash between provider response and INSERT can still lose a call;
 * the Cost Governor must not treat this as a fully reconciled invoice ledger.
 */
export function createPersistingSeyeonAiProviderV1(input: {
  readonly config: OpenAiSeyeonStructuredProviderConfigV1;
  readonly runner: SeyeonProductionSubjectTransactionRunnerV1;
  readonly getBinding: () => SeyeonAiCostLedgerBindingV1 | null;
}): SeyeonStructuredProviderPortV2 {
  // Validate credentials/model once. No outbound request occurs here.
  const descriptor = createOpenAiSeyeonStructuredProviderV1(input.config);
  return Object.freeze({
    providerKey: descriptor.providerKey,
    modelKey: descriptor.modelKey,
    async generate(request: Parameters<SeyeonStructuredProviderPortV2['generate']>[0]) {
      const events: SeyeonAiCostEventV1[] = [];
      const observer = input.config.observeMetric;
      const provider = createOpenAiSeyeonStructuredProviderV1({
        ...input.config,
        observeMetric(event) {
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
          const binding = input.getBinding();
          if (binding === null) {
            console.error('MYEONGHA_SEYEON_COST_BINDING_MISSING');
            continue;
          }
          try {
            await input.runner.run(binding.subjectId, client =>
              insertSeyeonAiCallCostV1(client,binding,event),
            );
          } catch {
            // Never expose identities, request content, SQL details or provider data.
            console.error('MYEONGHA_SEYEON_COST_PERSIST_FAILED');
          }
        }
        if (events.length === 0) {
          console.error('MYEONGHA_SEYEON_COST_PROVIDER_EVENT_MISSING');
        }
      }
    },
  });
}
