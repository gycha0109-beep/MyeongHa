import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { executePostgresAccountDeletionWorkerTransactionV1 } from './postgres-account-deletion-worker.js';
import type {
  OfficialReaderOffPrimaryStoreV1,
  OfficialReaderScopeDeletionFenceV1,
} from './official-reader-node-offprimary-privacy-store-v1.js';

/**
 * S4 internal cleanup Worker: durable Commerce entitlement lifecycle ->
 * Reader scope queue -> external, immutable deletion manifest ->
 * exact last-right S1 transaction -> physical DB purge -> original key
 * destruction -> external acknowledgment -> completed DB job.
 *
 * Never used from the PortOne request or a public RPC. Cancellation success
 * is independent of the offline Privacy ledger's availability. The private
 * read path already checks current Entitlement in the original S1 scope.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REF = /^reader-dek-v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const DELIVERY_PRUNE_AVAILABLE_SQL = `
select pg_catalog.to_regprocedure(
  'public.internal_prune_official_reader_paid_delivery_v1(integer)'
) is not null as "installed"
`;
const DELIVERY_PRUNE_SQL = `
select public.internal_prune_official_reader_paid_delivery_v1(
  $1::integer
)::text as "deletedCount"
`;
const LIST_SQL = `
select job_id::text as "jobId"
from public.internal_list_official_reader_paid_answer_purge_jobs_v1($1::integer)
`;
const CLAIM_SQL = `
select subject_id::text as "subjectId",
       official_reading_id::text as "readingId",
       reader_character_id as "readerCharacterId",
       job_status as "jobStatus"
from public.internal_claim_official_reader_paid_answer_purge_v1($1::uuid,$2::text)
`;
const MANIFEST_SQL = `
select public.internal_qry_official_reader_paid_answer_purge_manifest_v1(
  $1::uuid,$2::text
) as "result"
`;
const PURGE_SQL = `
select public.internal_commit_official_reader_paid_answer_purge_v1(
  $1::uuid,$2::text,$3::text,$4::uuid[],$5::text[]
)::text as "deletedCount"
`;
const RENEW_SQL = `
select public.internal_renew_official_reader_paid_answer_purge_lease_v1(
  $1::uuid,$2::text
) as "renewed"
`;
const FINISH_SQL = `
select public.internal_finish_official_reader_paid_answer_purge_v1(
  $1::uuid,$2::text,$3::text,$4::uuid[]
) as "done"
`;
const EMPTY_SQL = `
select public.internal_finish_empty_official_reader_paid_answer_purge_v1(
  $1::uuid,$2::text
) as "done"
`;
const RELEASE_SQL = `
select public.internal_release_official_reader_paid_answer_purge_v1(
  $1::uuid,$2::text
) as "released"
`;

export interface OfficialReaderPrivateRevocationPurgeBatchResultV1 {
  readonly schemaVersion: 'official-reader-s4-revocation-purge-batch-v1';
  readonly discovered: number;
  readonly completed: number;
  readonly failed: number;
  readonly deferredForSiblingRight: number;
  readonly empty: number;
  readonly keysDestroyed: number;
  readonly rowsDeleted: number;
  /** No-content S7 delivery preparation/ACK receipts past 90 days. */
  readonly deliveryReceiptsPruned: number;
  readonly publicPaidReadEnabled: false;
}

type PurgeClaim = Readonly<{
  subjectId: string;
  readingId: string;
  readerCharacterId: string;
  jobStatus: 'claimed' | 'db_erased';
}>;

type PurgeManifest =
  | Readonly<{
      state: 'sibling_right_present' | 'no_content';
      subjectId: string;
      readingId: string;
      readerCharacterId: string;
    }>
  | Readonly<{
      state: 'eligible';
      subjectId: string;
      readingId: string;
      readerCharacterId: string;
      entries: readonly Readonly<{
        bodyId: string;
        encryptionKeyRef: string;
      }>[];
    }>
  | Readonly<{
      state: 'db_erased';
      subjectId: string;
      readingId: string;
      readerCharacterId: string;
      externalFenceId: string;
    }>;

