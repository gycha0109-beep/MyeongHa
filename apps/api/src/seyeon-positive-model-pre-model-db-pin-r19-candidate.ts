// Watchtower-Track: security
// R19: ONLY the named disposable G1-B positive-source candidate database.
// Production positive Projectors, Provider access, G2 Commit and G3 Reveal HOLD.
import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../packages/domain/src/index.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1,
  type SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';

export const SEYEON_R19_OFFLINE_PRE_MODEL_PIN_V1 = Object.freeze({
  database: 'myeongha_seyeon_positive_pin_candidate_test',
  command: 'seyeon_positive_candidate.pin_source_set_r1',
  productionMounted: false,
  permitsProvider: false,
  permitsAtomicCommit: false,
  permitsHttpReveal: false,
} as const);

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA = /^sha256:v1:[a-f0-9]{64}$/u;

export class SeyeonR19OfflinePositivePinHoldV1 extends Error {
  readonly code = 'R19_OFFLINE_POSITIVE_SOURCE_PIN_HOLD' as const;
  constructor() {
    super('Offline positive-source pre-model DB pin not proven.');
    this.name = 'SeyeonR19OfflinePositivePinHoldV1';
  }
}

function requireSelection(
  selection: SeyeonExactModelPersonalSourceSelectionV1,
): readonly {recordId:string;grantId:string}[] {
  if (!selection ||
      selection.version !== SEYEON_EXACT_MODEL_PERSONAL_SOURCE_SELECTION_VERSION_V1 ||
      selection.persistedBeforeModel !== false ||
      selection.permitsAtomicCommit !== false ||
      selection.permitsHttpReveal !== false ||
      !SHA.test(selection.selectedSourcesDigest) ||
      !SHA.test(selection.selectedModelSourceCensusDigest) ||
      !Array.isArray(selection.selectedUnpinnedDerivedSources) ||
      selection.selectedUnpinnedDerivedSources.length !== 0 ||
      selection.selectedCurrentUserSource !== null ||
      !Array.isArray(selection.selectedUnpinnedRecentSources) ||
      selection.selectedUnpinnedRecentSources.length !== 0 ||
      !Number.isSafeInteger(selection.selectedPersonalRecordCount) ||
      selection.selectedPersonalRecordCount < 1 ||
      selection.selectedPersonalRecordCount > 2 ||
      selection.selectedMemoryCount !== selection.selectedPersonalRecordCount ||
      !Array.isArray(selection.selectedSources) ||
      selection.selectedSources.length !== selection.selectedPersonalRecordCount ||
      selection.selectedSourcesDigest !== 'sha256:v1:' +
        createHash('sha256').update(canonicalJson(selection.selectedSources))
          .digest('hex') ||
      // The disposable R19 pin only persists original Memory/Grant edges.
      // It must never accept an additional model-selected derived Event
      // omitted from its SQL source_set schema.
      selection.selectedModelSourceCensusDigest !== 'sha256:v1:' +
        createHash('sha256').update(canonicalJson({
          originalPersonalSources: selection.selectedSources,
          currentUserSource: null,
          unpinnedRecentSources: [],
          unpinnedDerivedSources: [],
        })).digest('hex')) {
    throw new SeyeonR19OfflinePositivePinHoldV1();
  }

  // Reject forged format-valid digests before connecting to PostgreSQL.
  // The immutable Parent digest must represent the ACTUAL ordered source
  // manifest, including both projected and raw evidence digests.
  // Deliberately bound to the *synthetic* R1 fixture: not an SRC-25
  // recordType approval, not permission to use positive production memory.
  const recordIds = new Set<string>();
  const grantIds = new Set<string>();
  return Object.freeze(selection.selectedSources.map(source => {
    if (!source || typeof source !== 'object' ||
        Object.keys(source).length !== 7 ||
        source.recordKind !== 'memory' ||
        source.recordType !== 'shared_detail' ||
        source.schemaVersion !== 'memory-v1' ||
        !UUID.test(source.recordId) || !UUID.test(source.grantId) ||
        !SHA.test(source.rawRecordDigest) ||
        !SHA.test(source.projectedMemoryDigest) ||
        recordIds.has(source.recordId) || grantIds.has(source.grantId)) {
      throw new SeyeonR19OfflinePositivePinHoldV1();
    }
    recordIds.add(source.recordId);
    grantIds.add(source.grantId);
    return Object.freeze({ recordId: source.recordId, grantId: source.grantId });
  }));
}

