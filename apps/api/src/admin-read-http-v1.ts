import { randomUUID } from 'node:crypto';
import { readAdminAnalyticsEvidenceV1 } from './admin-analytics-read-v1.js';
import type { AdminAuthPortV1 } from './admin-auth-v1.js';
import {
  ADMIN_READ_KINDS_V1,
  projectAdminRowsV1,
  type AdminListFiltersV1,
  type AdminReadKindV1,
  type AdminReadPortV1,
} from './admin-read-contract-v1.js';

export type AdminAuditOutcomeV1 = 'allowed' | 'denied' | 'failed';

export interface AdminAuditEventV1 {
  readonly requestId: string;
  readonly actorAuthUserId: string | null;
  readonly targetRef?: string | null;
  readonly action: string;
  readonly outcome: AdminAuditOutcomeV1;
  readonly at: string;
}

export interface AdminAuditPortV1 {
  append(event: AdminAuditEventV1): Promise<void>;
}

export interface AdminReadHttpDependenciesV1 {
  readonly auth: AdminAuthPortV1;
  readonly reads: AdminReadPortV1;
  readonly audit: AdminAuditPortV1;
  readonly now?: () => Date;
  readonly requestId?: () => string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PATH_PREFIX = '/api/admin/';
const ROUTES: Readonly<Record<string, AdminReadKindV1>> = {
  overview: 'overview',
  users: 'users',
  commerce: 'commerce',
  'commerce-alerts': 'commerce-alerts',
  credits: 'credits',
  entitlements: 'entitlements',
  'provider-events': 'provider-events',
  'entitlement-events': 'entitlement-events',
  'credit-reservations': 'credit-reservations',
  'credit-allocations': 'credit-allocations',
  readings: 'readings',
  'ai-costs': 'ai-costs',
  'ai-errors': 'ai-errors',
  'ai-estimates': 'ai-estimates',
  catalog: 'catalog',
  characters: 'characters',
  'content-releases': 'content-releases',
  'deletion-jobs': 'deletion-jobs',
  analytics: 'analytics',
  issues: 'issues',
  audit: 'audit',
};

function response(status: number, requestId: string, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      'Vary': 'Authorization',
    },
  });
}

function readDate(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid administrator read date.');
  }
  return value;
}