function fail(): never {
  throw new Error('Protected Reader revocation cleanup is unavailable.');
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) return fail();
  return value.toLowerCase();
}

function nonEmpty(value: unknown, max=256): string {
  if (typeof value !== 'string' || !value.length
      || value.length>max || value.trim()!==value) return fail();
  return value;
}

function boolean(value: unknown): boolean {
  if (value!==true) return fail();
  return true;
}

function parseManifest(value: unknown, claim: PurgeClaim): PurgeManifest {
  if (!value || typeof value!=='object' || Array.isArray(value)) return fail();
  const v = value as Record<string,unknown>;
  if (uuid(v.subjectId)!==claim.subjectId || uuid(v.readingId)!==claim.readingId
      || nonEmpty(v.readerCharacterId)!==claim.readerCharacterId) return fail();
  if (v.state==='sibling_right_present' || v.state==='no_content') {
    return {
      state:v.state,
      subjectId:claim.subjectId,
      readingId:claim.readingId,
      readerCharacterId:claim.readerCharacterId,
    };
  }
  if (v.state==='db_erased') {
    return {
      state:'db_erased',
      subjectId:claim.subjectId,
      readingId:claim.readingId,
      readerCharacterId:claim.readerCharacterId,
      externalFenceId:uuid(v.externalFenceId),
    };
  }
  if (v.state!=='eligible' || !Array.isArray(v.entries)
      || v.entries.length===0 || v.entries.length>50000) return fail();
  const entries = v.entries.map((record: unknown) => {
    if (!record || typeof record!=='object' || Array.isArray(record)) return fail();
    const r = record as Record<string,unknown>;
    const bodyId = uuid(r.bodyId);
    const encryptionKeyRef = nonEmpty(r.encryptionKeyRef);
    if (!REF.test(encryptionKeyRef)) return fail();
    return Object.freeze({bodyId,encryptionKeyRef});
  });
  if (new Set(entries.map(r=>r.bodyId)).size!==entries.length
      || new Set(entries.map(r=>r.encryptionKeyRef)).size!==entries.length) return fail();
  return Object.freeze({
    state:'eligible' as const,
    subjectId:claim.subjectId,
    readingId:claim.readingId,
    readerCharacterId:claim.readerCharacterId,
    entries:Object.freeze(entries),
  });
}

function validateFence(
  fence: OfficialReaderScopeDeletionFenceV1 | null,
  jobId: string,
  claim: PurgeClaim,
): OfficialReaderScopeDeletionFenceV1 {
  if (!fence || fence.version!=='official-reader-scope-deletion-fence-v1'
      || fence.jobId!==jobId || fence.subjectId!==claim.subjectId
      || fence.officialReadingId!==claim.readingId
      || fence.readerCharacterId!==claim.readerCharacterId
      || !UUID.test(fence.fenceId)
      || !Array.isArray(fence.bodyIds) || !Array.isArray(fence.keyRefs)
      || fence.bodyIds.length===0 || fence.bodyIds.length>50000
      || fence.bodyIds.length!==fence.keyRefs.length) return fail();
  // A db_erased retry trusts this backup-independent fence to choose
  // irreversible DEK destruction. Re-check EVERY element and uniqueness,
  // even though a newly recorded eligible manifest was already validated.
  // An invalid/duplicated key must never enter the erasure loop.
  if (fence.bodyIds.some(id => typeof id!=='string' || !UUID.test(id))
      || fence.keyRefs.some(ref => typeof ref!=='string' || !REF.test(ref))
      || new Set(fence.bodyIds.map(id => id.toLowerCase())).size!==fence.bodyIds.length
      || new Set(fence.keyRefs.map(ref => ref.toLowerCase())).size!==fence.keyRefs.length) {
    return fail();
  }
  return fence;
}

