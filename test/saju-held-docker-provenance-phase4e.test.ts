import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import {
  assessSajuBridgeProvenanceReviewV1 as assessReview,
  type SajuBridgeDisposableReviewPacketV1,
} from '../scripts/local/saju-bridge-provenance-review-v1.mjs';
import {
  assessSajuBridgeReviewSubmissionV1 as assessPacket,
  fingerprintSajuBridgeReviewEvidenceV1 as fingerprintPacket,
  SAJU_BRIDGE_REQUIRED_PROOF_TYPES_V1 as proofTypes,
  SAJU_BRIDGE_REVIEW_PACKET_VERSION_V1 as packetVersion,
  type SajuBridgeReviewPacketV1,
} from '../scripts/local/saju-bridge-review-packet-v1.mjs';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_PROVENANCE === '1';
const stage = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const packetStage = stage === 'cross-review-packet';
const cases = ['NONCE_ONLY', 'PERMIT_ONLY', 'REVOKED_WITH_NONCE'] as const;
type Case = typeof cases[number];
const permitIds: Record<Case, string> = {
  NONCE_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_NONCE ?? '',
  PERMIT_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_ADMISSION ?? '',
  REVOKED_WITH_NONCE: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_PERMIT_REVOKED ?? '',
};
const replayKeys: Record<Case, string> = {
  NONCE_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_NONCE ?? '',
  PERMIT_ONLY: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_ADMISSION ?? '',
  REVOKED_WITH_NONCE: process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_KEY_REVOKED ?? '',
};
const db = {
  subject: 'myeongha_saju_subject_local_verify',
  nonce: 'myeongha_saju_nonce_local_verify',
  admission: 'myeongha_saju_admission_local_verify',
} as const;
type Peer = keyof typeof db;
const certs = enabled ? {
  subject: readFileSync('/certs/subject/ca.crt', 'utf8'),
  nonce: readFileSync('/certs/nonce/ca.crt', 'utf8'),
  admission: readFileSync('/certs/admission/ca.crt', 'utf8'),
} : undefined;
const pools: Pool[] = [];
const peers: Record<Peer, Pool> = {} as Record<Peer, Pool>;
function guard() {
  if (!enabled || !['cross-provenance','cross-review-packet'].includes(stage ?? '')
    || (packetStage && (process.env.MYEONGHA_DOCKER_SAJU_REVIEW_PACKET !== '1'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
        process.env.SAJU_BRIDGE_LOCAL_REVIEW_RUN_ID ?? ''))))
    || process.env.MYEONGHA_DOCKER_SAJU_TLS !== '1'
    || process.env.MYEONGHA_DOCKER_SAJU_PERMIT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_CROSS_DB_FAULT !== '1'
    || process.env.SAJU_BRIDGE_LOCAL_SUBJECT_DB !== db.subject
    || process.env.SAJU_BRIDGE_LOCAL_NONCE_DB !== db.nonce
    || !certs || new Set(Object.values(certs)).size !== 3
    || !cases.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(permitIds[id]))
    || !cases.every(id => /^[A-Za-z0-9_-]{32,128}$/u.test(replayKeys[id]))
    || new Set(cases.map(id => permitIds[id])).size !== 3
    || new Set(cases.map(id => replayKeys[id])).size !== 3
    || ['SUBJECT_DB','NONCE_DB','ADMISSION_DB'].some(id =>
      (process.env['SAJU_BRIDGE_LOCAL_' + id + '_PASSWORD']?.length ?? 0) < 40)) {
    throw new Error('Refusing Phase 4E outside pinned ephemeral PostgreSQL TLS authority.');
  }
}
function pg(peer: Peer): Pool {
  if (!certs) throw new Error('Missing peer certificate.');
  const p = new Pool({
    host: peer + '-db', port: 5432, database: db[peer],
    user: 'postgres',
    password: process.env['SAJU_BRIDGE_LOCAL_' + peer.toUpperCase() + '_DB_PASSWORD'],
    ssl: { ca: certs[peer], rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 2000, query_timeout: 12000,
    idleTimeoutMillis: 800, allowExitOnIdle: true,
  });
  p.on('error', () => { /* Peer failure must never imply source approval. */ });
  pools.push(p);
  return p;
}
async function readOnly<T>(
  pool: Pool, sql: string, args: readonly unknown[] = [],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const readOnlyFlag = await client.query<{ transaction_read_only: string }>(
      'SHOW transaction_read_only',
    );
    expect(readOnlyFlag.rows[0]?.transaction_read_only).toBe('on');
    const rows = await client.query(sql, [...args]);
    await client.query('COMMIT');
    return rows.rows as T[];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* No stale fallback. */ }
    throw error;
  } finally {
    client.release();
  }
}
function digest(key: string): string {
  return createHash('sha256')
    .update('myeongha/saju/source-proof/nonce-replay/v1\0')
    .update(key).digest('hex');
}
function sample(): SajuBridgeDisposableReviewPacketV1 {
  return {
    version: 'myeongha-saju-disposable-evidence-v1',
    scope: 'DISPOSABLE_DOCKER_ONLY',
    peers: {
      subject: { database: db.subject, tlsVerified: true, readOnlyVerified: true },
      nonce: { database: db.nonce, tlsVerified: true,
        readOnlyVerified: true, forcedRls: true,
        identityColumn: 'replay_key_digest', sharedAttemptColumn: false },
      admission: { database: db.admission, tlsVerified: true,
        readOnlyVerified: true, forcedRls: true,
        identityColumn: 'permit_id', sharedAttemptColumn: false },
    },
    cases: {
      NONCE_ONLY: { subject: 'PRESENT', nonce: 'CLAIMED', permit: 'CONSUMED' },
      PERMIT_ONLY: { subject: 'PRESENT', nonce: 'CLAIMED', permit: 'CONSUMED' },
      REVOKED_WITH_NONCE: { subject: 'PRESENT', nonce: 'CLAIMED', permit: 'REVOKED' },
    },
  };
}
function deny(packet: unknown, classification: string) {
  const result = assessReview(packet);
  expect(result).toMatchObject({
    classification, provenance: 'DISPOSABLE_OBSERVATION_NOT_INDEPENDENT_AUTHORITY',
    sameLogicalAttempt: 'NOT_PROVEN', globalCommitOrder: 'NOT_PROVEN',
    manualReviewAdmissibility: 'NOT_ADMISSIBLE',
    decision: 'HOLD_MANUAL_REVIEW',
    canExecute: false, canPublish: false, canSell: false,
    automaticRetry: false, automaticCompensation: false,
  });
  expect(result.missingAuthorityProofs).toHaveLength(5);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.missingAuthorityProofs)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('sameAttempt');
  return result;
}

