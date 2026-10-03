import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SAJU_ABUSE_BASELINE_REPORT_SCHEMA_V1 =
  'myeongha-saju-abuse-baseline-report-v1';
export const SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_SCHEMA_V1 =
  'myeongha-saju-abuse-synthetic-exclusions-v1';

const PREFIX = 'MYEONGHA_SAJU_ABUSE_OBSERVATION ';
const ADMISSION_SCHEMA = 'myeongha-saju-abuse-observation-v1';
const OUTCOME_SCHEMA = 'myeongha-saju-abuse-outcome-v1';
const CLIENT_KEY_VERSION = 'myeongha-saju-abuse-client-hmac-sha256-v1';
const ROUTES = new Set([
  'api.me.saju.calculation',
  'api.me.saju.preview-reading',
]);
const SUBJECT_KINDS = new Set(['member', 'guest']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const CLIENT_KEY_PATTERN = /^[a-f0-9]{64}$/u;

function fail(message) {
  throw new Error('Saju abuse baseline analysis rejected: ' + message);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(name + ' is invalid');
  return value;
}

function requireRequestId(value) {
  requireString('requestId', value);
  if (!REQUEST_ID_PATTERN.test(value)) fail('requestId is invalid');
  return value;
}

function requireTimestamp(name, value) {
  requireString(name, value);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(name + ' is invalid');
  return new Date(parsed).toISOString();
}

function requireRoute(value) {
  if (!ROUTES.has(value)) fail('routeId is unsupported');
  return value;
}

function requireMode(value) {
  if (value !== 'observe_only') fail('mode must be observe_only');
}

function normalizeEvent(value) {
  if (!isRecord(value)) fail('event must be an object');

  if (value.schemaVersion === ADMISSION_SCHEMA) {
    requireMode(value.mode);
    const routeId = requireRoute(value.routeId);
    const requestId = requireRequestId(value.requestId);
    if (!SUBJECT_KINDS.has(value.subjectKind)) fail('subjectKind is unsupported');
    if (value.clientKeyVersion !== CLIENT_KEY_VERSION) fail('clientKeyVersion is unsupported');
    if (typeof value.clientKey !== 'string' || !CLIENT_KEY_PATTERN.test(value.clientKey)) {
      fail('clientKey is invalid');
    }
    return Object.freeze({
      schemaVersion: ADMISSION_SCHEMA,
      mode: 'observe_only',
      routeId,
      subjectKind: value.subjectKind,
      clientKeyVersion: CLIENT_KEY_VERSION,
      clientKey: value.clientKey,
      requestId,
      occurredAt: requireTimestamp('occurredAt', value.occurredAt),
    });
  }

  if (value.schemaVersion === OUTCOME_SCHEMA) {
    requireMode(value.mode);
    const routeId = requireRoute(value.routeId);
    const requestId = requireRequestId(value.requestId);
    if (!Number.isSafeInteger(value.httpStatus) || value.httpStatus < 100 || value.httpStatus > 599) {
      fail('httpStatus is invalid');
    }
    return Object.freeze({
      schemaVersion: OUTCOME_SCHEMA,
      mode: 'observe_only',
      routeId,
      requestId,
      httpStatus: value.httpStatus,
      completedAt: requireTimestamp('completedAt', value.completedAt),
    });
  }

  fail('unsupported schemaVersion');
}

function parseMessage(message) {
  if (typeof message !== 'string') return [];
  const events = [];
  for (const line of message.split(/\r?\n/u)) {
    const index = line.indexOf(PREFIX);
    if (index < 0) continue;
    const payload = line.slice(index + PREFIX.length).trim();
    if (payload.length === 0) continue;
    try {
      events.push(normalizeEvent(JSON.parse(payload)));
    } catch (error) {
      fail('invalid observation payload: ' + error.message);
    }
  }
  return events;
}

function collectEvents(value, target) {
  if (Array.isArray(value)) {
    for (const item of value) collectEvents(item, target);
    return;
  }
  if (!isRecord(value)) return;

  if (value.schemaVersion === ADMISSION_SCHEMA || value.schemaVersion === OUTCOME_SCHEMA) {
    target.push(normalizeEvent(value));
    return;
  }

  if (typeof value.message === 'string') {
    target.push(...parseMessage(value.message));
  }
  if (typeof value.text === 'string') {
    target.push(...parseMessage(value.text));
  }
}

export function parseSajuAbuseObservationText(text) {
  if (typeof text !== 'string') fail('input text must be a string');
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  let parsedJson;
  let parsedAsJson = false;
  try {
    parsedJson = JSON.parse(trimmed);
    parsedAsJson = true;
  } catch {
    parsedAsJson = false;
  }

  if (parsedAsJson) {
    const events = [];
    collectEvents(parsedJson, events);
    return events;
  }

  return parseMessage(text);
}

function canonicalEvent(event) {
  return JSON.stringify(event);
}

function deduplicateEvents(events) {
  const byKey = new Map();
  let exactDuplicateCount = 0;

  for (const rawEvent of events) {
    const event = normalizeEvent(rawEvent);
    const key = event.schemaVersion + '|' + event.requestId;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, event);
      continue;
    }
    if (canonicalEvent(existing) === canonicalEvent(event)) {
      exactDuplicateCount += 1;
      continue;
    }
    fail('conflicting duplicate event for ' + key);
  }

  return {
    events: [...byKey.values()],
    exactDuplicateCount,
  };
}

