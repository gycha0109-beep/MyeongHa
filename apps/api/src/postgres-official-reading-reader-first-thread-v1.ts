import {
  resolveCharacterStandardReadingAccessMetadataV1,
  type CharacterStandardReadingAccessMetadataV1,
} from './character-standard-reading-knowledge.js';
import { createPostgresCharacterStandardReadingKnowledgePortsV1 } from './postgres-character-standard-reading-knowledge.js';
import { createPostgresChatThreadRuntimeBindingAuthorityPortV1 } from './postgres-chat-thread-runtime-binding.js';
import { createPostgresOfficialReaderThreadLocatorAuthorityPortV1 } from './postgres-official-reader-thread-locator-v1.js';
import {
  resolveOfficialReadingReaderThreadV1,
  OfficialReadingReaderThreadResolutionErrorV1,
  type ResolvedOfficialReadingReaderThreadV1,
} from './official-reading-reader-thread-resolution-v1.js';
import {
  resolveProductReaderEligibilityV1,
  type ProductReaderEligibilityAuthorityPortV1,
} from './product-reader-eligibility-policy-v1.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHAT_OPEN_SQL = `
select
  thread_id::text as "threadId",
  thread_character_id::text as "threadCharacterId",
  created,
  active_content_release_id::text as "activeContentReleaseId",
  active_content_bundle_id::text as "activeContentBundleId",
  character_id as "characterId"
