import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

export const PORTONE_VERIFIED_AGE_READ_AUTHORITY_V1 = Object.freeze({
  query: 'public.qry_verified_legal_portone_age_v1',
  proposalOnly: true,
  minimumFreeAge: 14,
  minimumDirectPurchaseAge: 19,
} as const);

export interface PortOneVerifiedAgeAdmissionPortV1 {
  /** Trusted verified Auth/Guest credential only, never client subjectId. */
  admitFreePersonalization(
    verifiedEvidence: VerifiedSubjectIdentityEvidenceV1,
  ): Promise<boolean>;
  /** A future Commerce adapter may use this after payment launch approval. */
  admitAdultDirectPurchase(
    verifiedEvidence: VerifiedSubjectIdentityEvidenceV1,
  ): Promise<boolean>;
}

const SQL = 'select public.qry_verified_legal_portone_age_v1($1::uuid) as "ageBand"';
type Row = Readonly<{ ageBand?: unknown }>;

async function readBand(
  pool: PostgresSubjectPoolV1,
  verifiedEvidence: VerifiedSubjectIdentityEvidenceV1,
): Promise<'adult' | 'free_minor' | null> {
  return executePostgresSubjectTransactionV1({
    pool,
    verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      const result = await client.query<Row>(SQL, [resolvedSubject.subjectId]);
      if (result.rows.length !== 1) {
        throw new Error('PortOne verified age authority returned invalid row count.');
      }
      const band = result.rows[0]?.ageBand;
      if (band === null || band === undefined) return null;
      if (band === 'adult' || band === 'free_minor') return band;
      throw new Error('PortOne verified age authority returned invalid band.');
    },
  });
}

/**
 * This adapter targets an unapplied SQL proposal and is NOT composed into
 * production routes. Missing/invalid credentials and DB errors never grant
 * permissions. It does not infer age from a profile DOB or client checkbox.
 */
export function createPostgresPortOneVerifiedAgeAdmissionPortV1(
  pool: PostgresSubjectPoolV1,
): PortOneVerifiedAgeAdmissionPortV1 {
  return Object.freeze({
    async admitFreePersonalization(evidence: VerifiedSubjectIdentityEvidenceV1) {
      const band = await readBand(pool, evidence);
      return band === 'adult' || band === 'free_minor';
    },
    async admitAdultDirectPurchase(evidence: VerifiedSubjectIdentityEvidenceV1) {
      return await readBand(pool, evidence) === 'adult';
    },
  });
}
