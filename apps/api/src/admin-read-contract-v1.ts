export const ADMIN_READ_KINDS_V1 = [
  'overview', 'users', 'user-detail', 'commerce', 'commerce-detail', 'commerce-alerts', 'credits', 'credit-reservations', 'readings', 'reading-detail', 'ai-costs', 'ai-errors', 'ai-estimates', 'analytics', 'issues', 'catalog', 'characters', 'content-releases', 'deletion-jobs',
] as const;

export type AdminReadKindV1 = (typeof ADMIN_READ_KINDS_V1)[number];

export type AdminPrimitiveV1 = string | number | boolean | null;

export interface AdminListFiltersV1 {
  readonly kind: AdminReadKindV1;
  readonly limit: number;
  readonly cursor: string | null;
  readonly subjectId: string | null;
  readonly recordId?: string | null;
  readonly issueStatus?: 'failed' | 'dead_lettered' | null;
  readonly issueCategory?: string | null;
  readonly subjectKind?: 'guest' | 'member' | null;
  readonly subjectStatus?: 'active' | 'merged' | 'deletion_pending' | 'deleted' | null;
  readonly readingStatus?: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | null;
  readonly from: string | null;
  readonly to: string | null;
}

export interface AdminReadResultV1 {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly nextCursor: string | null;
}

export interface AdminReadPortV1 {
  /** Only pre-authorized, server-owned, parameterized reads; never arbitrary SQL. */
  read(input: AdminListFiltersV1): Promise<AdminReadResultV1>;
}

const SAFE_COLUMNS: Readonly<Record<AdminReadKindV1, readonly string[]>> = Object.freeze({
  overview: ['metricKey','metricValue','window'],
  users: ['subjectId', 'kind', 'status', 'createdAt', 'lastActivityAt'],
  'user-detail': ['subjectId', 'kind', 'status', 'createdAt', 'lastActivityAt', 'readingsCount', 'verifiedPurchasesCount', 'activeEntitlementsCount', 'availableCredits'],
  'commerce-detail': ['transactionId','subjectId','productKey','provider','platform','providerStatus','purchaseStatus','createdAt','verifiedAt','amountMinor','currency','entitlementStatus','linkedGrantEventCount','linkedActiveGrantCount','linkedRevokedGrantCount'],
  'commerce-alerts': ['transactionId','subjectId','alertKind','providerStatus','detectedAt','evidence'],
  commerce: ['transactionId', 'subjectId', 'productKey', 'amountMinor', 'currency', 'providerStatus', 'verifiedAt', 'entitlementStatus'],
  'credit-reservations': ['reservationId','subjectId','requiredCredits','state','deliveredTurnId','createdAt','finalizedAt'],
  credits: ['eventId', 'subjectId', 'creditDelta', 'creditsRemaining', 'expiresAt', 'validity', 'createdAt', 'eventKind', 'balanceAfter', 'correlationId'],
  'reading-detail': ['readingId','subjectId','status','domain','createdAt','completedAt','engineVersion','contractVersion','attemptState','attemptCount','errorCode','startedAt','finishedAt'],
  readings: ['readingId', 'subjectId', 'status', 'productKey', 'domain', 'engineVersion', 'createdAt', 'errorCode'],
  'ai-costs': ['day', 'feature', 'model', 'requests', 'successes', 'failures', 'totalTokens', 'unknownTokenCalls', 'blocked', 'costKrw', 'avgLatencyMs', 'latencySamples', 'p95LatencyMs'],
  'ai-errors': ['executionId','subjectId','feature','model','status','errorCode','p95LatencyMs','createdAt'],
  'ai-estimates': ['day', 'feature', 'model', 'requests', 'successes', 'failures', 'estimatedMicroUsd', 'unknownCostCalls', 'costStatus'],
  characters: ['characterId', 'contentVersion', 'availability', 'enabled', 'releaseAt', 'publishedAt'],
  'content-releases': ['releaseKey', 'contentVersion', 'status', 'isDefault', 'activatedAt', 'createdAt'],
  'deletion-jobs': ['deletionJobId', 'subjectId', 'scope', 'status', 'requestedAt', 'completedAt', 'errorCode'],
  catalog: ['productKey', 'productType', 'catalogEnabled', 'createdAt', 'offerCount'],
  analytics: ['day', 'campaignKey', 'visitors', 'checkoutAttempts', 'verifiedPurchases', 'conversionRate', 'sampleSize'],
  issues: ['issueId', 'category', 'severity', 'status', 'createdAt', 'requestId'],
});

function isSafePrimitive(v: unknown): v is AdminPrimitiveV1 {
  return v === null || typeof v === 'string' || typeof v === 'boolean'
    || (typeof v === 'number' && Number.isFinite(v));
}

/** An allowlisted projection, not a blind serialization of database rows. */
export function projectAdminRowsV1(
  kind: AdminReadKindV1,
  result: AdminReadResultV1,
  limit: number,
): AdminReadResultV1 {
  if (!Array.isArray(result.rows) || result.rows.length > limit ||
    (result.nextCursor !== null && (typeof result.nextCursor !== 'string' ||
    result.nextCursor.length === 0 || result.nextCursor.length > 128))) {
    throw new Error('Administrator read authority returned an invalid page.');
  }
  const columns = SAFE_COLUMNS[kind];
  const rows = result.rows.map(row => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Administrator read authority returned an invalid row.');
    }
    const safe: Record<string, AdminPrimitiveV1> = {};
    for (const key of columns) {
      const value = row[key];
      if (value === undefined) continue;
      if (!isSafePrimitive(value)) {
        throw new Error('Administrator read authority returned invalid field type.');
      }
      safe[key] = value;
    }
    return Object.freeze(safe);
  });
  return Object.freeze({ rows: Object.freeze(rows), nextCursor: result.nextCursor });
}