async function transaction<T>(
  pool: PostgresSubjectPoolV1,
  sql: string,
  params: readonly unknown[],
): Promise<readonly T[]> {
  return executePostgresAccountDeletionWorkerTransactionV1({
    pool,
    execute: async (client) => {
      const result = await client.query<T>(sql,params);
      return result.rows;
    },
  });
}

async function single<T>(pool: PostgresSubjectPoolV1,sql:string,
  params: readonly unknown[]): Promise<T> {
  const rows=await transaction<T>(pool,sql,params);
  if (rows.length!==1 || rows[0]===undefined) return fail();
  return rows[0];
}

async function requireLiveLease(
  pool: PostgresSubjectPoolV1,
  jobId: string,
  owner: string,
): Promise<void> {
  const renewed=await single<{renewed:unknown}>(
    pool,RENEW_SQL,[jobId,owner],
  );
  boolean(renewed.renewed);
}

async function finishDbErased(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly store: OfficialReaderOffPrimaryStoreV1;
  readonly jobId: string;
  readonly worker: string;
  readonly claim: PurgeClaim;
  readonly fence: OfficialReaderScopeDeletionFenceV1;
}): Promise<number> {
  const {store,fence,jobId}=input;
  await requireLiveLease(input.pool,jobId,input.worker);
  await store.scopeLedger.acknowledgeScopeDatabaseErasure(jobId,fence.fenceId);
  let keysDestroyed=0;
  for (let index=0;index<fence.keyRefs.length;index++) {
    // The database lease is bounded. Renew it periodically while performing
    // irreversible filesystem erasure OUTSIDE PostgreSQL transactions.
    // A restarted Worker has a NEW ownership token; any stale caller stops.
    if(index%100===0) {
      await requireLiveLease(input.pool,jobId,input.worker);
    }
    const ref=fence.keyRefs[index]!;
    if (!(await store.keys.isKeyDestroyed(ref))) {
      await store.keys.destroyKey(ref);
      keysDestroyed++;
    }
    if (!(await store.keys.isKeyDestroyed(ref))) return fail();
  }
  await requireLiveLease(input.pool,jobId,input.worker);
  await store.scopeLedger.acknowledgeScopeKeyErasure(jobId,fence.fenceId);
  const marked=await single<{done:unknown}>(
    input.pool,FINISH_SQL,[
      jobId,input.worker,fence.fenceId,[...fence.bodyIds],
    ],
  );
  boolean(marked.done);
  return keysDestroyed;
}