function sortedObject(entries) {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => String(left).localeCompare(String(right))),
  );
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function histogram(values) {
  const counts = new Map();
  for (const value of values) increment(counts, String(value));
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => Number(left) - Number(right)),
  );
}

function statusClass(status) {
  return Math.floor(status / 100) + 'xx';
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function intervalStats(values) {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: null,
      medianMs: null,
      maxMs: null,
    };
  }
  return {
    count: values.length,
    minMs: Math.min(...values),
    medianMs: median(values),
    maxMs: Math.max(...values),
  };
}

function maxWithinWindow(times, windowMs) {
  let left = 0;
  let max = 0;
  for (let right = 0; right < times.length; right += 1) {
    while (times[right] - times[left] > windowMs) left += 1;
    max = Math.max(max, right - left + 1);
  }
  return max;
}

function buildBurstEvidence(admissions, burstWindowSeconds) {
  if (burstWindowSeconds === null || burstWindowSeconds === undefined) {
    return {
      burstWindowSeconds: null,
      maxAuthenticatedAttemptsBySingleClient: null,
      perClientBurstMaxHistogram: null,
      note: 'No burst window was supplied; no burst threshold was inferred.',
    };
  }
  if (!Number.isSafeInteger(burstWindowSeconds) || burstWindowSeconds <= 0) {
    fail('burstWindowSeconds must be a positive integer when supplied');
  }

  const byClient = new Map();
  for (const admission of admissions) {
    const list = byClient.get(admission.clientKey) ?? [];
    list.push(Date.parse(admission.occurredAt));
    byClient.set(admission.clientKey, list);
  }

  const perClientMax = [];
  const windowMs = burstWindowSeconds * 1000;
  for (const times of byClient.values()) {
    times.sort((a, b) => a - b);
    perClientMax.push(maxWithinWindow(times, windowMs));
  }

  return {
    burstWindowSeconds,
    maxAuthenticatedAttemptsBySingleClient:
      perClientMax.length === 0 ? 0 : Math.max(...perClientMax),
    perClientBurstMaxHistogram: histogram(perClientMax),
    note: 'Evidence only; this analysis does not choose a production rate limit.',
  };
}

function observationWindow(admissions) {
  if (admissions.length === 0) {
    return {
      firstAuthenticatedAttemptAt: null,
      lastAuthenticatedAttemptAt: null,
    };
  }
  const times = admissions.map((event) => Date.parse(event.occurredAt)).sort((a, b) => a - b);
  return {
    firstAuthenticatedAttemptAt: new Date(times[0]).toISOString(),
    lastAuthenticatedAttemptAt: new Date(times[times.length - 1]).toISOString(),
  };
}