function claimPacket(evidence: SajuBridgeDisposableReviewPacketV1,
  nowMs: number, runId: string): SajuBridgeReviewPacketV1 {
  const digest = fingerprintPacket(runId, evidence);
  if (!digest) throw new Error('Test evidence is malformed; no review receipt may be generated.');
  return {
    version: packetVersion, scope: 'DISPOSABLE_DOCKER_ONLY',
    runId, evidence, evidenceDigestSha256: digest,
    // These are deliberately self-asserted TEST CLAIMS, not signed or trusted.
    submissions: proofTypes.map((type, i) => ({
      type, sourceId: 'synthetic-claim-source-' + i,
      statementDigestSha256: createHash('sha256').update('untrusted-test-claim-' + i).digest('hex'),
      evidenceDigestSha256: digest, submittedAtMs: nowMs,
      signatureClaimBase64url: 'A'.repeat(86),
    })),
  };
}
function denyPacket(value: unknown, nowMs: number, wanted: string) {
  const x = assessPacket(value, nowMs);
  expect(x).toMatchObject({
    classification: wanted, evidenceAuthority:'NOT_ATTESTED',
    signatureVerification:'NOT_PERFORMED', logicalAttemptBinding:'NOT_PROVEN',
    globalCommitOrder:'NOT_PROVEN',
    independentReviewerApproval:'NOT_OBTAINED',
    manualReviewAdmissibility:'NOT_ADMISSIBLE',
    decision:'HOLD_MANUAL_REVIEW', canExecute:false, canPublish:false,
    canSell:false, automaticRetry:false, automaticCompensation:false,
  });
  expect(Object.isFrozen(x)).toBe(true);
  expect(Object.isFrozen(x.missingProofTypes)).toBe(true);
  expect(JSON.stringify(x)).not.toContain('synthetic-claim-source');
  expect(JSON.stringify(x)).not.toContain('signatureClaimBase64url');
  return x;
}
describe('Phase 4F untrusted manual review submission contract', () => {
  it('rejects omissions, wrong scope, digest swap, duplicate authorities and forged approvals', () => {
    const now = 1900000000000;
    const evidence = sample();
    const runId = randomUUID();
    const packet = claimPacket(evidence, now, runId);
    expect(fingerprintPacket(runId, structuredClone(evidence))).toBe(packet.evidenceDigestSha256);
    expect(fingerprintPacket(randomUUID(), evidence)).not.toBe(packet.evidenceDigestSha256);
    denyPacket(packet, now, 'STRUCTURALLY_COMPLETE_UNVERIFIED_HOLD');
    const less = {...packet, submissions:packet.submissions.slice(0,4)};
    expect(denyPacket(less, now, 'MISSING_REQUIRED_PROOF_HOLD').missingProofTypes)
      .toEqual(['DOCUMENTED_RECOVERY_AND_ROLLBACK_POLICY']);
    denyPacket({...packet, scope:'STAGING'}, now, 'UNTRUSTED_SUBMISSION_HOLD');
    denyPacket({...packet, approved:true, sameAttempt:true},
      now, 'UNTRUSTED_SUBMISSION_HOLD');
    denyPacket({...packet, runId:randomUUID()}, now, 'EVIDENCE_BINDING_MISMATCH_HOLD');
    denyPacket({...packet, evidenceDigestSha256:'0'.repeat(64)},
      now, 'EVIDENCE_BINDING_MISMATCH_HOLD');
    denyPacket({...packet, evidence:{...evidence, cases:{
      ...evidence.cases, NONCE_ONLY:{subject:'PRESENT',nonce:'ABSENT',permit:'CONSUMED'},
    }}}, now, 'EVIDENCE_BINDING_MISMATCH_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 0 ? {...x, evidenceDigestSha256:'0'.repeat(64)} : x)},
      now, 'FOREIGN_EVIDENCE_REFERENCE_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 1 ? {...x, sourceId:packet.submissions[0]!.sourceId} : x)},
      now, 'DUPLICATE_OR_NONINDEPENDENT_SOURCE_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 1 ? {...x, type:packet.submissions[0]!.type} : x)},
      now, 'DUPLICATE_OR_NONINDEPENDENT_SOURCE_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 0 ? {...x, signatureClaimBase64url:'SIGNED_AND_APPROVED'} : x)},
      now, 'UNTRUSTED_PROOF_SHAPE_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 0 ? {...x, approved:true} : x)},
      now, 'UNTRUSTED_PROOF_SHAPE_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 0 ? {...x, submittedAtMs:now-300001} : x)},
      now, 'EXPIRED_OR_FUTURE_CLAIM_HOLD');
    denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
      i === 0 ? {...x, submittedAtMs:now+1} : x)},
      now, 'EXPIRED_OR_FUTURE_CLAIM_HOLD');
    denyPacket({...packet, evidence:{...evidence, peers:{
      ...evidence.peers, nonce:{...evidence.peers.nonce, tlsVerified:false},
    }}}, now, 'UNTRUSTED_SUBMISSION_HOLD');
    denyPacket({secret:'PRIVATE_EXAMPLE_ACCESS_TOKEN', approved:true},
      now, 'UNTRUSTED_SUBMISSION_HOLD');
    expect(JSON.stringify(assessPacket({secret:'PRIVATE_EXAMPLE_ACCESS_TOKEN'},now)))
      .not.toContain('PRIVATE_EXAMPLE_ACCESS_TOKEN');
    denyPacket(packet, NaN, 'UNKNOWN_HOLD');
  });
});

