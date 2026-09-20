import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1,
  PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1,
} from './build-postgres-privacy-recovery-ledger-manifest.mjs';

export const PRIVACY_RECOVERY_LEDGER_COVERAGE_SCHEMA_V1 =
  'myeongha-postgres-privacy-recovery-ledger-coverage-v1';

function fail(message) {
  throw new Error(`Privacy recovery ledger coverage rejected: ${message}`);
}

function requireRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value;
}

function requireInstant(value, field) {
  if (typeof value !== 'string' || value.length === 0) fail(`${field} must be a timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail(`${field} must be ISO-8601`);
  return { text: new Date(milliseconds).toISOString(), milliseconds };
}

export function validatePrivacyRecoveryLedgerCoverage(summaryInput, incidentReferenceUtc) {
  const summary = requireRecord(summaryInput, 'summary');
  if (summary.schema !== PRIVACY_RECOVERY_LEDGER_SUMMARY_SCHEMA_V1) {
    fail('summary schema is not governed v1');
  }
  if (summary.sourceAuthorityClass !== 'AUTHORITATIVE_CAPTURED_WINDOW_V1') {
    fail('source authority class is not captured-window authority');
  }
  if (summary.authoritativePostBackupSource !== true || summary.candidateSourceAuthority !== false) {
    fail('summary is not an authoritative post-backup source');
  }
  if (
    summary.serviceabilityCoverageRule !==
    'incident_reference_must_not_exceed_authoritative_coverage_through'
  ) {
    fail('serviceability coverage rule drifted');
  }

  const backupCompletedAt = requireInstant(summary.backupCompletedAt, 'backupCompletedAt');
  const coverageThrough = requireInstant(
    summary.authoritativeCoverageThrough,
    'authoritativeCoverageThrough',
  );
  const incident = requireInstant(incidentReferenceUtc, 'incidentReferenceUtc');

  if (coverageThrough.milliseconds < backupCompletedAt.milliseconds) {
    fail('authoritative coverage precedes backup completion');
  }
  if (incident.milliseconds < backupCompletedAt.milliseconds) {
    fail('incident reference precedes governed backup completion');
  }
  if (incident.milliseconds > coverageThrough.milliseconds) {
    fail('incident reference exceeds authoritative ledger coverage');
  }

  return Object.freeze({
    schema: PRIVACY_RECOVERY_LEDGER_COVERAGE_SCHEMA_V1,
    sourceAuthority: PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1,
    sourceAuthorityClass: summary.sourceAuthorityClass,
    backupRunId: summary.backupRunId,
    backupCompletedAt: backupCompletedAt.text,
    authoritativeCoverageThrough: coverageThrough.text,
    incidentReferenceUtc: incident.text,
    coverageStatus: 'covered',
    recoveryServiceabilityGate: 'pass',
    outputContainsIdentifiers: false,
    drReady: false,
  });
}

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(['input', 'incident-reference-at', 'output']);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith('--')) fail(`unexpected CLI argument: ${key ?? ''}`);
    const name = key.slice(2);
    if (!allowed.has(name)) fail(`unsupported CLI argument: ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${key}`);
    values[name] = value;
    index += 1;
  }
  for (const name of allowed) {
    if (!values[name]) fail(`--${name} is required`);
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = JSON.parse(await readFile(args.input, 'utf8'));
  const report = validatePrivacyRecoveryLedgerCoverage(
    summary,
    args['incident-reference-at'],
  );
  await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
