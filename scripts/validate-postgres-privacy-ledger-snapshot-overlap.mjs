import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildPrivacyReconciliationPlan } from './build-postgres-privacy-reconciliation-plan.mjs';
import { PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1 } from './build-postgres-privacy-recovery-ledger-manifest.mjs';

export const PRIVACY_LEDGER_SNAPSHOT_OVERLAP_SCHEMA_V1 =
  'myeongha-postgres-privacy-ledger-snapshot-overlap-v1';

function reject(reason) {
  // Do not include private source events, identifiers, or database values in errors.
  throw new Error('Privacy ledger snapshot overlap rejected: ' + reason);
}

function instant(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) {
    reject(label + ' must be a canonical UTC timestamp');
  }
  return Date.parse(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function rows(manifest) {
  return manifest.events.map(({ eventId, sequence, ...event }) => event)
    .sort((a, b) =>
      Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
      stableJson(a).localeCompare(stableJson(b)));
}

function verifyManifest(manifest, label) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    reject(label + ' manifest must be an object');
  }
  if (manifest.sourceAuthority !== PRIVACY_RECOVERY_LEDGER_SOURCE_AUTHORITY_V1) {
    reject(label + ' authority does not match governed source');
  }
  if (!Number.isSafeInteger(manifest.backupRunId) || manifest.backupRunId <= 0) {
    reject(label + ' backup run identity invalid');
  }
  const backupTime = instant(manifest.backupCompletedAt, label + ' backupCompletedAt');
  const captureTime = instant(manifest.incidentReferenceUtc, label + ' capturedAt');
  if (captureTime < backupTime) reject(label + ' capture precedes backup');
  try {
    buildPrivacyReconciliationPlan(manifest);
  } catch {
    reject(label + ' source manifest failed the governed reconciliation contract');
  }
  const events = rows(manifest);
  const actualDigest = 'sha256:' + createHash('sha256')
    .update(stableJson(events)).digest('hex');
  if (actualDigest !== manifest.sourceDigest) {
    reject(label + ' source digest differs from the plaintext event set');
  }
  return { backupTime, captureTime, events };
}

export function validatePrivacyLedgerSnapshotOverlap(previous, current) {
  const prior = verifyManifest(previous, 'previous');
  const next = verifyManifest(current, 'current');
  if (next.captureTime <= prior.captureTime) {
    reject('current capturedAt must advance beyond previous capturedAt');
  }
  if (next.backupTime < prior.backupTime) {
    reject('current backup cutoff moved backward');
  }
  if (current.backupRunId === previous.backupRunId &&
      next.backupTime !== prior.backupTime) {
    reject('one backup run has conflicting completion timestamps');
  }
  if (current.backupRunId !== previous.backupRunId &&
      next.backupTime === prior.backupTime) {
    reject('different backup runs share a completion cutoff');
  }

  const retained = prior.events.filter(event =>
    Date.parse(event.occurredAt) > next.backupTime);
  const observed = new Map();
  for (const event of next.events) {
    const key = stableJson(event);
    observed.set(key, (observed.get(key) ?? 0) + 1);
  }
  for (const event of retained) {
    const key = stableJson(event);
    const count = observed.get(key) ?? 0;
    if (count === 0) {
      reject('previously captured post-backup privacy event absent in next snapshot');
    }
    observed.set(key, count - 1);
  }

  // A newer backup can bridge timestamp windows but its own restored privacy
  // state is not independently proven by this snapshot comparison.
  const overlaps = next.backupTime < prior.captureTime;
  const intervalMs = next.captureTime - prior.captureTime;
  if (intervalMs % 1000 !== 0 || !Number.isSafeInteger(intervalMs / 1000)) {
    reject('capture interval must be an exact nonnegative number of seconds');
  }
  // This measures successive snapshot *capture instants*, NOT completeness
  // of events produced between them or an approved RPO threshold.
  const captureIntervalSeconds = intervalMs / 1000;
  const nominalScheduledIntervalSeconds = 3600;
  const captureIntervalBeyondNominalSeconds = Math.max(
    0, captureIntervalSeconds - nominalScheduledIntervalSeconds,
  );
  const result = {
    schema: PRIVACY_LEDGER_SNAPSHOT_OVERLAP_SCHEMA_V1,
    previousBackupRunId: previous.backupRunId,
    currentBackupRunId: current.backupRunId,
    previousCapturedAt: previous.incidentReferenceUtc,
    currentCapturedAt: current.incidentReferenceUtc,
    currentBackupCompletedAt: current.backupCompletedAt,
    previousEventCount: prior.events.length,
    currentEventCount: next.events.length,
    overlapEventCount: retained.length,
    captureIntervalSeconds,
    nominalScheduledIntervalSeconds,
    captureIntervalBeyondNominalSeconds,
    continuousCaptureProven: false,
    snapshotOverlapStatus: overlaps
      ? 'OVERLAPPING_CAPTURED_EVENTS_PRESERVED'
      : 'BACKUP_ADVANCED_WITHOUT_OVERLAP_PROOF',
    sourceContinuityProven: false,
    futureSafePrivacyReconciliation: false,
    drReady: false,
    outputContainsIdentifiers: false,
  };
  return Object.freeze(result);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 6 ||
      args[0] !== '--previous' || args[2] !== '--current' ||
      args[4] !== '--report') {
    reject('expected --previous <manifest> --current <manifest> --report <path>');
  }
  const previous = JSON.parse(await readFile(args[1], 'utf8'));
  const current = JSON.parse(await readFile(args[3], 'utf8'));
  const result = validatePrivacyLedgerSnapshotOverlap(previous, current);
  await writeFile(args[5], JSON.stringify(result, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();
