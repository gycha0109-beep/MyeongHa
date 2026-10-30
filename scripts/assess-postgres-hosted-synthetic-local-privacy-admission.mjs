import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePrivacyRecoveryLedgerCoverage } from './validate-postgres-privacy-recovery-ledger-coverage.mjs';

export const LOCAL_DR_PRIVACY_GATE_SCHEMA = 'myeongha-local-auth-storage-privacy-admission-v1';
const LOCAL_REPORT_SCHEMA = 'myeongha-dr-synthetic-local-postdelete-v1';

function reject(reason) {
  throw new Error('HOLD_LOCAL_DR_PRIVACY_ADMISSION: ' + reason);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assessSyntheticLocalRecoveryPrivacyAdmission({
  localPostdeleteReport,
  ledgerSummary,
  incidentReferenceUtc,
}) {
  if (!record(localPostdeleteReport) || localPostdeleteReport.schema !== LOCAL_REPORT_SCHEMA ||
      localPostdeleteReport.target !== 'local-loopback-synthetic-only') {
    reject('missing exact Docker-local post-deletion report');
  }
  for (const key of [
    'syntheticPrivateObjectBeforeDeletion',
    'syntheticDeletion',
    'newLoginDenied',
    'refreshAfterDeletionDenied',
    'revocationBeforeDeletionStorageDenied',
    'staleAccessTokenStorageDenied',
  ]) {
    if (localPostdeleteReport[key] !== 'PASS') {
      reject('local revocation prerequisite failed: ' + key);
    }
  }
  if (localPostdeleteReport.revocationAppliedBeforeDeletion !== true ||
      localPostdeleteReport.localRevocationMarkerApplied !== true ||
      localPostdeleteReport.independentPrivacyContinuityProven !== false ||
      localPostdeleteReport.hostedProviderRecoveryProven !== false ||
      localPostdeleteReport.providerManagedDataFullRestore !== false ||
      localPostdeleteReport.futureSafePrivacyReconciliation !== false ||
      localPostdeleteReport.drReady !== false ||
      localPostdeleteReport.gate !== 'BLOCKED' ||
      localPostdeleteReport.serviceResumptionAllowed !== false ||
      localPostdeleteReport.outputContainsIdentifiers !== false) {
    reject('local report tries to promote Hosted/privacy/DR readiness');
  }
  if (!record(ledgerSummary)) reject('missing independent captured-window ledger summary');
  // Existing authority contract pins coverage to the exact ledger capture.
  // A metadata-only PASS is never proof of an authentic decrypted source artifact.
  const coverage = validatePrivacyRecoveryLedgerCoverage(
    ledgerSummary, incidentReferenceUtc,
  );
  if (coverage.coverageStatus !== 'covered' ||
      coverage.recoveryServiceabilityGate !== 'pass') {
    reject('captured-window coverage not accepted');
  }
  return Object.freeze({
    schema: LOCAL_DR_PRIVACY_GATE_SCHEMA,
    target: 'local-loopback-synthetic-only',
    localPostdeleteAcceptance: 'PASS',
    capturedWindowMetadataValidation: 'PASS',
    capturedWindowAuthorityOnly: true,
    independentSourceArtifactAuthenticated: false,
    independentPrivacyContinuityProven: false,
    providerManagedDataFullRestore: false,
    hostedProviderRecoveryProven: false,
    futureSafePrivacyReconciliation: false,
    s8ServingE2eProven: false,
    wholeServiceRpoRtoProven: false,
    drReady: false,
    gate: 'BLOCKED',
    serviceResumptionAllowed: false,
    outputContainsIdentifiers: false,
  });
}

function args(argv) {
  const params = {};
  const allowed = new Set(['local-postdelete', 'ledger-summary', 'incident-reference-at']);
  for (let i = 0; i < argv.length; i += 2) {
    const arg = argv[i];
    if (typeof arg !== 'string' || !arg.startsWith('--') ||
        !allowed.has(arg.slice(2)) || !argv[i + 1] ||
        argv[i + 1].startsWith('--') || params[arg.slice(2)]) {
      reject('invalid CLI arguments');
    }
    params[arg.slice(2)] = argv[i + 1];
  }
  if (Object.keys(params).length !== allowed.size) reject('missing CLI arguments');
  return params;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const cli = args(process.argv.slice(2));
    const [postdelete, ledger] = await Promise.all([
      readFile(cli['local-postdelete'], 'utf8'),
      readFile(cli['ledger-summary'], 'utf8'),
    ]);
    const result = assessSyntheticLocalRecoveryPrivacyAdmission({
      localPostdeleteReport: JSON.parse(postdelete),
      ledgerSummary: JSON.parse(ledger),
      incidentReferenceUtc: cli['incident-reference-at'],
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error
      ? error.message.replaceAll(/(?:[a-f0-9]{8}-){4}[a-f0-9]{12}/giu, '[redacted]')
      : 'HOLD_LOCAL_DR_PRIVACY_ADMISSION');
    process.exitCode = 1;
  }
}
