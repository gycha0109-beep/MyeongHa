import { ApiCommandError } from './api-error.js';
import {
  executePostgresCommerceInternalTransactionV1,
} from './postgres-commerce-internal-execution.js';
import type {
  PostgresSubjectExecutionScopeV1,
  PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type {
  OwnedDigitalReadingReviewSnapshotPortV1,
  OwnedDigitalReadingReviewSnapshotV1,
} from './commerce-digital-reading-withdrawal-orchestration-v1.js';

/** Proposal 1743. This port never accepts a browser-provided purchase/delivery fact. */
export const POSTGRES_DIGITAL_READING_REVIEW_EVIDENCE_V1 = Object.freeze({
  read: 'public.qry_owned_digital_reading_withdrawal_snapshot_v1',
  display: 'public.cmd_record_digital_reading_checkout_display_v1',
  acknowledge: 'public.cmd_record_digital_reading_checkout_ack_v1',
  deliver: 'public.cmd_record_digital_reading_delivery_v1',
  publicRoute: null,
  productionDeployed: false,
} as const);

const READ_SQL = `
select purchase_json as "purchase", notice_json as "notice",
       delivery_json as "delivery"
from public.qry_owned_digital_reading_withdrawal_snapshot_v1(
  $1::uuid,$2::uuid,$3::text)
`.trim();
const DISPLAY_SQL = `
select public.cmd_record_digital_reading_checkout_display_v1(
  $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text) as "accepted"
`.trim();
const ACK_SQL = `
select public.cmd_record_digital_reading_checkout_ack_v1(
  $1::uuid,$2::uuid,$3::text,$4::text) as "accepted"
`.trim();
const DELIVERY_SQL = `
select public.cmd_record_digital_reading_delivery_v1(
  $1::uuid,$2::uuid,$3::text,$4::text) as "accepted"
`.trim();

type SnapshotRow = Readonly<{
  purchase?: unknown;
  notice?: unknown;
  delivery?: unknown;
}>;
type BooleanRow = Readonly<{ accepted?: unknown }>;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const UNIT = /^standard-reading:[a-z0-9_-]{1,96}$/u;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

function objectOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Commerce legal evidence database returned a malformed snapshot.');
  }
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Commerce legal evidence identity is invalid.');
  }
  return value;
}

/** Subject was resolved by the trusted DB transaction wrapper, never by a request parameter. */
export function createPostgresOwnedDigitalReadingReviewSnapshotPortV1():
OwnedDigitalReadingReviewSnapshotPortV1 {
  return Object.freeze({
    async loadSnapshot(input: {
      scope: PostgresSubjectExecutionScopeV1;
      purchaseIntentId: string;
      unitId: string;
    }): Promise<OwnedDigitalReadingReviewSnapshotV1 | null> {
      const { subjectId } = input.scope.resolvedSubject;
      const rows = (await input.scope.client.query<SnapshotRow>(READ_SQL, [
        subjectId,
        requireIdentity(input.purchaseIntentId, UUID),
        requireIdentity(input.unitId, UNIT),
      ])).rows;
      if (rows.length === 0) return null;
      if (rows.length !== 1 || rows[0] === undefined) {
        throw new Error('Commerce legal evidence database returned duplicate purchased units.');
      }
      return Object.freeze({
        purchase: objectOrNull(rows[0].purchase),
        notice: objectOrNull(rows[0].notice),
        delivery: objectOrNull(rows[0].delivery),
      });
    },
  });
}

/**
 * Internal-only trusted Commerce/S7 event producer.
 * Call display AFTER real sample/info was supplied; acknowledge only after an
 * explicit consumer action; delivery only AFTER the response actually succeeded.
 * No API route, client timestamp, raw Reading, refund or grant mutations.
 */
export async function recordInternalDigitalReadingEvidenceV1(input: Readonly<{
  pool: PostgresSubjectPoolV1;
  event: 'checkout_displayed' | 'checkout_acknowledged' | 'content_delivered';
  subjectId: string;
  purchaseIntentId: string;
  unitId: string;
  noticeRevision?: string;
  previewOrInformationRevision?: string;
  safeguardMethod?: 'sample' | 'trial' | 'time_limited' | 'sufficient_information';
  deliveryEventDigest?: string;
}>): Promise<boolean> {
  const subjectId = requireIdentity(input.subjectId, UUID);
  const purchaseIntentId = requireIdentity(input.purchaseIntentId, UUID);
  const unitId = requireIdentity(input.unitId, UNIT);
  let statement: string;
  let params: readonly unknown[];
  switch (input.event) {
    case 'checkout_displayed': {
      const notice = requireIdentity(input.noticeRevision, SAFE_REVISION);
      const preview = requireIdentity(input.previewOrInformationRevision, SAFE_REVISION);
      const method = input.safeguardMethod;
      if (!['sample', 'trial', 'time_limited', 'sufficient_information'].includes(method ?? '')) {
        throw new ApiCommandError('INVALID_REQUEST', 'Commerce precheckout safeguard is invalid.');
      }
      statement = DISPLAY_SQL;
      params = [subjectId,purchaseIntentId,unitId,notice,preview,method];
      break;
    }
    case 'checkout_acknowledged':
      statement = ACK_SQL;
      params = [subjectId,purchaseIntentId,unitId,
        requireIdentity(input.noticeRevision, SAFE_REVISION)];
      break;
    case 'content_delivered':
      statement = DELIVERY_SQL;
      params = [subjectId,purchaseIntentId,unitId,
        requireIdentity(input.deliveryEventDigest, DIGEST)];
      break;
    default:
      throw new ApiCommandError('INVALID_REQUEST', 'Unknown Commerce legal evidence event.');
  }
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      const rows = (await client.query<BooleanRow>(statement, params)).rows;
      if (rows.length !== 1 || typeof rows[0]?.accepted !== 'boolean') {
        throw new Error('Commerce legal evidence writer returned malformed authority.');
      }
      return rows[0].accepted;
    },
  });
}