describe('Phase 4E non-authorizing manual review provenance', () => {
  it('never promotes a matching or apparently attested pair', () => {
    const packet = sample();
    deny(packet, 'UNLINKED_DISPOSABLE_EVIDENCE_HOLD');
    deny({...packet, sameAttempt: true, approved: true,
      attestation: 'operator signed approved', matchingTimestamps: true,
    }, 'UNTRUSTED_AUTHORITY_CLAIM_HOLD');
    deny({...packet, peers: {...packet.peers, nonce: {
      ...packet.peers.nonce, sharedAttemptColumn: true,
    }}}, 'UNVERIFIED_LINKAGE_CLAIM_HOLD');
    deny({...packet, cases: {...packet.cases, PERMIT_ONLY: {
      ...packet.cases.PERMIT_ONLY, nonce: 'UNKNOWN',
    }}}, 'UNKNOWN_HOLD');
    deny({...packet, scope: 'PRODUCTION'}, 'UNKNOWN_HOLD');
    deny({...packet, peers: {...packet.peers, admission: {
      ...packet.peers.admission, tlsVerified: false,
    }}}, 'UNKNOWN_HOLD');
    deny(null, 'UNKNOWN_HOLD');
    // Never echo arbitrary attacker-controlled source content.
    expect(JSON.stringify(assessReview({secret: 'PRIVATE_TEST_TOKEN'})))
      .not.toContain('PRIVATE_TEST_TOKEN');
  });
});
describe.skipIf(!enabled)('Phase 4E actual independent disposable authority observation', () => {
  afterAll(async () => { await Promise.all(pools.map(p => p.end())); });
  it('proves separate TLS, read-only rows and missing common causal attempt column', async () => {
    guard();
    for (const name of ['subject','nonce','admission'] as const) peers[name] = pg(name);
    const packet = sample();
    for (const name of ['subject','nonce','admission'] as const) {
      const rows = await readOnly<{ database: string; tls: boolean }>(
        peers[name],
        'select current_database()::text as database, '
        + '(select ssl from pg_stat_ssl where pid=pg_backend_pid()) as tls',
      );
      expect(rows).toEqual([{database: db[name], tls: true}]);
    }
    for (const [peer, table, identity] of [
      ['nonce','saju_source_proof_nonce_claims','replay_key_digest'],
      ['admission','saju_staging_operator_admission_permits_v2','permit_id'],
    ] as const) {
      const rows = await readOnly<{ force: boolean; column_name: string }>(
        peers[peer],
        'select c.relforcerowsecurity as force, a.attname::text as column_name '
        + 'from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace '
        + 'join pg_catalog.pg_attribute a on a.attrelid=c.oid '
        + 'where ns.nspname=$1 and c.relname=$2 '
        + 'and a.attnum > 0 and not a.attisdropped',
        ['public', table],
      );
      expect(rows.length).toBeGreaterThan(1);
      expect(rows.every(x => x.force === true)).toBe(true);
      expect(rows.some(x => x.column_name === identity)).toBe(true);
      expect(rows.filter(x => [
        'attempt_id','logical_attempt_id','correlation_id','operation_id',
      ].includes(x.column_name))).toHaveLength(0);
    }
    const actual = sample();
    for (const id of cases) {
      const subject = await readOnly<{ n: string }>(
        peers.subject,
        "select count(*)::text as n from public.subjects "
        + "where id='8c320001-0000-4000-8000-000000000001'::uuid",
      );
      const nonce = await readOnly<{ n: string }>(
        peers.nonce,
        'select count(*)::text as n from public.saju_source_proof_nonce_claims '
          + 'where replay_key_digest=$1', [digest(replayKeys[id])],
      );
      const permit = await readOnly<{ status: string; consumed: string | null }>(
        peers.admission,
        'select status, consumed_at_ms::text as consumed '
        + 'from public.saju_staging_operator_admission_permits_v2 '
        + 'where permit_id=$1::uuid', [permitIds[id]],
      );
      expect(subject[0]?.n).toBe('1');
      expect(nonce[0]?.n).toBe('1');
      expect(permit).toHaveLength(1);
      const wanted = id === 'REVOKED_WITH_NONCE' ? 'REVOKED' : 'CONSUMED';
      expect(permit[0]?.status).toBe(wanted);
      expect(permit[0]?.consumed === null).toBe(wanted !== 'CONSUMED');
      expect(actual.cases[id]).toEqual({
        subject: 'PRESENT', nonce: 'CLAIMED', permit: wanted,
      });
    }
    deny(actual, 'UNLINKED_DISPOSABLE_EVIDENCE_HOLD');
    // Even same-looking valid records do NOT confer an operator attestation
    // nor establish that these rows came from a single logical attempt.
    console.log('[saju-bridge] Phase 4E real DB: independent TLS and READ ONLY; replay digest != Permit UUID; shared attempt authority NOT_PROVEN; manual review NOT_ADMISSIBLE; HOLD.');
    if (packetStage) {
      const runId = process.env.SAJU_BRIDGE_LOCAL_REVIEW_RUN_ID ?? '';
      const nowMs = Date.now();
      const packet = claimPacket(actual, nowMs, runId);
      const complete = denyPacket(packet, nowMs, 'STRUCTURALLY_COMPLETE_UNVERIFIED_HOLD');
      expect(complete.missingProofTypes).toEqual([]);
      denyPacket({...packet, evidenceDigestSha256:'0'.repeat(64)},
        nowMs, 'EVIDENCE_BINDING_MISMATCH_HOLD');
      denyPacket({...packet, submissions:packet.submissions.slice(0,2)},
        nowMs, 'MISSING_REQUIRED_PROOF_HOLD');
      denyPacket({...packet, submissions:packet.submissions.map((x,i) =>
        i === 1 ? {...x, sourceId:packet.submissions[0]!.sourceId} : x)},
        nowMs, 'DUPLICATE_OR_NONINDEPENDENT_SOURCE_HOLD');
      console.log('[saju-bridge] Phase 4F real DB: five untrusted claimed receipts bound to ephemeral read-only evidence; missing/foreign/duplicate rejected; even structurally complete NOT_ATTESTED, NOT_ADMISSIBLE; no action.');
    }
  }, 100000);
});