export function parseAdminReadFiltersV1(url: URL): AdminListFiltersV1 {
  const fragments = url.pathname.slice(PATH_PREFIX.length).split('/');
  let kind: AdminReadKindV1;
  let subjectId: string | null = null;
  let recordId: string | null = null;
  if (fragments.length === 2 && fragments[0] === 'users' &&
    typeof fragments[1] === 'string' && UUID.test(fragments[1])) {
    kind = 'user-detail';
    subjectId = fragments[1].toLowerCase();
  } else if (fragments.length === 3 && fragments[0] === 'readings' && fragments[2] === 'ai-usage' &&
    typeof fragments[1] === 'string' && UUID.test(fragments[1])) {
    kind = 'reading-ai-usage';
    recordId = fragments[1].toLowerCase();
  } else if (fragments.length === 3 && fragments[0] === 'readings' && fragments[2] === 'attempts' &&
    typeof fragments[1] === 'string' && UUID.test(fragments[1])) {
    kind = 'reading-attempts';
    recordId = fragments[1].toLowerCase();
  } else if (fragments.length === 2 && fragments[0] === 'readings' &&
    typeof fragments[1] === 'string' && UUID.test(fragments[1])) {
    kind = 'reading-detail';
    recordId = fragments[1].toLowerCase();
  } else if (fragments.length === 2 && fragments[0] === 'commerce' &&
    typeof fragments[1] === 'string' && UUID.test(fragments[1])) {
    kind = 'commerce-detail';
    recordId = fragments[1].toLowerCase();
  } else if (fragments.length === 1 &&
    Object.hasOwn(ROUTES, fragments[0] ?? '')) {
    kind = ROUTES[fragments[0] ?? '']!;
  } else {
    throw new Error('Unknown administrator read route.');
  }

  const allowed = new Set(['limit', 'cursor', 'receiptId', 'providerEventStatus', 'subjectId', 'from', 'to', 'status', 'subjectKind', 'subjectStatus', 'readingStatus', 'category', 'creditSource', 'reservationState', 'reservationId', 'aiStage', 'aiErrorCode', 'aiFeature', 'aiModel', 'deletionStatus', 'deletionScope', 'releaseStatus', 'characterAvailability', 'receiptStatus', 'auditOutcome', 'allocationMismatch']);
  for (const [key] of url.searchParams) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error('Unknown or duplicate administrator read parameter.');
    }
  }
  const rawLimit = url.searchParams.get('limit');
  if (rawLimit !== null && !/^[1-9]\d{0,1}$/u.test(rawLimit)) {
    throw new Error('Administrator limit is invalid.');
  }
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit > 50) {
    throw new Error('Administrator limit is out of range.');
  }
  const cursor = url.searchParams.get('cursor');
  if (kind === 'overview' && cursor !== null) throw new Error('Overview is not paginated.');
  if (cursor !== null && (!/^[1-9]\d{0,4}$/u.test(cursor) || Number(cursor) > 10_000 || (kind === 'user-detail' || kind === 'commerce-detail' || kind === 'reading-detail'))) {
    throw new Error('Administrator cursor is invalid.');
  }
  const querySubject = url.searchParams.get('subjectId');
  if (querySubject !== null && (!UUID.test(querySubject) || (kind === 'user-detail' || kind === 'commerce-detail' || kind === 'reading-detail' || kind === 'reading-attempts' || kind === 'reading-ai-usage'))) {
    throw new Error('Administrator subject reference is invalid.');
  }
  subjectId ??= querySubject?.toLowerCase() ?? null;
  if (subjectId !== null && ['overview','issues','audit','analytics','catalog','characters','content-releases'].includes(kind)) {
    throw new Error('Subject filter is not supported by the requested authority.');
  }
  if (kind === 'user-detail' || kind === 'commerce-detail' || kind === 'reading-detail' || kind === 'reading-attempts' || kind === 'reading-ai-usage') {
    if (url.searchParams.has('from') || url.searchParams.has('to')) {
      throw new Error('Detail route does not support date filters.');
    }
  }
  const receiptIdParam = url.searchParams.get('receiptId');
  if (receiptIdParam !== null && (!['entitlement-events','provider-events'].includes(kind) || !UUID.test(receiptIdParam))) {
    throw new Error('Invalid entitlement receipt evidence reference.');
  }
  const receiptId = receiptIdParam?.toLowerCase() ?? null;
  const providerEventStatusParam = url.searchParams.get('providerEventStatus');
  if (providerEventStatusParam !== null && (kind !== 'provider-events' ||
      !['received','verified','unresolved','processed','rejected','failed'].includes(providerEventStatusParam))) {
    throw new Error('Invalid provider event processing status.');
  }
  const providerEventStatus = providerEventStatusParam as AdminListFiltersV1['providerEventStatus'];
  const from = readDate(url.searchParams.get('from'));
  const to = readDate(url.searchParams.get('to'));
  if (from !== null && ['overview','catalog','characters','content-releases'].includes(kind)) {
    throw new Error('Date filter is not supported by the requested authority.');
  }
  if ((from === null) !== (to === null)) {
    throw new Error('Both administrator date boundaries must be supplied together.');
  }
  if (from !== null && to !== null &&
    (Date.parse(to + 'T00:00:00Z') < Date.parse(from + 'T00:00:00Z') ||
    Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z') > 90 * 86_400_000)) {
    throw new Error('Administrator date range exceeds policy.');
  }
  const issueCategory = url.searchParams.get('category');
  if (issueCategory !== null &&
      (kind !== 'issues' || !/^[A-Za-z0-9_.:-]{1,64}$/u.test(issueCategory))) {
    throw new Error('Invalid issue category filter.');
  }
  const creditSourceParam = url.searchParams.get('creditSource');
  if (creditSourceParam !== null && (kind !== 'credits' ||
      !['signup','portone_topup','reading_reward','admin_adjustment'].includes(creditSourceParam))) {
    throw new Error('Invalid credit source filter.');
  }
  const reservationIdParam = url.searchParams.get('reservationId');
  if (reservationIdParam !== null && (kind !== 'credit-allocations' || !UUID.test(reservationIdParam))) {
    throw new Error('Invalid credit allocation reservation reference.');
  }
  const reservationId = reservationIdParam?.toLowerCase() ?? null;
  const reservationStateParam = url.searchParams.get('reservationState');
  if (reservationStateParam !== null && (kind !== 'credit-reservations' ||
      !['reserved','settled','released'].includes(reservationStateParam))) {
    throw new Error('Invalid credit reservation filter.');
  }
  const creditSource = creditSourceParam as 'signup' | 'portone_topup' | 'reading_reward' | 'admin_adjustment' | null;
  const reservationState = reservationStateParam as 'reserved' | 'settled' | 'released' | null;
  const rawIssueStatus = url.searchParams.get('status');
  if (rawIssueStatus !== null && (kind !== 'issues' ||
      (rawIssueStatus !== 'failed' && rawIssueStatus !== 'dead_lettered'))) {
    throw new Error('Invalid administrator issue status filter.');
  }
  const allocationMismatchParam=url.searchParams.get('allocationMismatch');
  if (allocationMismatchParam !== null &&
      (kind !== 'credit-reservations' || allocationMismatchParam !== 'only')) {
    throw new Error('Invalid credit allocation mismatch filter.');
  }
  const allocationMismatchOnly=allocationMismatchParam === 'only';
  const auditOutcomeParam=url.searchParams.get('auditOutcome');
  if (auditOutcomeParam !== null && (kind !== 'audit' ||
      !['allowed','denied','failed'].includes(auditOutcomeParam))) {
    throw new Error('Invalid operator audit outcome.');
  }
  const auditOutcome = auditOutcomeParam as 'allowed' | 'denied' | 'failed' | null;
  const receiptStatusParam=url.searchParams.get('receiptStatus');
  if (receiptStatusParam !== null && (kind !== 'commerce' ||
      !['pending','verified','rejected','revoked'].includes(receiptStatusParam))) {
    throw new Error('Invalid receipt verification status.');
  }
  const receiptStatus = receiptStatusParam as 'pending' | 'verified' | 'rejected' | 'revoked' | null;
  const releaseStatusParam=url.searchParams.get('releaseStatus');
  const characterAvailabilityParam=url.searchParams.get('characterAvailability');
  if (releaseStatusParam !== null && (kind !== 'content-releases' ||
      !['draft','active','retired'].includes(releaseStatusParam))) {
    throw new Error('Invalid content release lifecycle status.');
  }
  if (characterAvailabilityParam !== null && (kind !== 'characters' ||
      !['available','unlockable','locked','coming_soon'].includes(characterAvailabilityParam))) {
    throw new Error('Invalid character availability filter.');
  }
  const releaseStatus = releaseStatusParam as 'draft' | 'active' | 'retired' | null;
  const characterAvailability = characterAvailabilityParam as 'available' | 'unlockable' | 'locked' | 'coming_soon' | null;
  const deletionStatusParam=url.searchParams.get('deletionStatus');
  const deletionScopeParam=url.searchParams.get('deletionScope');
  if (deletionStatusParam !== null && (kind !== 'deletion-jobs' ||
      !['requested','running','completed','failed'].includes(deletionStatusParam))) {
    throw new Error('Invalid deletion lifecycle status.');
  }
  if (deletionScopeParam !== null && (kind !== 'deletion-jobs' ||
      !['account','conversation','memory','life_fact','target_person'].includes(deletionScopeParam))) {
    throw new Error('Invalid deletion target scope.');
  }
  const deletionStatus = deletionStatusParam as 'requested' | 'running' | 'completed' | 'failed' | null;
  const deletionScope = deletionScopeParam as 'account' | 'conversation' | 'memory' | 'life_fact' | 'target_person' | null;
  const aiFeature = url.searchParams.get('aiFeature');
  const aiModel = url.searchParams.get('aiModel');
  if (aiFeature !== null && !((kind === 'ai-costs' && ['planner','renderer','output_guard','scene_director'].includes(aiFeature)) ||
      (kind === 'ai-estimates' && ['chat','post_turn'].includes(aiFeature)))) {
    throw new Error('Invalid AI measurement feature.');
  }
  if (aiModel !== null && (!['ai-costs','ai-errors','ai-estimates'].includes(kind) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(aiModel))) {
    throw new Error('Invalid AI measurement model.');
  }
  const aiStageParam = url.searchParams.get('aiStage');
  if (aiStageParam !== null && (kind !== 'ai-errors' ||
      !['planner','renderer','output_guard','scene_director'].includes(aiStageParam))) {
    throw new Error('Invalid AI execution stage.');
  }
  const aiErrorCodeParam = url.searchParams.get('aiErrorCode');
  if (aiErrorCodeParam !== null && (kind !== 'ai-errors' ||
      !/^[A-Za-z0-9_.:-]{1,80}$/u.test(aiErrorCodeParam))) {
    throw new Error('Invalid AI error code.');
  }
  const aiStage = aiStageParam as 'planner' | 'renderer' | 'output_guard' | 'scene_director' | null;
  const aiErrorCode = aiErrorCodeParam;
  const readingStatusParam = url.searchParams.get('readingStatus');
  if (readingStatusParam !== null &&
      (kind !== 'readings' || !['pending','running','succeeded','failed','cancelled'].includes(readingStatusParam))) {
    throw new Error('Invalid Reading status filter.');
  }
  const readingStatus = readingStatusParam as 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | null;
  const subjectKindParam = url.searchParams.get('subjectKind');
  const subjectStatusParam = url.searchParams.get('subjectStatus');
  if ((subjectKindParam !== null || subjectStatusParam !== null) && kind !== 'users') {
    throw new Error('Lifecycle filters apply only to user list.');
  }
  if (subjectKindParam !== null && !['guest','member'].includes(subjectKindParam)) {
    throw new Error('Invalid subject kind filter.');
  }
  if (subjectStatusParam !== null &&
      !['active','merged','deletion_pending','deleted'].includes(subjectStatusParam)) {
    throw new Error('Invalid subject lifecycle status filter.');
  }
  const subjectKind = subjectKindParam as 'guest' | 'member' | null;
  const subjectStatus = subjectStatusParam as 'active' | 'merged' | 'deletion_pending' | 'deleted' | null;
  if (!ADMIN_READ_KINDS_V1.includes(kind)) throw new Error('Unknown administrator kind.');
  const issueStatus = rawIssueStatus as 'failed' | 'dead_lettered' | null;
  return Object.freeze({ kind, limit, cursor, subjectId, recordId, receiptId, providerEventStatus: providerEventStatus ?? null, from, to, issueStatus, issueCategory, subjectKind, subjectStatus, readingStatus, creditSource, reservationState, reservationId, aiStage, aiErrorCode, aiFeature, aiModel, deletionStatus, deletionScope, releaseStatus, characterAvailability, receiptStatus, auditOutcome, allocationMismatchOnly });
}

