import { parseRuntimeLogEvents } from './lib/runtime-log-events.mjs';

const SCHEMA = 'myeongha-security-event-v1';
const KEY = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function reject() { throw new Error('Security baseline event is invalid.'); }

function normalize(event) {
  const { status, eventCode } = event;
  const denied = (status === 401 || status === 403) && eventCode === 'ACCESS_DENIED';
  const limited = status === 429 && eventCode === 'RATE_LIMITED';
  const failed = Number.isInteger(status) && status >= 500 && status <= 599 &&
    (eventCode === 'SERVER_FAILURE' || (status === 500 && eventCode === 'UNEXPECTED_EXCEPTION'));
  const expectedSeverity = failed ? 'error' : 'warning';
  const expectedOwasp = failed ? ['A09:2025', 'A10:2025'] : ['A09:2025'];
  if (event.schemaVersion !== SCHEMA || !(denied || limited || failed) ||
      typeof event.routeId !== 'string' || !KEY.test(event.routeId) ||
      typeof event.method !== 'string' || !/^[A-Z]{1,16}$/u.test(event.method) ||
      typeof event.requestId !== 'string' || !REQUEST.test(event.requestId) ||
      typeof event.occurredAt !== 'string' || !Number.isFinite(Date.parse(event.occurredAt)) ||
      !Number.isInteger(event.durationMs) || event.durationMs < 0 || event.durationMs > 3_600_000 ||
      event.severity !== expectedSeverity || JSON.stringify(event.owasp) !== JSON.stringify(expectedOwasp)) reject();
  // Project only emitter-owned fields. Provider envelopes and extra payload never escape.
  return {
    schemaVersion: SCHEMA, eventCode, severity: expectedSeverity, owasp: expectedOwasp,
    routeId: event.routeId, method: event.method, status, requestId: event.requestId,
    occurredAt: new Date(event.occurredAt).toISOString(), durationMs: event.durationMs,
  };
}

export function parseSecurityEventText(text) {
  return parseRuntimeLogEvents(text, {
    prefix: 'MYEONGHA_SECURITY_EVENT ', schemas: [SCHEMA],
  }).map(normalize);
}

function distribution(events, field) {
  const counts = new Map();
  for (const event of events) counts.set(String(event[field]), (counts.get(String(event[field])) ?? 0) + 1);
  return Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

export function analyzeSecurityEventBaseline({ events, syntheticRequestIds = new Set() }) {
  const unique = new Map();
  let exactDuplicateEventCount = 0;
  for (const raw of events) {
    const event = normalize(raw);
    // A dispatcher and its inner handler can both observe one request. Keep both routes.
    // The Node send boundary can emit SERVER_FAILURE followed by UNEXPECTED_EXCEPTION.
    const key = JSON.stringify([event.routeId, event.requestId, event.eventCode]);
    const prior = unique.get(key);
    if (prior !== undefined) {
      if (JSON.stringify(prior) !== JSON.stringify(event)) {
        throw new Error('Security baseline contains conflicting duplicate events.');
      }
      exactDuplicateEventCount += 1;
    } else unique.set(key, event);
  }
  const included = [...unique.values()].filter((event) => !syntheticRequestIds.has(event.requestId));
  const summarize = (items) => ({
    totalEvents: items.length,
    statusDistribution: distribution(items, 'status'),
    routeDistribution: distribution(items, 'routeId'),
    methodDistribution: distribution(items, 'method'),
  });
  return {
    schemaVersion: 'myeongha-security-event-baseline-report-v1',
    mode: 'evidence_only',
    inputQuality: {
      parsedEventCount: unique.size, exactDuplicateEventCount,
      syntheticExcludedEventCount: unique.size - included.length,
      population: 'non-excluded-events; unregistered synthetic traffic may remain',
    },
    ...summarize(included),
    byEventCode: Object.fromEntries(
      ['ACCESS_DENIED', 'RATE_LIMITED', 'SERVER_FAILURE', 'UNEXPECTED_EXCEPTION']
        .map((code) => [code, summarize(included.filter((event) => event.eventCode === code))]),
    ),
    // Counts are events, not request/error rates: successful requests are absent from this stream.
    policyDecision: { produced: false, fixedThreshold: null, providerMutationAuthorized: false },
  };
}
