import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HISTORICAL_BUNDLE = Object.freeze({
  version: '20261008090417',
  name: 'seyeon_runtime_1460_1510_acl_before_owner_recovery',
  bytes: 104021,
  md5: 'f70776d8c0f6369f6f13484ba9fa2271',
  individual: Object.freeze(['1460','1470','1480','1490','1500','1510']),
});

const GROUPS = Object.freeze([
  {
    id: 'P1_ACCOUNT_DELETION',
    versions: ['1520'],
    risk: 'HIGH',
    owner: 'Identity/Privacy + DB',
    rationale: 'Existing account deletion finalizer is replaced to synchronize relationship data. Destructive/data-retention semantics require privacy and deletion proof.',
    prerequisite: 'Account deletion rollback/retention and existing production data inspection',
    scope: 'NOT_M1_17_READ_DEPENDENCY',
  },
  {
    id: 'P2_READER_ARTIFACT_AND_SAJU_PROOF',
    versions: ['1530','1540'],
    risk: 'HIGH',
    owner: 'Reader/Saju + Security + DB',
    rationale: 'Durable reading artifact writer, immutable trigger and proof nonce-claim table/RLS/role. May alter source-authoritative reading execution.',
    prerequisite: 'Saju source authority, immutable artifact lifecycle, RLS and data retention tests',
    scope: 'UPSTREAM_PRODUCT_DEPENDENCY_NOT_READ_GRANT',
  },
  {
    id: 'P3_SEYEON_AI_GOVERNANCE_AND_COST',
    versions: ['1550','1560','1570','1580','1590','1600','1610','1620','1630','1650','1670','1680','1690','1700','1710'],
    risk: 'CRITICAL',
    owner: 'SeYeon Runtime + AI Cost + Security + DB',
    rationale: 'Paid AI call ledger/admission/settlement budgets, rate card, source reservation, dedicated runtime roles, guest access and provider receipt worker.',
    prerequisite: 'Existing SeYeon restored 1460–1510 lineage, finance/budget cap, queue worker credential, runtime role and provider idempotency proofs',
    scope: 'SEPARATE_SEYEON_TRACK_HOLD',
  },
  {
    id: 'P4_SEYEON_PIN_AND_SCOPED_READER_QUERY',
    versions: ['1640','1660','1720'],
    risk: 'HIGH',
    owner: 'SeYeon/Reader + Security + DB',
    rationale: 'Zero-personal-source pinned context, existing member thread locator, product-scope Reader RPC. Privacy and authorization-sensitive read/command surfaces.',
    prerequisite: 'Trusted source proof and subject-bound SELECT/RPC execution contract',
    scope: 'CROSS_TRACK_CONTEXT_REVIEW',
  },
  {
    id: 'P5_PRIVATE_READER_LOCK_AND_FIRST_ISSUE',
    versions: ['1740','1750','1760','1770','1780','1790','1800','1810','1820'],
    risk: 'CRITICAL',
    owner: 'Commerce/Reader + Security + DB',
    rationale: 'Private scope locks, provider revoke bridge, first Receipt-backed purchase Grant/Reader binding and transactional issue command.',
    prerequisite: '1050 Verified Receipt, D1 lineage/idempotency, strict SECURITY INVOKER owner ACL, rollback/replay/unknown-COMMIT tests',
    scope: 'DIRECT_M1_17_D2_BASELINE_BUT_NOT_AN_APPROVED_PRODUCTION_ISSUER',
  },
  {
    id: 'P6_CANCEL_AND_REVOKE_EFFECTS',
    versions: ['1830','1840','1850','1860','1870','1880'],
    risk: 'CRITICAL',
    owner: 'Commerce Refund/Cancel + DB + Security',
    rationale: 'Verified cancellation/impact lockset, atomic revocation, PortOne observation shadow and reviewed bridge/approval table.',
    prerequisite: 'Provider cancel provenance, charge/refund rights, original Grant/revocation atomicity and negative public ACL proof',
    scope: 'CANCELLATION_AUTHORITY_SEPARATE_APPROVAL',
  },
  {
    id: 'P7_PRIVATE_WRITER_ACL_CLOSURE',
    versions: ['1890','1900'],
    risk: 'CRITICAL',
    owner: 'DB Security',
    rationale: 'Revokes legacy and current D2 Writer EXECUTE from PUBLIC, app, Commerce and service principals.',
    prerequisite: 'Exact PostgreSQL role privilege inventory; deny-by-default must be proven at migration boundaries',
    scope: 'DIRECT_M1_17_SECURITY_DEPENDENCY',
  },
  {
    id: 'P8_CANCEL_DURABLE_WORKER_AND_REVIEW',
    versions: ['1910','1920','1930','1940','1950','1960'],
    risk: 'CRITICAL',
    owner: 'Commerce Operations + Refund + Security + DB',
    rationale: 'PortOne cancel ingress inbox, durable job claim/fail/complete, private operations review, alert outbox, dual approval and retry evidence.',
    prerequisite: 'No live cancel job execution; queue replay, eventual consistency, operator credential and dual-approval verification',
    scope: 'CANCELLATION_OPERATIONS_SEPARATE_APPROVAL',
  },
  {
    id: 'P9_APPROVED_MINIMAL_RECOVERY_READ',
    versions: ['1970'],
    risk: 'HIGH',
    owner: 'Commerce + DB Security + Privacy',
    rationale: 'User-approved API-only EXECUTE for subject-scoped SECURITY DEFINER HOLD enum, without raw Receipt/Grant/Reader SELECT.',
    prerequisite: 'Positive isolated PG15/17 M1-17 test, verified D2/1900 baseline and fresh READ ONLY transaction, live migration parity',
    scope: 'READ_GRANT_APPROVED_IN_CODE_ONLY_LIVE_CUTOVER_HOLD',
  },
]);