const ISSUE_EXPORT_COLUMNS = ['issueId', 'category', 'severity', 'status', 'createdAt', 'requestId'] as const;

function escapeSpreadsheetCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  text = text.replace(/[\r\n]/gu, ' ').slice(0, 256);
  if (/^[\s]*[=+@\-]/u.test(text) || /^[\t\r]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/gu, '""') + '"';
}

export function renderIssuesCsvV1(rows: readonly Readonly<Record<string, unknown>>[]): string {
  if (rows.length > 50) throw new Error('Maximum issues export size exceeded.');
  return [
    ISSUE_EXPORT_COLUMNS.join(','),
    ...rows.map(row => ISSUE_EXPORT_COLUMNS.map(column =>
      escapeSpreadsheetCell(row[column])).join(',')),
  ].join('\r\n') + '\r\n';
}

function issueExportResponse(
  requestId: string,
  rows: readonly Readonly<Record<string, unknown>>[],
): Response {
  return new Response(renderIssuesCsvV1(rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="myeongha-issues.csv"',
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      'Vary': 'Authorization',
    },
  });
}

/** Unmounted by default. A privileged deployment must separately approve this entrypoint. */
export function createAdminReadHttpHandlerV1(deps: AdminReadHttpDependenciesV1) {
  // One private runtime serves one Owner. Bound searches without storing IPs/tokens.
  let ownerWindowStart = 0;
  let ownerReads = 0;
  return async (request: Request): Promise<Response> => {
    const requestId = (deps.requestId ?? randomUUID)();
    if (!UUID.test(requestId)) {
      return response(503, 'invalid', { error: 'ADMIN_UNAVAILABLE' });
    }
    const now = (deps.now ?? (() => new Date()))();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      return response(503, requestId, { error: 'ADMIN_UNAVAILABLE' });
    }
    const at = now.toISOString();
    const append = async (
      actorAuthUserId: string | null,
      action: string,
      outcome: AdminAuditOutcomeV1,
      targetRef: string | null = null,
    ) => deps.audit.append(Object.freeze({ requestId, actorAuthUserId, action, outcome, targetRef, at }));

    if (request.method !== 'GET') {
      try { await append(null, 'invalid-method', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(405, requestId, { error: 'METHOD_NOT_ALLOWED' });
    }

    let actor: { authUserId: string } | null;
    try { actor = await deps.auth.verifyOwner(request); }
    catch {
      try { await append(null, 'admin-auth', 'failed'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(503, requestId, { error: 'ADMIN_AUTH_UNAVAILABLE' });
    }
    if (actor === null) {
      try { await append(null, 'admin-read', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(403, requestId, { error: 'ADMIN_FORBIDDEN' });
    }

    if (now.getTime() - ownerWindowStart >= 60_000 || now.getTime() < ownerWindowStart) {
      ownerWindowStart = now.getTime();
      ownerReads = 0;
    }
    if (++ownerReads > 60) {
      try { await append(actor.authUserId, 'admin-rate-limit', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      const limited = response(429, requestId, { error: 'ADMIN_RATE_LIMITED' });
      limited.headers.set('Retry-After', String(Math.max(1, Math.ceil((ownerWindowStart + 60_000 - now.getTime()) / 1000))));
      return limited;
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/api/admin/session') {
      if (requestUrl.search !== '') {
        try { await append(actor.authUserId, 'invalid-query', 'denied'); }
        catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
        return response(400, requestId, { error: 'ADMIN_BAD_REQUEST' });
      }
      try { await append(actor.authUserId, 'session:verify', 'allowed'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(200, requestId, { authorized: true });
    }

    let filters: AdminListFiltersV1;
    const isIssueExport = requestUrl.pathname === '/api/admin/issues.csv';
    try {
      const url = new URL(request.url);
      if (isIssueExport) url.pathname = '/api/admin/issues';
      if (!url.pathname.startsWith(PATH_PREFIX)) throw new Error('Not admin route');
      filters = parseAdminReadFiltersV1(url);
      if (isIssueExport && filters.limit > 50) throw new Error('Export limit exceeded');
    } catch {
      try { await append(actor.authUserId, 'invalid-query', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(400, requestId, { error: 'ADMIN_BAD_REQUEST' });
    }
    try {
      const result = projectAdminRowsV1(
        filters.kind,
        filters.kind === 'analytics' ? readAdminAnalyticsEvidenceV1(filters) : await deps.reads.read(filters),
        filters.limit,
      );
      await append(actor.authUserId, (isIssueExport ? 'export:' : 'read:') + filters.kind, 'allowed', filters.recordId ?? filters.subjectId);
      if (isIssueExport) return issueExportResponse(requestId, result.rows);
      return response(200, requestId, { kind: filters.kind, ...result });
    } catch {
      try { await append(actor.authUserId, (isIssueExport ? 'export:' : 'read:') + filters.kind, 'failed', filters.recordId ?? filters.subjectId); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(503, requestId, { error: 'ADMIN_READ_UNAVAILABLE' });
    }
  };
}