function parseSyntheticExclusions(value) {
  if (value === null || value === undefined) return new Set();
  if (!isRecord(value)) fail('synthetic exclusions must be an object');
  if (value.schemaVersion !== SAJU_ABUSE_SYNTHETIC_EXCLUSIONS_SCHEMA_V1) {
    fail('synthetic exclusions schemaVersion mismatch');
  }
  if (!Array.isArray(value.requests)) fail('synthetic exclusions requests must be an array');

  const ids = new Set();
  for (const entry of value.requests) {
    if (!isRecord(entry)) fail('synthetic exclusion entry must be an object');
    const requestId = requireRequestId(entry.requestId);
    requireString('synthetic exclusion reason', entry.reason);
    requireString('synthetic exclusion evidenceRef', entry.evidenceRef);
    if (ids.has(requestId)) fail('duplicate synthetic exclusion requestId: ' + requestId);
    ids.add(requestId);
  }
  return ids;
}

export function analyzeSajuAbuseBaseline(input) {
  const deduped = deduplicateEvents(input.events ?? []);
  const syntheticRequestIds =
    input.syntheticRequestIds instanceof Set
      ? input.syntheticRequestIds
      : parseSyntheticExclusions(input.syntheticExclusions);

  const observedSyntheticRequestIds = new Set(
    deduped.events
      .filter((event) => syntheticRequestIds.has(event.requestId))
      .map((event) => event.requestId),
  );
  const included = deduped.events.filter((event) => !syntheticRequestIds.has(event.requestId));
  const excludedEventCount = deduped.events.length - included.length;

  const admissions = included.filter((event) => event.schemaVersion === ADMISSION_SCHEMA);
  const outcomes = included.filter((event) => event.schemaVersion === OUTCOME_SCHEMA);

  const admissionByRequest = new Map(admissions.map((event) => [event.requestId, event]));
  const outcomeByRequest = new Map(outcomes.map((event) => [event.requestId, event]));

  for (const [requestId, admission] of admissionByRequest) {
    const outcome = outcomeByRequest.get(requestId);
    if (outcome !== undefined && outcome.routeId !== admission.routeId) {
      fail('route mismatch for correlated requestId: ' + requestId);
    }
  }

  const matchedPairs = [];
  const unmatchedAdmissions = [];
  for (const admission of admissions) {
    const outcome = outcomeByRequest.get(admission.requestId);
    if (outcome === undefined) unmatchedAdmissions.push(admission);
    else matchedPairs.push({ admission, outcome });
  }
  const orphanOutcomes = outcomes.filter((event) => !admissionByRequest.has(event.requestId));

  const subjectKindDistribution = new Map();
  const routeDistribution = new Map();
  const clientCounts = new Map();
  for (const admission of admissions) {
    increment(subjectKindDistribution, admission.subjectKind);
    increment(routeDistribution, admission.routeId);
    increment(clientCounts, admission.clientKey);
  }

  const statusCodeDistribution = new Map();
  const statusClassDistribution = new Map();
  for (const pair of matchedPairs) {
    increment(statusCodeDistribution, String(pair.outcome.httpStatus));
    increment(statusClassDistribution, statusClass(pair.outcome.httpStatus));
  }

  const admissionsByClient = new Map();
  for (const admission of admissions) {
    const list = admissionsByClient.get(admission.clientKey) ?? [];
    list.push(admission);
    admissionsByClient.set(admission.clientKey, list);
  }
  for (const list of admissionsByClient.values()) {
    list.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  }

  const repeatAfterFailureIntervals = [];
  let matchedFailureOutcomeCount = 0;
  let failureFollowedByLaterAttemptCount = 0;
  for (const pair of matchedPairs) {
    if (pair.outcome.httpStatus < 400) continue;
    matchedFailureOutcomeCount += 1;
    const completedAt = Date.parse(pair.outcome.completedAt);
    const later = (admissionsByClient.get(pair.admission.clientKey) ?? []).find(
      (candidate) => Date.parse(candidate.occurredAt) > completedAt,
    );
    if (later !== undefined) {
      failureFollowedByLaterAttemptCount += 1;
      repeatAfterFailureIntervals.push(Date.parse(later.occurredAt) - completedAt);
    }
  }

  return Object.freeze({
    schemaVersion: SAJU_ABUSE_BASELINE_REPORT_SCHEMA_V1,
    mode: 'evidence_only',
    observationWindow: {
      ...observationWindow(admissions),
      retentionNote:
        typeof input.retentionNote === 'string' && input.retentionNote.trim().length > 0
          ? input.retentionNote.trim()
          : null,
    },
    inputQuality: {
      parsedEventCount: deduped.events.length,
      exactDuplicateEventCount: deduped.exactDuplicateCount,
      configuredSyntheticRequestCount: syntheticRequestIds.size,
      syntheticExcludedRequestCount: observedSyntheticRequestIds.size,
      syntheticExcludedEventCount: excludedEventCount,
      unmatchedAuthenticatedAdmissionCount: unmatchedAdmissions.length,
      orphanOutcomeCount: orphanOutcomes.length,
    },
    authenticatedAttempts: {
      total: admissions.length,
      uniquePseudonymousClients: clientCounts.size,
      subjectKindDistribution: sortedObject(subjectKindDistribution.entries()),
      routeDistribution: sortedObject(routeDistribution.entries()),
      perClientRequestCountHistogram: histogram([...clientCounts.values()]),
    },
    correlatedOutcomes: {
      matched: matchedPairs.length,
      coverageRatio:
        admissions.length === 0
          ? null
          : Number((matchedPairs.length / admissions.length).toFixed(6)),
      statusCodeDistribution: sortedObject(statusCodeDistribution.entries()),
      statusClassDistribution: sortedObject(statusClassDistribution.entries()),
      matchedFailureOutcomeCount,
      failureFollowedByLaterAttemptCount,
      failureFollowedByLaterAttemptIntervalMs: intervalStats(repeatAfterFailureIntervals),
    },
    burstEvidence: buildBurstEvidence(admissions, input.burstWindowSeconds ?? null),
    policyDecision: {
      produced: false,
      numericLimit: null,
      windowSeconds: null,
      enforcementAuthorized: false,
      note: 'Baseline evidence does not automatically choose or authorize an admission policy.',
    },
  });
}