export interface PersistSeyeonR19OfflinePositivePinInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string;
  /** Created by the server's exact final retrieved-memory selector. */
  readonly selection: SeyeonExactModelPersonalSourceSelectionV1;
}

export interface SeyeonR19OfflinePositivePinReceiptV1 {
  readonly status: 'disposable_source_set_committed';
  readonly attemptId: string;
  readonly selectedPersonalRecordCount: number;
  readonly selectedSourcesDigest: string;
  readonly permitsProvider: false;
  readonly permitsAtomicCommit: false;
  readonly permitsHttpReveal: false;
}

/**
 * R19 candidate: verified Member -> canonical DB Subject -> original Grant
 * locks + immutable Parent/Edges -> PostgreSQL COMMIT -> receipt.
 *
 * A successful candidate receipt does NOT authorize a Provider dispatch:
 * positive type/Codec, derived provenance, zero/positive Production XOR,
 * G2 and G3 still require the actual technical Owner contracts.
 */
export async function persistSeyeonR19OfflinePositivePreModelPinV1(
  input: PersistSeyeonR19OfflinePositivePinInputV1,
): Promise<SeyeonR19OfflinePositivePinReceiptV1> {
  if (input.verifiedEvidence.kind !== 'member' ||
      !UUID.test(input.verifiedEvidence.verifiedAuthUserId) ||
      !UUID.test(input.threadId) || !UUID.test(input.turnId) ||
      !UUID.test(input.attemptId)) {
    throw new SeyeonR19OfflinePositivePinHoldV1();
  }
  const sources = requireSelection(input.selection);
  try {
    await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence: input.verifiedEvidence,
      execute: async ({resolvedSubject, client}) => {
        if (resolvedSubject.subjectKind !== 'member' ||
            !UUID.test(resolvedSubject.subjectId)) {
          throw new SeyeonR19OfflinePositivePinHoldV1();
        }
        const identity = await client.query<{databaseName: string}>(
          'select current_database() as "databaseName"',
        );
        if (identity.rows.length !== 1 ||
            identity.rows[0]?.databaseName !==
              SEYEON_R19_OFFLINE_PRE_MODEL_PIN_V1.database) {
          throw new SeyeonR19OfflinePositivePinHoldV1();
        }
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        const stored = await client.query<{pinned: boolean}>(`
select seyeon_positive_candidate.pin_source_set_r1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::jsonb,$6::text
) as pinned
`.trim(), [
          resolvedSubject.subjectId, input.threadId, input.turnId,
          input.attemptId, JSON.stringify(sources),
          input.selection.selectedSourcesDigest,
        ]);
        if (stored.rows.length !== 1 || stored.rows[0]?.pinned !== true) {
          throw new SeyeonR19OfflinePositivePinHoldV1();
        }
      },
    });
  } catch {
    // No failed, timed-out or ambiguous COMMIT can be reported as pinned.
    throw new SeyeonR19OfflinePositivePinHoldV1();
  }

  // The transaction wrapper has completed COMMIT before this point.
  return Object.freeze({
    status: 'disposable_source_set_committed' as const,
    attemptId: input.attemptId,
    selectedPersonalRecordCount: sources.length,
    selectedSourcesDigest: input.selection.selectedSourcesDigest,
    permitsProvider: false as const,
    permitsAtomicCommit: false as const,
    permitsHttpReveal: false as const,
  });
}
