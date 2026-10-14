import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
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
import {
  assessSajuBridgeCrossRunReviewV1 as assessReplay,
} from '../scripts/local/saju-bridge-review-replay-v1.mjs';
import {
  assessSajuBridgeSyntheticAttestationV1 as assessSignature,
  makeSajuBridgeSyntheticAttestationMessageV1 as signatureMessage,
  type SajuBridgeSyntheticSignerV1,
} from '../scripts/local/saju-bridge-synthetic-attestation-v1.mjs';

const enabled = process.env.MYEONGHA_DOCKER_SAJU_PROVENANCE === '1';
const stage = process.env.SAJU_BRIDGE_LOCAL_RECOVERY_STAGE;
const syntheticStage = stage === 'cross-synthetic-signatures';
const replayStage = stage === 'cross-replay-review';
const packetStage = stage === 'cross-review-packet' || syntheticStage || replayStage;
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
  if (!enabled || !['cross-provenance','cross-review-packet','cross-synthetic-signatures','cross-replay-review'].includes(stage ?? '')
    || (packetStage && (process.env.MYEONGHA_DOCKER_SAJU_REVIEW_PACKET !== '1'
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
        process.env.SAJU_BRIDGE_LOCAL_REVIEW_RUN_ID ?? '')))
    || (syntheticStage && process.env.MYEONGHA_DOCKER_SAJU_SYNTHETIC_SIGNATURES !== '1')
    || (replayStage && process.env.MYEONGHA_DOCKER_SAJU_REPLAY_REVIEW !== '1')
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
function signSyntheticPacket(packet: SajuBridgeReviewPacketV1) {
  const registry: SajuBridgeSyntheticSignerV1[] = [];
  const pairs = packet.submissions.map(claim => {
    const kp = generateKeyPairSync('ed25519');
    registry.push({
      type: claim.type, sourceId: claim.sourceId,
      publicKeySpkiDerBase64: kp.publicKey.export({type:'spki',format:'der'}).toString('base64'),
    });
    return {claim,privateKey:kp.privateKey};
  });
  const signed = {
    ...packet,
    submissions: pairs.map(({claim,privateKey}) => {
      const payload = signatureMessage(packet,claim);
      if (!payload) throw new Error('Synthetic signing fixture was rejected.');
      return {...claim,signatureClaimBase64url:sign(null,payload,privateKey).toString('base64url')};
    }),
  };
  return {signed,registry};
}
function denySignature(packet: unknown, now: number, registry: unknown,
  classification: string, verification: string) {
  const decision = assessSignature(packet,now,registry);
  expect(decision).toMatchObject({
    classification, signatureVerification:verification,
    keyCustodyAuthority:'NOT_ESTABLISHED',
    independentSourceAuthority:'NOT_ESTABLISHED',
    sameLogicalAttempt:'NOT_PROVEN', globalCommitOrder:'NOT_PROVEN',
    manualReviewAdmissibility:'NOT_ADMISSIBLE',
    decision:'HOLD_MANUAL_REVIEW',
    canExecute:false,canPublish:false,canSell:false,
    automaticRetry:false,automaticCompensation:false,
  });
  expect(Object.isFrozen(decision)).toBe(true);
  expect(JSON.stringify(decision)).not.toContain('publicKeySpkiDerBase64');
  expect(JSON.stringify(decision)).not.toContain('signatureClaimBase64url');
  return decision;
}
describe('Phase 4G synthetic Ed25519 signatures with no trust promotion', () => {
  it('detects wrong keys, replay across run scopes, tampering and signer/key reuse', () => {
    const now = 1900000000000;
    const evidence = sample();
    const packet = claimPacket(evidence,now,randomUUID());
    const {signed,registry} = signSyntheticPacket(packet);
    denySignature(signed,now,registry,
      'SYNTHETIC_SIGNATURES_VALID_UNTRUSTED_HOLD','SYNTHETIC_ONLY_VERIFIED');
    const alternateKey = generateKeyPairSync('ed25519');
    denySignature(signed,now,registry.map((r,i) => i===1
      ? {...r,publicKeySpkiDerBase64: alternateKey.publicKey
        .export({type:'spki',format:'der'}).toString('base64')} : r),
    'SIGNATURE_INVALID_HOLD','REJECTED');
    denySignature(signed,now,registry.map((r,i) => i===1
      ? {...r,publicKeySpkiDerBase64:registry[0]!.publicKeySpkiDerBase64} : r),
    'REUSED_SYNTHETIC_KEY_HOLD','NOT_PERFORMED');
    denySignature(signed,now,registry.map((r,i) => i===1
      ? {...r,sourceId:'different-synthetic-source'} : r),
    'SYNTHETIC_SIGNER_MISMATCH_HOLD','REJECTED');
    denySignature({...signed,submissions:signed.submissions.map((s,i) => i===0
      ? {...s,signatureClaimBase64url:signed.submissions[1]!.signatureClaimBase64url}:s)},
    now,registry,'SIGNATURE_INVALID_HOLD','REJECTED');
    denySignature({...signed,submissions:signed.submissions.map((s,i) => i===0
      ? {...s,statementDigestSha256:'f'.repeat(64)}:s)},
    now,registry,'SIGNATURE_INVALID_HOLD','REJECTED');
    denySignature({...signed,submissions:signed.submissions.map((s,i) => i===0
      ? {...s,submittedAtMs:now-1000}:s)},
    now,registry,'SIGNATURE_INVALID_HOLD','REJECTED');
    const otherRun = randomUUID();
    const digest = fingerprintPacket(otherRun,evidence);
    if (!digest) throw new Error('Test replay fingerprint blocked unexpectedly.');
    const relabeled = {
      ...signed,runId:otherRun,evidenceDigestSha256:digest,
      submissions:signed.submissions.map(s=>({...s,evidenceDigestSha256:digest})),
    };
    denySignature(relabeled,now,registry,'SIGNATURE_INVALID_HOLD','REJECTED');
    denySignature({...signed,submissions:signed.submissions.slice(0,4)},
      now,registry,'REVIEW_PACKET_INVALID_HOLD','NOT_PERFORMED');
    denySignature({...signed,scope:'PRODUCTION'},now,registry,
      'REVIEW_PACKET_INVALID_HOLD','NOT_PERFORMED');
    denySignature(signed,now,[], 'UNTRUSTED_SYNTHETIC_KEY_SET_HOLD','NOT_PERFORMED');
    denySignature(signed,now,registry.map((r,i) => i===0
      ? {...r,publicKeySpkiDerBase64:'INVALID_FAKE_KEY'} : r),
    'UNTRUSTED_SYNTHETIC_KEY_SET_HOLD','NOT_PERFORMED');
  });
});

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

