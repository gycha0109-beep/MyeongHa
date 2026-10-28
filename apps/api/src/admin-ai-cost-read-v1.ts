import { ADMIN_READ_DB_ROLE_V1, ADMIN_READ_PRINCIPAL_SQL_V1 } from './admin-postgres-read-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { reconcileAdminAiCallV1, type AdminAiBillingEvidencePortV1, type AdminAiFinanceCallV1, type AdminAiFxEvidenceV1 } from './admin-ai-cost-finance-v1.js';

export type AdminAiFinanceModeV1 = 'calls' | 'summary' | 'prices';
export interface AdminAiFinanceFiltersV1 {
  readonly mode: AdminAiFinanceModeV1;
  readonly from: string;
  readonly to: string;
  readonly subjectId: string | null;
  readonly feature: string | null;
  readonly model: string | null;
  readonly granularity: 'day' | 'month';
  readonly groupBy: 'feature' | 'subject';
  readonly limit: number;
  readonly offset: number;
}
type Primitive = string | number | boolean | null;
export interface AdminAiFinanceReadPortV1 {
  read(filters: AdminAiFinanceFiltersV1): Promise<{ readonly rows: readonly Readonly<Record<string, Primitive>>[]; readonly nextCursor: string | null }>;
}

const CALL_SQL = 'SELECT * FROM myeongha_admin_ops.qry_ai_finance_calls_v1($1::int,$2::int,$3::date,$4::date,$5::uuid,$6::text,$7::text)';
const SUMMARY_SQL = 'SELECT * FROM myeongha_admin_ops.qry_ai_finance_summary_v1($1::int,$2::int,$3::date,$4::date,$5::uuid,$6::text,$7::text,$8::text,$9::text)';
const PRICE_SQL = 'SELECT * FROM myeongha_admin_ops.qry_ai_finance_prices_v1($1::int,$2::int,$3::text)';
const SUMMARY_COLUMNS = ['period','subjectId','workload','feature','provider','model','calls','failedCalls','observedAttempts','inputTokens','outputTokens','cachedInputTokens','reasoningTokens','unknownUsageCalls','knownEstimateMicroUsd','estimatedMicroUsd','unknownCostCalls','confirmedMicroUsd','billingStatus','confirmedMicroKrw','estimatedMicroKrw','verifiedRevenueMicroKrw','revenueCostBasisPoints'] as const;
const PRICE_COLUMNS = ['provider','model','policyVersion','priceVersion','inputMicroUsdPerMillion','cachedInputMicroUsdPerMillion','outputMicroUsdPerMillion','isActive','effectiveFrom','effectiveTo','sourceStatus'] as const;
function integer(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'string' || !/^\d{1,16}$/u.test(value)) && typeof value !== 'number') throw new Error('Invalid usage source');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Usage exceeds exact integer range');
  return parsed;
}
function str(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new Error('Invalid finance source metadata');
  return value;
}
function safeRows(rows: readonly Record<string, unknown>[], columns: readonly string[]) {
  return rows.map(row => {
    const result: Record<string, Primitive> = {};
    for (const key of columns) {
      const value = row[key] ?? null;
      if (!(value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) throw new Error('Invalid finance response projection');
      result[key] = value;
    }
    return Object.freeze(result);
  });
}

export function createAdminAiFinanceReadPortV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly billing?: AdminAiBillingEvidencePortV1;
  readonly fx?: AdminAiFxEvidenceV1;
}): AdminAiFinanceReadPortV1 {
  return Object.freeze({
    async read(filters: AdminAiFinanceFiltersV1) {
      const connection = await input.pool.connect();
      let active = false;
      let discard: unknown;
      try {
        await connection.query('BEGIN READ ONLY'); active = true;
        const identity = await connection.query<{ currentUser: string }>(ADMIN_READ_PRINCIPAL_SQL_V1);
        if (identity.rows.length !== 1 || identity.rows[0]?.currentUser !== ADMIN_READ_DB_ROLE_V1) throw new Error('Dedicated finance reader required');
        const result = await connection.query<Record<string, unknown>>(
          filters.mode === 'calls' ? CALL_SQL : filters.mode === 'summary' ? SUMMARY_SQL : PRICE_SQL,
          filters.mode === 'prices' ? [filters.limit+1,filters.offset,filters.model] : [filters.limit+1,filters.offset,filters.from,filters.to,filters.subjectId,filters.feature,filters.model,
            ...(filters.mode === 'summary' ? [filters.granularity,filters.groupBy] : [])],
        );
        if (result.rows.length > filters.limit+1) throw new Error('Unbounded finance source');
        await connection.query('COMMIT'); active = false;
        const page = result.rows.slice(0,filters.limit);
        let rows: readonly Readonly<Record<string, Primitive>>[];
        if (filters.mode === 'calls') {
          const selectedIds=page.map(row=>str(row,'callId'));
          if(new Set(selectedIds).size!==selectedIds.length)throw Error('Duplicate AI finance source calls');
          const billing = input.billing === undefined ? [] : await input.billing.lookup(selectedIds);
          // A custom provider port is not trusted to widen the selected DB cohort.
          // Reject even one unrelated or duplicated line instead of silently ignoring it.
          const selected=new Set(selectedIds),reconciled=new Set<string>();
          for(const bill of billing){
            if(!selected.has(bill.callId)||reconciled.has(bill.callId))throw Error('Unbound AI finance billing lookup');
            reconciled.add(bill.callId);
          }
          rows = page.map(row => {
            const call: AdminAiFinanceCallV1 = {
              callId:str(row,'callId'),subjectId:str(row,'subjectId'),attemptId:str(row,'attemptId'),turnId:str(row,'turnId'),
              createdAt:str(row,'createdAt'),priceAppliedAt:str(row,'priceAppliedAt'),workload:'character_chat',feature:str(row,'feature'),provider:str(row,'provider'),
              model:str(row,'model'),outcome:str(row,'outcome'),priceVersion:row.priceVersion === null ? null : str(row,'priceVersion'),
              inputTokens:integer(row.inputTokens),outputTokens:integer(row.outputTokens),cachedInputTokens:integer(row.cachedInputTokens),
              reasoningTokens:integer(row.reasoningTokens),recordedEstimateMicroUsd:integer(row.recordedEstimateMicroUsd),
              ...(row.appliedInputRate === null || row.appliedInputRate === undefined ? {} : { appliedPrice:{
                providerKey:str(row,'provider'),modelKey:str(row,'model'),priceVersion:str(row,'priceVersion'),
                inputMicroUsdPerMillion:integer(row.appliedInputRate)!,cachedInputMicroUsdPerMillion:integer(row.appliedCachedInputRate)!,
                outputMicroUsdPerMillion:integer(row.appliedOutputRate)!,
              } }),
            };
            return reconcileAdminAiCallV1(call,{billing,...(input.fx === undefined ? {} : {fx:input.fx})});
          });
        } else rows = safeRows(page,filters.mode === 'prices' ? PRICE_COLUMNS : SUMMARY_COLUMNS);
        const nextCursor = result.rows.length > filters.limit && filters.offset+filters.limit <= 10_000 ? String(filters.offset+filters.limit) : null;
        return Object.freeze({rows,nextCursor});
      } catch (error) {
        if (active) { try { await connection.query('ROLLBACK'); } catch (failure) { discard=failure; } }
        throw error;
      } finally { connection.release(discard); }
    },
  });
}