export async function runOfficialReaderPrivateRevocationPurgeBatchV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly store: OfficialReaderOffPrimaryStoreV1;
  readonly workerId: string;
  readonly limit: number;
}): Promise<OfficialReaderPrivateRevocationPurgeBatchResultV1> {
  const worker = nonEmpty(input.workerId);
  if (!input.pool || !input.store?.keys || !input.store?.scopeLedger
      || !Number.isInteger(input.limit)
      || input.limit<1 || input.limit>50) return fail();

  const jobs = await transaction<{jobId:unknown}>(input.pool,LIST_SQL,[input.limit]);
  let completed=0,failed=0,empty=0,deferredForSiblingRight=0,rowsDeleted=0,keysDestroyed=0;

  for (const row of jobs) {
    try {
    const jobId=uuid(row.jobId);
    const claimed=await transaction<{
      subjectId:unknown;
      readingId:unknown;
      readerCharacterId:unknown;
      jobStatus:unknown;
    }>(input.pool,CLAIM_SQL,[jobId,worker]);
    if (claimed.length===0) continue;
    if (claimed.length!==1) return fail();
    const result=claimed[0]!;
    const claim:PurgeClaim = {
      subjectId:uuid(result.subjectId),
      readingId:uuid(result.readingId),
      readerCharacterId:nonEmpty(result.readerCharacterId),
      jobStatus:result.jobStatus==='claimed' || result.jobStatus==='db_erased'
        ? result.jobStatus : fail(),
    };

    const snapshot=await single<{result:unknown}>(
      input.pool,MANIFEST_SQL,[jobId,worker],
    );
    const manifest=parseManifest(snapshot.result,claim);

    if (manifest.state==='sibling_right_present') {
      const released=await single<{released:unknown}>(
        input.pool,RELEASE_SQL,[jobId,worker],
      );
      boolean(released.released);
      deferredForSiblingRight++;
      continue;
    }

    if (manifest.state==='no_content') {
      const closed=await single<{done:unknown}>(
        input.pool,EMPTY_SQL,[jobId,worker],
      );
      boolean(closed.done);
      empty++;
      continue;
    }

    let fence:OfficialReaderScopeDeletionFenceV1;
    if (manifest.state==='db_erased') {
      fence=validateFence(
        await input.store.scopeLedger.readScopeDeletionFence(jobId),jobId,claim,
      );
      if (fence.fenceId!==manifest.externalFenceId) return fail();
    } else {
      if (manifest.state !== 'eligible') return fail();
      const entries=manifest.entries;
      fence=validateFence(
        await input.store.scopeLedger.recordScopeDeletionFence({
          jobId,
          subjectId:claim.subjectId,
          officialReadingId:claim.readingId,
          readerCharacterId:claim.readerCharacterId,
          bodyIds:entries.map(e=>e.bodyId),
          keyRefs:entries.map(e=>e.encryptionKeyRef),
        }),jobId,claim,
      );
      const expectedBodyIds=[...entries.map(e=>e.bodyId)];
      const expectedKeys=[...entries.map(e=>e.encryptionKeyRef)];
      if (fence.bodyIds.length!==expectedBodyIds.length
          || fence.keyRefs.length!==expectedKeys.length
          || !expectedBodyIds.every(id=>fence.bodyIds.includes(id))
          || !expectedKeys.every(id=>fence.keyRefs.includes(id))) {
        return fail();
      }

      // This fresh transaction reacquires S1 and rechecks ALL current
      // sibling purchase rights. External IO was done with NO DB lock held.
      const deletion=await single<{deletedCount:unknown}>(
        input.pool,PURGE_SQL,
        [jobId,worker,fence.fenceId,expectedBodyIds,expectedKeys],
      );
      const count = Number(deletion.deletedCount);
      if (!Number.isSafeInteger(count) || count!==entries.length) return fail();
      rowsDeleted+=count;
    }

    keysDestroyed+=await finishDbErased({
      pool:input.pool,store:input.store,jobId,worker,claim,fence,
    });
    completed++;
    } catch {
      // An independently broken/refunded scope cannot starve the rest of
      // this batch. The claimed row is left for lease expiry and future
      // idempotent resumption; do not log Subject/key/Receipt identifiers.
      failed++;
    }
  }

  if (jobs.length>0 && failed===jobs.length) {
    return fail();
  }

  // S7 receipt retention is independent of refund/S4 deletion. Existing
  // Workers without migration 2140 may still finish paid-body erasure; if
  // S7 is installed, its expired receipts MUST be pruned within the same
  // governed private system-Worker execution role (never by a client).
  const schema=await single<{installed:unknown}>(
    input.pool,DELIVERY_PRUNE_AVAILABLE_SQL,[],
  );
  if (typeof schema.installed!=='boolean') return fail();
  let deliveryReceiptsPruned=0;
  if (schema.installed) {
    const pruned=await single<{deletedCount:unknown}>(
      input.pool,DELIVERY_PRUNE_SQL,[500],
    );
    const value=Number(pruned.deletedCount);
    if (!Number.isSafeInteger(value) || value<0 || value>500) return fail();
    deliveryReceiptsPruned=value;
  }
  return Object.freeze({
    schemaVersion:'official-reader-s4-revocation-purge-batch-v1' as const,
    discovered:jobs.length,
    completed,
    failed,
    deferredForSiblingRight,
    empty,
    keysDestroyed,
    rowsDeleted,
    deliveryReceiptsPruned,
    publicPaidReadEnabled:false as const,
  });
}