describe('Phase 4H cross-run replay and conflict HOLD', () => {
  it('rejects replay, conflicting same-run evidence, cross-run semantic reuse and malformed peers', () => {
    const now = 1900000000000;
    const first = claimPacket(sample(), now, randomUUID());
    const original = sample();
    const changed = {...original, cases: {...original.cases,
      NONCE_ONLY: {subject:'PRESENT', nonce:'ABSENT', permit:'ISSUED'},
    }};
    const sameRunConflict = claimPacket(changed, now, first.runId);
    const otherRunSameEvidence = claimPacket(sample(), now, randomUUID());
    const otherRunDifferent = claimPacket(changed, now, randomUUID());
    const checks = [
      [first, first, 'IDENTICAL_RUN_REPLAY_HOLD'],
      [sameRunConflict, first, 'SAME_RUN_CONFLICT_HOLD'],
      [otherRunSameEvidence, first, 'CROSS_RUN_DIGEST_REUSE_HOLD'],
      [otherRunDifferent, first, 'DISTINCT_UNVERIFIED_RUNS_HOLD'],
      [first, {...first, approved:true}, 'UNVERIFIED_PACKET_PAIR_HOLD'],
      [first, null, 'UNVERIFIED_PACKET_PAIR_HOLD'],
    ] as const;
    for (const [latest, previous, expected] of checks) {
      const result = assessReplay(latest, previous, now);
      expect(result).toMatchObject({
        classification:expected, replayRegistry:'NOT_AVAILABLE',
        crossRunLinkage:'NOT_PROVEN', independentAuthority:'NOT_ATTESTED',
        manualReviewAdmissibility:'NOT_ADMISSIBLE', decision:'HOLD_MANUAL_REVIEW',
        canExecute:false, canPublish:false, canSell:false,
        automaticRetry:false, automaticCompensation:false,
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.stringify(result)).not.toContain('synthetic-claim-source');
    }
    expect(assessReplay(first, otherRunSameEvidence, NaN).classification)
      .toBe('UNVERIFIED_PACKET_PAIR_HOLD');
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
      if (replayStage && process.env.MYEONGHA_DOCKER_SAJU_REPLAY_REVIEW === '1') {
        const repeated = claimPacket(actual, nowMs, randomUUID());
        expect(assessReplay(packet, packet, nowMs).classification)
          .toBe('IDENTICAL_RUN_REPLAY_HOLD');
        expect(assessReplay(repeated, packet, nowMs).classification)
          .toBe('CROSS_RUN_DIGEST_REUSE_HOLD');
        const expired = claimPacket(actual, nowMs - 300001, randomUUID());
        expect(assessReplay(expired, packet, nowMs).classification)
          .toBe('UNVERIFIED_PACKET_PAIR_HOLD');
        console.log('[saju-bridge] Phase 4H real DB: replay and independent-run semantic reuse held; stale peer held; no trusted registry or execution.');
      }
      if (syntheticStage) {
        const {signed,registry} = signSyntheticPacket(packet);
        denySignature(signed,nowMs,registry,
          'SYNTHETIC_SIGNATURES_VALID_UNTRUSTED_HOLD','SYNTHETIC_ONLY_VERIFIED');
        denySignature(signed,nowMs,registry.map((r,i) => i===2
          ? {...r,sourceId:'unrecognized-source'}:r),
        'SYNTHETIC_SIGNER_MISMATCH_HOLD','REJECTED');
        denySignature({...signed,submissions:signed.submissions.map((s,i) => i===0
          ? {...s,signatureClaimBase64url:signed.submissions[1]!.signatureClaimBase64url}:s)},
        nowMs,registry,'SIGNATURE_INVALID_HOLD','REJECTED');
        console.log('[saju-bridge] Phase 4G real DB: independent TLS read-only evidence, five distinct ephemeral Ed25519 signing keys; cryptographic tampering/foreign signer rejected; synthetic signature validity NEVER authorizes operation.');
      }
    }
  }, 100000);
});