export const MIGRATION_IMPACT_GROUPS = GROUPS;
const byVersion = new Map(GROUPS.flatMap(group =>
  group.versions.map(version => [version, group])));
if (byVersion.size !== GROUPS.reduce((n, g) => n + g.versions.length, 0)) {
  throw new Error('M1-19: duplicated impact version category');
}

export function inspectMigrationSql(sql) {
  return Object.freeze({
    sha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
    chars: sql.length,
    securityDefiner: /\bsecurity\s+definer\b/iu.test(sql),
    roleDdl: /\b(?:create|alter)\s+role\b/iu.test(sql),
    privileges: /\b(?:grant|revoke)\s+(?:execute|usage|select|all|update|insert|delete)\b/iu.test(sql),
    rlsPolicy: /\bcreate\s+policy\b/iu.test(sql),
    tableDdl: /\b(?:create|alter)\s+table\b/iu.test(sql),
    triggerDdl: /\bcreate\s+(?:or\s+replace\s+)?trigger\b/iu.test(sql),
    deleteOrUpdate: /\b(?:delete\s+from|update\s+[\w.]+\s+set)\b/iu.test(sql),
    functionDefinitions: [...sql.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+([\w."]+)/giu)]
      .map(m => m[1]).slice(0, 15),
  });
}

function readRepositoryMigrations(dir) {
  const names = readdirSync(dir)
    .filter(n => /^\d{4,14}_.+\.sql$/u.test(n))
    .sort();
  const versions = names.map(n => n.split('_')[0]);
  if (new Set(versions).size !== versions.length) {
    throw new Error('M1-19: duplicate migration versions found in repo');
  }
  return names.map(file => ({
    version: file.split('_')[0],
    file,
    ...inspectMigrationSql(readFileSync(dir + '/' + file, 'utf8')),
  }));
}

export function identifyHistoricalBundle(snapshot) {
  const h = snapshot?.historicalBundle;
  if (!h) return 'HOLD_MISSING_HISTORICAL_BUNDLE_EVIDENCE';
  const expected = HISTORICAL_BUNDLE;
  const valid = h.version === expected.version &&
    h.name === expected.name &&
    h.bytes === expected.bytes && h.statementCount === 1 &&
    h.md5 === expected.md5 &&
    JSON.stringify(h.individualVersions) === JSON.stringify(expected.individual) &&
    h.emptyIndividualStatements === 6 && h.applied1520to1640 === 0;
  return valid ? 'IDENTIFIED_EXISTING_SEYEON_RESTORE_UNRECONCILED' :
    'HOLD_HISTORICAL_BUNDLE_FINGERPRINT_DRIFT';
}

export function auditLiveMigrationImpactV1(snapshot, directory = 'supabase/migrations') {
  const versions = snapshot?.installedVersions;
  if (!Array.isArray(versions) ||
      !versions.every(v => typeof v === 'string' && /^\d{4,14}$/u.test(v)) ||
      new Set(versions).size !== versions.length) {
    throw new Error('M1-19: invalid or duplicated live migration history');
  }
  const live = new Set(versions);
  const repo = readRepositoryMigrations(directory);
  const unmatched = versions.filter(v => !repo.some(m => m.version === v));
  const unapplied = repo.filter(m => !live.has(m.version));
  const classified = unapplied.map(entry => {
    const group = byVersion.get(entry.version);
    return {
      ...entry,
      group: group?.id ?? 'UNREVIEWED_SOURCE_CHANGE',
      risk: group?.risk ?? 'CRITICAL',
      owner: group?.owner ?? 'DB Owner/Unknown',
      approvedForLiveApply: false,
    };
  });
  const unknownVersions = classified
    .filter(x => x.group === 'UNREVIEWED_SOURCE_CHANGE')
    .map(x => x.version);
  const recovered = identifyHistoricalBundle(snapshot);
  const historicalKnown = unmatched.length === 1 &&
    unmatched[0] === HISTORICAL_BUNDLE.version &&
    recovered === 'IDENTIFIED_EXISTING_SEYEON_RESTORE_UNRECONCILED';
  const groups = GROUPS.map(group => ({
    id: group.id, risk: group.risk, owner: group.owner,
    rationale: group.rationale, prerequisite: group.prerequisite,
    scope: group.scope,
    missingVersions: classified.filter(x => x.group === group.id).map(x => x.version),
  }));
  return {
    verdict: !historicalKnown ? 'HOLD_UNRECONCILED_REMOTE_PROVENANCE'
      : unknownVersions.length > 0 ? 'HOLD_UNREVIEWED_SOURCE_MIGRATIONS'
      : unapplied.length > 0 ? 'HOLD_CLASSIFIED_PRODUCTION_SCHEMA_DRIFT'
      : 'HOLD_OWNER_RELEASE_EVIDENCE_REQUIRED',
    historicalBundleStatus: recovered,
    repositoryMigrationCount: repo.length,
    installedMigrationCount: live.size,
    missingSourceCount: unapplied.length,
    unmatchedRemoteCount: unmatched.length,
    unmatchedRemoteVersions: unmatched,
    unreviewedSourceVersions: unknownVersions,
    groups,
    migrationInventory: classified,
    deployAuthorized: false,
    migrationHistoryRepairAuthorized: false,
    privateIssuerAuthorized: false,
    providerPaymentAuthorized: false,
    paidReaderAuthorized: false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/operations/m1-19-live-migration-impact.mjs <read-only-live-snapshot.json>');
    process.exitCode = 2;
  } else {
    const snapshot = JSON.parse(readFileSync(file, 'utf8'));
    const result = auditLiveMigrationImpactV1(snapshot);
    const concise = process.argv.includes('--summary');
    if (concise) {
      const { migrationInventory, ...summary } = result;
      console.log(JSON.stringify(summary, null, 2));
    } else console.log(JSON.stringify(result, null, 2));
    // This is a *diagnostic* tool: absence of permission must fail closed.
    if (result.verdict !== 'HOLD_OWNER_RELEASE_EVIDENCE_REQUIRED') {
      process.exitCode = 3;
    }
  }
}
