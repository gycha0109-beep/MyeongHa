import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MIGRATION_IMPACT_GROUPS, HISTORICAL_BUNDLE } from './m1-19-live-migration-impact.mjs';
import { auditM120SafeStaging } from './m1-20-safe-staging-preflight.mjs';

// Evidence gate ONLY. Inputs are a dated SELECT-only historical observation,
// a disposable PG17 CI catalog capture and an explicitly unapproved checklist.
// Even a supplied "APPROVED" label is an unauthenticated assertion here.
export const REQUIRED_RECOVERY_EVIDENCE_V1 = Object.freeze([
  { id: 'SEYEON_RESTORE_LINEAGE', owner: 'SeYeon Restore Owner / DB Security',
    requirement: 'Approved exact historical 104KB statement custody, 1460-1510 marker lineage, executor/grantor, incident log and decision in #1887' },
  { id: 'NONPRODUCTION_APPROVED_RESTORE', owner: 'DB Operations / Privacy',
    requirement: 'Production-equivalent sanitized or access-controlled nonproduction restore with provenance and permitted data handling' },
  { id: 'HISTORY_AND_CATALOG_PARITY', owner: 'DB Security / Commerce',
    requirement: 'Exact target migration ledger reconciliation and independent M1-18 catalog ACL gate from the same restored baseline' },
  { id: 'MANAGED_OWNER_ROLE_PARITY', owner: 'DB Security',
    requirement: 'Supabase non-superuser executor, owner membership, SECURITY DEFINER and direct/inherited GRANT parity; no stock superuser shortcut' },
  { id: 'INTERRUPTED_REPLAY_AND_DR', owner: 'DB Operations / Incident',
    requirement: 'Approved restore point, tested restore/checksums, nontransactional/partial apply recovery, interrupted replay and owner-reviewed abort criteria' },
  { id: 'OPERATIONAL_RELEASE_AUTHORITY', owner: 'Commerce / DB / Security / Privacy',
    requirement: 'Independent change approval identifying exact target, staged SQL SHA, rollback operator and scope. Reader and refund releases require separate decisions' },
]);

const statuses = new Set(['PENDING', 'EVIDENCE_SUBMITTED_UNVERIFIED', 'CLAIMED_APPROVED_UNVERIFIED']);
function evidenceRow(row) {
  return row && typeof row === 'object' && !Array.isArray(row) &&
    statuses.has(row.status) &&
    Array.isArray(row.evidenceRefs) &&
    row.evidenceRefs.every(x => typeof x === 'string' &&
      x.length >= 8 && x.length <= 400 && !/[\r\n]/u.test(x)) &&
    (row.status === 'PENDING' || row.evidenceRefs.length > 0);
}
function evaluateRows(required, source) {
  return required.map(group => {
    const e = source?.[group.id];
    return Object.freeze({
      id: group.id, owner: group.owner, requirement: group.requirement ?? group.prerequisite,
      status: evidenceRow(e) ? e.status : 'MISSING_OR_MALFORMED_EVIDENCE',
      evidenceRefs: evidenceRow(e) ? e.evidenceRefs : [],
      independentlyVerified: false, // linked or claimed evidence is NOT authenticated here
      eligibleForAutomaticRelease: false,
    });
  });
}
function safeCatalog(c) {
  return c != null && c.fixtureKind === 'SOURCE_TREE_PG17_DISPOSABLE' &&
    Number.isInteger(c.postgresVersionNum) &&
    c.postgresVersionNum >= 170000 && c.postgresVersionNum < 180000 &&
    c.executorIsSuperuser === true &&
    c.migrationLedgerTablePresent === false &&
    c.issuerPresent === true && c.binderPresent === true &&
    c.minimalReadPresent === true &&
    c.onlyApiCanExecuteMinimalRead === true &&
    c.allPrivateWritersClosedToRuntime === true &&
    c.apiSourceSelectDenied === true &&
    c.historicalRestoreBundleReplayed === false &&
    c.liveDataRestored === false &&
    c.sourceReplayCompleted === true &&
    c.managed0860MigrationSkipped === true;
}