function parseCli(args) {
  if (args.length === 0) {
    fail('usage: node scripts/analyze-saju-abuse-baseline.mjs <log-file> [--synthetic-file path] [--burst-window-seconds N] [--retention-note text]');
  }
  const options = {
    logFile: args[0],
    syntheticFile: null,
    burstWindowSeconds: null,
    retentionNote: null,
  };
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === '--synthetic-file') {
      if (value === undefined) fail('--synthetic-file requires a value');
      options.syntheticFile = value;
      index += 1;
      continue;
    }
    if (flag === '--burst-window-seconds') {
      if (value === undefined || !/^[1-9][0-9]*$/u.test(value)) {
        fail('--burst-window-seconds requires a positive integer');
      }
      options.burstWindowSeconds = Number(value);
      index += 1;
      continue;
    }
    if (flag === '--retention-note') {
      if (value === undefined || value.trim().length === 0) {
        fail('--retention-note requires a non-empty value');
      }
      options.retentionNote = value;
      index += 1;
      continue;
    }
    fail('unknown argument: ' + flag);
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const logText = await readFile(options.logFile, 'utf8');
  const events = parseSajuAbuseObservationText(logText);
  const syntheticExclusions =
    options.syntheticFile === null
      ? null
      : JSON.parse(await readFile(options.syntheticFile, 'utf8'));
  const report = analyzeSajuAbuseBaseline({
    events,
    syntheticExclusions,
    burstWindowSeconds: options.burstWindowSeconds,
    retentionNote: options.retentionNote,
  });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
