import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeSajuAbuseBaseline, parseSajuAbuseObservationText } from './analyze-saju-abuse-baseline.mjs';
import { analyzeSecurityEventBaseline, parseSecurityEventText } from './analyze-security-event-baseline.mjs';

const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const MAX_CAPTURE_COUNT = 64;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const CANONICAL_EXCLUSIONS = new URL('../docs/operations/SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_V1.json', import.meta.url);

function requireInput(condition) {
  if (!condition) throw new Error('Security baseline capture manifest is invalid.');
}

function timestamp(value) {
  requireInput(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value));
  const time = Date.parse(value);
  requireInput(Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/u, value.includes('.') ? 'Z' : '.000Z'));
  return time;
}

function captureMetadata(capture) {
  requireInput(capture !== null && typeof capture === 'object');
  requireInput(typeof capture.file === 'string' && capture.file.length > 0);
  const from = timestamp(capture.from);
  const to = timestamp(capture.to);
  requireInput(from < to && typeof capture.retentionLimited === 'boolean');
  requireInput(Number.isSafeInteger(capture.recordCount) && capture.recordCount >= 0);
  requireInput(Number.isSafeInteger(capture.recordLimit) && capture.recordLimit > 0 && capture.recordCount <= capture.recordLimit);
  return {
    from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    declaredRecordCount: capture.recordCount, declaredRecordLimit: capture.recordLimit,
    capReached: capture.recordCount === capture.recordLimit,
    retentionLimited: capture.retentionLimited,
  };
}

function queryGaps(captures) {
  const ordered = [...captures].sort((a, b) => Date.parse(a.from) - Date.parse(b.from));
  const gaps = [];
  let end = Date.parse(ordered[0].to);
  for (const capture of ordered.slice(1)) {
    const from = Date.parse(capture.from);
    if (from > end) gaps.push({ from: new Date(end).toISOString(), to: capture.from });
    end = Math.max(end, Date.parse(capture.to));
  }
  return gaps;
}

export function buildSecurityBaselineCapture({ manifest, captures, syntheticExclusions }) {
  requireInput(manifest?.schemaVersion === 'myeongha-security-baseline-capture-input-v1');
  requireInput(Array.isArray(manifest.captures) && manifest.captures.length > 0 && manifest.captures.length <= MAX_CAPTURE_COUNT);
  requireInput(Array.isArray(captures) && captures.length === manifest.captures.length);
  const sajuEvents = [];
  const securityEvents = [];
  let totalBytes = 0;
  const metadata = manifest.captures.map((capture, index) => {
    const meta = captureMetadata(capture);
    const text = captures[index];
    requireInput(typeof text === 'string' && Buffer.byteLength(text) <= MAX_CAPTURE_BYTES);
    totalBytes += Buffer.byteLength(text);
    requireInput(totalBytes <= MAX_TOTAL_BYTES);
    const saju = parseSajuAbuseObservationText(text);
    const security = parseSecurityEventText(text);
    requireInput(capture.recordCount !== 0 || (saju.length === 0 && security.length === 0));
    for (const event of [...saju, ...security]) {
      const time = Date.parse(event.occurredAt ?? event.completedAt);
      requireInput(time >= Date.parse(meta.from) && time < Date.parse(meta.to));
    }
    sajuEvents.push(...saju);
    securityEvents.push(...security);
    return { ...meta, sourceSha256: createHash('sha256').update(text).digest('hex') };
  });
  // Validate exclusions through the existing A06 authority before reusing its identifiers.
  const saju = analyzeSajuAbuseBaseline({
    events: sajuEvents, syntheticExclusions,
    burstWindowSeconds: manifest.burstWindowSeconds ?? null,
  });
  const security = analyzeSecurityEventBaseline({
    events: securityEvents,
    syntheticRequestIds: new Set((syntheticExclusions?.requests ?? []).map((entry) => entry.requestId)),
  });
  return {
    schemaVersion: 'myeongha-security-baseline-capture-report-v1',
    mode: 'evidence_only',
    captures: metadata,
    collectionQuality: {
      queryGaps: queryGaps(metadata),
      capReached: metadata.some((capture) => capture.capReached),
      retentionLimited: metadata.some((capture) => capture.retentionLimited),
      providerBoundsIndependentlyVerified: false,
      completePopulationProven: false,
      note: 'Declared query intervals do not prove log delivery, filter coverage, retention completeness, or zero demand.',
    },
    saju, security,
    decision: {
      numericAdmissionPolicy: 'HOLD', securityAlertThreshold: 'HOLD',
      enforcementAuthorized: false, providerMutationAuthorized: false, issueClosureAllowed: false,
    },
  };
}

async function boundedRead(path, maxBytes = MAX_CAPTURE_BYTES) {
  requireInput((await stat(path)).size <= maxBytes);
  const value = await readFile(path, 'utf8');
  requireInput(Buffer.byteLength(value) <= maxBytes);
  return value.replace(/^\uFEFF/u, '');
}

export async function collectSecurityBaseline(manifestPath) {
  const manifest = JSON.parse(await boundedRead(manifestPath, 1024 * 1024));
  requireInput(Array.isArray(manifest?.captures) && manifest.captures.length > 0 && manifest.captures.length <= MAX_CAPTURE_COUNT);
  const captures = [];
  let totalBytes = 0;
  // Sequential bounded reads avoid multiplying peak input memory by parallel file reads.
  for (const capture of manifest.captures) {
    captureMetadata(capture);
    const text = await boundedRead(resolve(dirname(manifestPath), capture.file));
    totalBytes += Buffer.byteLength(text);
    requireInput(totalBytes <= MAX_TOTAL_BYTES);
    captures.push(text);
  }
  const canonical = JSON.parse(await boundedRead(CANONICAL_EXCLUSIONS));
  let syntheticExclusions = canonical;
  if (manifest.additionalSyntheticFile !== undefined) {
    requireInput(typeof manifest.additionalSyntheticFile === 'string' && manifest.additionalSyntheticFile.length > 0);
    const additional = JSON.parse(await boundedRead(resolve(dirname(manifestPath), manifest.additionalSyntheticFile)));
    requireInput(additional?.schemaVersion === canonical.schemaVersion && Array.isArray(additional.requests));
    syntheticExclusions = { ...canonical, requests: [...canonical.requests, ...additional.requests] };
  }
  return buildSecurityBaselineCapture({ manifest, captures, syntheticExclusions });
}

async function main(args) {
  requireInput(args.length === 1 || (args.length === 3 && args[1] === '--output'));
  const report = await collectSecurityBaseline(resolve(args[0]));
  const output = JSON.stringify(report, null, 2) + '\n';
  if (args.length === 3) {
    // Never overwrite an earlier capture; raw logs and identifiers are not persisted.
    await writeFile(resolve(args[2]), output, { flag: 'wx', mode: 0o600 });
  } else process.stdout.write(output);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(process.argv.slice(2)); }
  catch {
    process.stderr.write('SECURITY_BASELINE_INPUT_REJECTED: check manifest, log format, bounds, exclusions and output destination.\n');
    process.exitCode = 1;
  }
}