export function auditM122NonproductionGate(liveSnapshot, isolate, ownerEvidence,
  directory = 'supabase/migrations') {
  const pre = auditM120SafeStaging(liveSnapshot, directory);
  const sourceValid = pre.verdict === 'HOLD_M1_20_OWNER_STAGING_AND_RESTORE_EVIDENCE_REQUIRED' &&
    pre.reviewedSourceCount === 45 && pre.sourceDrift.length === 0 &&
    pre.unreviewedSourceVersions.length === 0 && pre.unknownPredecessors.length === 0;
  const catalogValid = safeCatalog(isolate);
  const impactGroups = evaluateRows(MIGRATION_IMPACT_GROUPS, ownerEvidence?.domainOwners);
  const recovery = evaluateRows(REQUIRED_RECOVERY_EVIDENCE_V1, ownerEvidence?.recovery);
  const ids = [
    ...MIGRATION_IMPACT_GROUPS.map(x => x.id),
    ...REQUIRED_RECOVERY_EVIDENCE_V1.map(x => x.id),
  ];
  const claimed = [...impactGroups, ...recovery].filter(x =>
    x.status === 'CLAIMED_APPROVED_UNVERIFIED');
  const missing = [...impactGroups, ...recovery].filter(x => x.status === 'PENDING' ||
    x.status === 'MISSING_OR_MALFORMED_EVIDENCE');
  const ownerSchemaValid = ownerEvidence?.scope === 'M1_22_UNVERIFIED_APPROVAL_CLAIMS_ONLY' &&
    ownerEvidence?.releaseAuthorization === false &&
    Object.keys(ownerEvidence?.domainOwners ?? {}).sort().join('|') ===
      MIGRATION_IMPACT_GROUPS.map(x => x.id).sort().join('|') &&
    Object.keys(ownerEvidence?.recovery ?? {}).sort().join('|') ===
      REQUIRED_RECOVERY_EVIDENCE_V1.map(x => x.id).sort().join('|') &&
    ![...impactGroups, ...recovery].some(x => x.status === 'MISSING_OR_MALFORMED_EVIDENCE');

  // The isolate is the checked-in SQL candidate, not the live migration ledger.
  // A successful test of candidate RPCs cannot imply that they exist in live.
  const outcome = !sourceValid ? 'HOLD_M1_22_LIVE_OR_SOURCE_DRIFT'
    : !catalogValid ? 'HOLD_M1_22_ISOLATED_PG17_CATALOG_INCOMPLETE'
    : !ownerSchemaValid ? 'HOLD_M1_22_OWNER_EVIDENCE_SCHEMA_OR_RELEASE_DRIFT'
    : claimed.length > 0 ? 'HOLD_M1_22_UNVERIFIED_APPROVAL_CLAIMS'
    : 'HOLD_M1_22_LIVE_PARITY_RESTORE_AND_OWNERS';

  return Object.freeze({
    verdict: outcome,
    observedLiveAt: liveSnapshot.capturedAt,
    snapshotIsHistoricalNotFresh: true,
    liveVsDisposableIsolate: {
      liveRecordedVersions: pre.basedOnM119 && liveSnapshot.installedVersions.length,
      repositorySourceVersions: pre.reviewedSourceCount + liveSnapshot.installedVersions
        .filter(x => x !== HISTORICAL_BUNDLE.version &&
          !['20261007150457', '20261008043000'].includes(x)).length - 1,
      missingFromLiveVersions: pre.graph.map(x => x.version),
      liveOnlyRestoreVersion: HISTORICAL_BUNDLE.version,
      remoteOnlyOtherLiveVersions: ['20261007150457','20261008043000'],
      historicalStatementContentAvailableInCi: false,
      isolateCatalogCaptured: catalogValid,
      isolateHistoryLedgerPresent: isolate?.migrationLedgerTablePresent ?? null,
      isolateExecutorIsStockSuperuser: isolate?.executorIsSuperuser ?? null,
      isolate0860ManagedPrincipalSkipped: isolate?.managed0860MigrationSkipped ?? null,
      isolationDoesNotEstablishLiveDataOrRoleParity: true,
    },
    releaseEvidence: {
      domainOwners: impactGroups, recovery,
      ownerClaimsRequiringHumanVerification: claimed.map(x => x.id),
      missingOrPendingEvidence: missing.map(x => x.id),
      ownerEvidenceSchemaValid: ownerSchemaValid,
      minimumOwnerDecisionCount: ids.length,
      independentReleaseAttestationPresent: false,
    },
    m121CiTransactionalRollbackIsNotRestoreProof: true,
    historyRepairAuthorized: false,
    safeToApplyMigrations: false,
    privateIssuerAuthorized: false,
    paymentOrRefundAuthorized: false,
    paidReaderAuthorized: false,
    deployAuthorized: false,
  });
}

// Diagnostic CLI: never turns a report into a cutover permit (exit 3 on HOLD).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.length !== 5) {
    console.error('Usage: node m1-22-nonproduction-evidence-gate.mjs <dated-live.json> <disposable-pg17.json> <unverified-owner-evidence.json>');
    process.exitCode = 2;
  } else {
    const [live, pg17, owners] = process.argv.slice(2).map(p =>
      JSON.parse(readFileSync(p, 'utf8')));
    const report = auditM122NonproductionGate(live, pg17, owners);
    const { liveVsDisposableIsolate, releaseEvidence, ...safe } = report;
    console.log(JSON.stringify({
      ...safe,
      liveVsDisposableIsolate,
      releaseEvidence: {
        ...releaseEvidence,
        domainOwners: releaseEvidence.domainOwners.map(({ evidenceRefs, ...row }) => row),
        recovery: releaseEvidence.recovery.map(({ evidenceRefs, ...row }) => row),
      },
    }, null, 2));
    process.exitCode = 3;
  }
}
