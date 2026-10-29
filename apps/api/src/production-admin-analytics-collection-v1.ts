import { createAdminAnalyticsConsentRuntimeV1 } from './admin-analytics-consent-v1.js';
import { createAdminAnalyticsPostgresEventStoreV1 } from './admin-analytics-pipeline-postgres-v1.js';
import { createAdminAnalyticsVerifiedBirthAdapterV1 } from './admin-analytics-verified-birth-v1.js';
import { createAdminAnalyticsVerifiedPurchaseAdapterV1 } from './admin-analytics-verified-purchase-v1.js';
import { createAdminAnalyticsVerifiedReadingAdapterV1 } from './admin-analytics-verified-reading-v1.js';
import {
  isAdminAnalyticsCollectionApprovedV1,
  type AdminAnalyticsCollectionPolicyV1,
} from './admin-analytics-pipeline-v1.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

/**
 * Private production composition for the already-defined consent/collection
 * handlers and DB-verified server events. Does not mount a public route.
 *
 * The writer and reader are DIFFERENT least-privilege identities, never a
 * general service_role or the public Reading execution pool. The caller
 * provides authenticated Subject resolution, visitor admission and rate
 * limiting. No browser input may determine those authority decisions.
 *
 * Analytics is OFF unless an explicit deployment enablement is true AND
 * the complete approved 180-day policy is valid. Disabling collection must
 * never be represented as a verified period of zero visits or purchases.
 */
export function createProductionAdminAnalyticsCollectionV1(input: {
  readonly origin: string;
  readonly secret: string;
  readonly writerPool: PostgresSubjectPoolV1;
  readonly sourceReaderPool: PostgresSubjectPoolV1;
  readonly policy: AdminAnalyticsCollectionPolicyV1;
  readonly collectionEnabled?: boolean;
  readonly allowRequest: (request: Request) => Promise<boolean>;
  readonly resolveActiveSubject: (request: Request) => Promise<string | null>;
  readonly admitVisitor: (request: Request) => Promise<boolean>;
  readonly now?: () => Date;
}) {
  if (input.writerPool === input.sourceReaderPool) {
    throw new Error('Analytics reader and writer must use separate database pools');
  }
  const active = input.collectionEnabled === true &&
    isAdminAnalyticsCollectionApprovedV1(input.policy);
  const store = createAdminAnalyticsPostgresEventStoreV1(input.writerPool);
  const consentRuntime = createAdminAnalyticsConsentRuntimeV1({
    origin: input.origin,
    secret: input.secret,
    store,
    policy: input.policy,
    enabled: active,
    allowRequest: input.allowRequest,
    resolveActiveSubject: input.resolveActiveSubject,
    admitVisitor: input.admitVisitor,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  const serverEvents = active ? {
    verifiedReading: createAdminAnalyticsVerifiedReadingAdapterV1({
      pool: input.sourceReaderPool, store, consent: consentRuntime.consent,
      policy: input.policy, secret: input.secret,
      resolveActiveSubject: input.resolveActiveSubject,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    verifiedPurchase: createAdminAnalyticsVerifiedPurchaseAdapterV1({
      pool: input.sourceReaderPool, store, consent: consentRuntime.consent,
      policy: input.policy, secret: input.secret,
      resolveActiveSubject: input.resolveActiveSubject,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    verifiedBirth: createAdminAnalyticsVerifiedBirthAdapterV1({
      pool: input.sourceReaderPool, store, consent: consentRuntime.consent,
      policy: input.policy, secret: input.secret,
      resolveActiveSubject: input.resolveActiveSubject,
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
  } : null;
  return Object.freeze({
    status: active ? 'configured_source_unverified' as const : 'disabled' as const,
    /** The consumer's explicit grant/status/session/event/withdraw endpoints.
     * Mount only on the approved same-origin public route in a separately
     * authenticated, rate-limited production server. */
    handleRequest: consentRuntime.handleRequest,
    /** Enables durable 180-day purge; requires a scheduled, independently
     * scoped writer before collection is activated. */
    runMaintenance: consentRuntime.runMaintenance,
    /** Only inject into already authorized, committed domain operations.
     * No adapter exists when collection is disabled. */
    ...(serverEvents === null ? {} : serverEvents),
  });
}