from public.cmd_open_member_single_character_thread_v1(
  $1::uuid, $2::text, $3::uuid, $4::uuid
)
`.trim();
const CLOCK_SQL = 'select transaction_timestamp() as "effectiveAt"';

type OpenRowV1 = Readonly<{
  threadId: unknown;
  threadCharacterId: unknown;
  created: unknown;
  activeContentReleaseId: unknown;
  activeContentBundleId: unknown;
  characterId: unknown;
}>;

type ClockRowV1 = Readonly<{ effectiveAt: unknown }>;

export interface OpenPostgresOfficialReadingReaderFirstThreadInputV1 {
  readonly pool: PostgresSubjectPoolV1;
  /** Already authenticated by the request ingress; NOT browser-provided IDs. */
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly readingId: unknown;
  readonly readerCharacterId: unknown;
  /** Server-side random UUID supplier; values are never client-provided. */
  readonly createUuid: () => string;
  /** Product Owner must install the approved authority for this SAME client. */
  readonly createProductReaderPolicyAuthorityPort: (
    client: PostgresTransactionQueryV1,
  ) => ProductReaderEligibilityAuthorityPortV1;
}

export type OpenedPostgresOfficialReadingReaderFirstThreadV1 = Readonly<{
  created: boolean;
  resolved: ResolvedOfficialReadingReaderThreadV1;
}>;

function deny(code: ConstructorParameters<typeof OfficialReadingReaderThreadResolutionErrorV1>[0]): never {
  throw new OfficialReadingReaderThreadResolutionErrorV1(code);
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function sameAccess(a: CharacterStandardReadingAccessMetadataV1, b: CharacterStandardReadingAccessMetadataV1): boolean {
  return a.subjectId === b.subjectId &&
    a.readingId === b.readingId &&
    a.readerCharacterId === b.readerCharacterId &&
    a.readerContentBundleId === b.readerContentBundleId &&
    a.readingSessionId === b.readingSessionId &&
    a.productId === b.productId &&
    a.productSpecVersion === b.productSpecVersion &&
    a.sajuDomain === b.sajuDomain &&
    a.readingContractVersion === b.readingContractVersion &&
    a.sourceBirthRevisionId === b.sourceBirthRevisionId &&
    a.responseHash === b.responseHash &&
    a.domainCapabilityVersion === b.domainCapabilityVersion &&
    a.sajuEngineVersion === b.sajuEngineVersion;
}

function checkedOpenRow(rows: readonly OpenRowV1[], reader: string, bundle: string): Readonly<{
  threadId: string;
  created: boolean;
  releaseId: string;
}> {
  const row = rows[0];
  if (rows.length !== 1 || !row ||
      !uuid(row.threadId) || !uuid(row.threadCharacterId) ||
      !uuid(row.activeContentReleaseId) || !uuid(row.activeContentBundleId) ||
      typeof row.created !== 'boolean' ||
      row.characterId !== reader ||
      row.activeContentBundleId !== bundle) {
    return deny('THREAD_INCOMPATIBLE');
  }
  return Object.freeze({
    threadId: row.threadId,
    created: row.created,
    releaseId: row.activeContentReleaseId,
  });
}

/**
 * D-05-C **DORMANT INTERNAL CANDIDATE**, not a public Reader admission path.
 *
 * The existing Member x Character command owns idempotency and Member locks.
 * We invoke it only after verifying exact purchased Reading access and Product
 * policy in one canonical Member transaction. The command uses the *default*
 * Release; the RETURNED pinned Bundle MUST match the exact purchased Bundle.
 * A mismatch throws and rolls back any newly inserted Thread/participant.
 *
 * Existing Thread reuse does not invoke the mutating command. Missing Thread
 * creation is NOT enabled on any HTTP endpoint; D05-A/C Product/DB Owner
 * approvals and refund/T2 linearization remain required for activation.
 */
export async function openPostgresOfficialReadingReaderFirstThreadV1(
  input: OpenPostgresOfficialReadingReaderFirstThreadInputV1,
): Promise<OpenedPostgresOfficialReadingReaderFirstThreadV1> {
  if (input.verifiedEvidence?.kind !== 'member' ||
      !uuid(input.readingId) ||
      typeof input.readerCharacterId !== 'string' ||
      input.readerCharacterId.length === 0 ||
      input.readerCharacterId.length > 64 ||
      input.readerCharacterId.trim() !== input.readerCharacterId) {
    return deny('ACCESS_DENIED');
  }

  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') return deny('ACCESS_DENIED');
      const subjectId = resolvedSubject.subjectId;
      const readingId = input.readingId as string;
      const reader = input.readerCharacterId as string;
      const clock = await client.query<ClockRowV1>(CLOCK_SQL);
      const time = clock.rows[0]?.effectiveAt;
      const date = time instanceof Date ? time
        : typeof time === 'string' ? new Date(time) : null;
      if (clock.rows.length !== 1 || !date || !Number.isFinite(date.getTime())) {
        return deny('ACCESS_DENIED');
      }
      const effectiveAt = date.toISOString();
      const accessPort = createPostgresCharacterStandardReadingKnowledgePortsV1(client).accessAuthorityPort;
      const locator = createPostgresOfficialReaderThreadLocatorAuthorityPortV1(client);
      const binding = createPostgresChatThreadRuntimeBindingAuthorityPortV1(client);
      const policyPort = input.createProductReaderPolicyAuthorityPort(client);
      if (!policyPort || typeof policyPort.readApprovedRule !== 'function') {
        return deny('POLICY_HOLD');
      }

      async function access(): Promise<CharacterStandardReadingAccessMetadataV1> {
        try {
          return await resolveCharacterStandardReadingAccessMetadataV1({
            resolvedSubjectId: subjectId,
            readingId,
            readerCharacterId: reader,
            effectiveAt,
            accessAuthorityPort: accessPort,
          });
        } catch {
          return deny('ACCESS_DENIED');
        }
      }

      const before = await access();
      const productSource = Object.freeze({
        productId: before.productId,
        productSpecVersion: before.productSpecVersion,
        sajuDomain: before.sajuDomain,
      });
      const firstPolicy = await resolveProductReaderEligibilityV1({
        source: productSource,
        serverReaderId: reader,
        effectiveAt,
        authorityPort: policyPort,
      });
      if (firstPolicy.status !== 'eligible') return deny('POLICY_HOLD');

      let candidates: readonly Readonly<{ threadId: string }>[];
      try {
        candidates = await locator.readActiveMemberSingleCharacterThreads({
          subjectId, readerCharacterId: reader,
        });
      } catch {
        return deny('THREAD_UNAVAILABLE');
      }
      if (!Array.isArray(candidates)) return deny('THREAD_UNAVAILABLE');
      if (candidates.length > 1) return deny('THREAD_AMBIGUOUS');

      let created = false;
      let opened: ReturnType<typeof checkedOpenRow> | null = null;
      if (candidates.length === 0) {
        const newThreadId = input.createUuid();
        const newParticipantId = input.createUuid();
        if (!uuid(newThreadId) || !uuid(newParticipantId) ||
            newThreadId === newParticipantId) {
          return deny('THREAD_INCOMPATIBLE');
        }
        const result = await client.query<OpenRowV1>(CHAT_OPEN_SQL, [
          subjectId, reader, newThreadId, newParticipantId,
        ]);
        // Existing command chooses active default Bundle; wrong Bundle rolls
        // BACK the transaction (including INSERTs), never commits a mismatch.
        opened = checkedOpenRow(result.rows, reader, before.readerContentBundleId);
        created = opened.created;
      } else if (!uuid(candidates[0]?.threadId)) {
        return deny('THREAD_INCOMPATIBLE');
      }

      // Recheck exact Grant, source, Product policy and runtime binding even
      // after a concurrent open returns created:false. Any failure rolls back.
      const verified = await resolveOfficialReadingReaderThreadV1({
        resolvedSubjectId: subjectId,
        resolvedSubjectKind: 'member',
        readingId,
        readerCharacterId: reader,
        effectiveAt,
        accessAuthorityPort: accessPort,
        productReaderEligibilityAuthorityPort: policyPort,
        threadLocatorAuthorityPort: locator,
        threadBindingAuthorityPort: binding,
      });
      const after = await access();
      const lastPolicy = await resolveProductReaderEligibilityV1({
        source: productSource,
        serverReaderId: reader,
        effectiveAt,
        authorityPort: policyPort,
      });
      if (!sameAccess(before, after) ||
          lastPolicy.status !== 'eligible' ||
          lastPolicy.ruleVersion !== firstPolicy.ruleVersion ||
          lastPolicy.approvedPolicyRevision !== firstPolicy.approvedPolicyRevision ||
          verified.sourceResponseHash !== before.responseHash ||
          verified.productRuleVersion !== firstPolicy.ruleVersion ||
          verified.approvedPolicyRevision !== firstPolicy.approvedPolicyRevision ||
          (opened !== null &&
            (opened.threadId !== verified.threadId ||
             opened.releaseId !== verified.activeContentReleaseId))) {
        return deny('ACCESS_DENIED');
      }
      return Object.freeze({ created, resolved: verified });
    },
  });
}
