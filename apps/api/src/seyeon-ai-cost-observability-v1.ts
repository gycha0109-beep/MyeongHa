import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const SEYEON_AI_COST_OBSERVABILITY_VERSION_V1 =
  'seyeon-ai-cost-observability-v1' as const;

const MODEL_SQL = `
select
  provider_key as "providerKey",
  model_key as "modelKey",
  call_count::text as "callCount",
  unsettled_calls::text as "unsettledCalls",
  known_cost_micro_usd::text as "knownCostMicroUsd",
  unknown_cost_calls::text as "unknownCostCalls",
  total_estimated_cost_micro_usd::text as "totalEstimatedCostMicroUsd"
from public.qry_seyeon_ai_model_cost_v1($1::uuid,$2::uuid)
`.trim();

const PENDING_SQL = `
select
  call_id::text as "callId",
  provider_key as "providerKey",
  model_key as "modelKey",
  purpose,
  started_at::text as "startedAt"
from public.qry_seyeon_ai_unsettled_calls_v1($1::uuid,$2::uuid)
`.trim();

function uuid(value: string, name: string): string {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu.test(value)) {
    throw new Error('Se-yeon cost observability invalid ' + name + '.');
  }
  return value.toLowerCase();
}

function number(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Se-yeon cost observability received an invalid count.');
  }
  return parsed;
}

function money(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[0-9]+$/u.test(value)) {
    throw new Error('Se-yeon cost observability received invalid microUSD.');
  }
  return BigInt(value);
}

export interface SeyeonAiModelCostV1 {
  readonly providerKey: string;
  readonly modelKey: string;
  readonly callCount: number;
  readonly unsettledCalls: number;
  readonly knownCostMicroUsd: bigint;
  readonly unknownCostCalls: number;
  readonly totalEstimatedCostMicroUsd: bigint | null;
}

export async function readSeyeonAiModelCostsV1(
  client: PostgresTransactionQueryV1,
  subjectId: string,
  turnId: string,
): Promise<readonly SeyeonAiModelCostV1[]> {
  const result = await client.query<Record<string,unknown>>(MODEL_SQL,[
    uuid(subjectId,'subjectId'),uuid(turnId,'turnId'),
  ]);
  return Object.freeze(result.rows.map((row) => {
    if (typeof row.providerKey !== 'string' ||
        typeof row.modelKey !== 'string') {
      throw new Error('Se-yeon cost observability model identity invalid.');
    }
    const callCount=number(row.callCount);
    const unsettledCalls=number(row.unsettledCalls);
    const unknownCostCalls=number(row.unknownCostCalls);
    if (unsettledCalls>unknownCostCalls || unknownCostCalls>callCount) {
      throw new Error('Se-yeon cost observability inconsistent call counts.');
    }
    return Object.freeze({
      providerKey:row.providerKey,
      modelKey:row.modelKey,
      callCount,
      unsettledCalls,
      knownCostMicroUsd:money(row.knownCostMicroUsd),
      unknownCostCalls,
      totalEstimatedCostMicroUsd:row.totalEstimatedCostMicroUsd === null
        ? null : money(row.totalEstimatedCostMicroUsd),
    });
  }));
}

export interface SeyeonAiUnsettledCallV1 {
  readonly callId: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly purpose: string;
  readonly startedAt: string;
}

export async function readSeyeonAiUnsettledCallsV1(
  client: PostgresTransactionQueryV1,
  subjectId: string,
  turnId: string,
): Promise<readonly SeyeonAiUnsettledCallV1[]> {
  const result=await client.query<Record<string,unknown>>(PENDING_SQL,[
    uuid(subjectId,'subjectId'),uuid(turnId,'turnId'),
  ]);
  return Object.freeze(result.rows.map((row)=>{
    if (typeof row.providerKey !== 'string' ||
        typeof row.modelKey !== 'string' ||
        typeof row.purpose !== 'string' ||
        typeof row.startedAt !== 'string') {
      throw new Error('Se-yeon cost observability pending-call metadata invalid.');
    }
    return Object.freeze({
      callId:uuid(String(row.callId),'callId'),
      providerKey:row.providerKey,
      modelKey:row.modelKey,
      purpose:row.purpose,
      startedAt:row.startedAt,
    });
  }));
}
