import { randomUUID } from 'node:crypto';
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
  users: 'users',
  commerce: 'commerce',
  credits: 'credits',
  readings: 'readings',
  'ai-costs': 'ai-costs',
  'ai-estimates': 'ai-estimates',
  catalog: 'catalog',
  characters: 'characters',
  'content-releases': 'content-releases',
  'deletion-jobs': 'deletion-jobs',
  analytics: 'analytics',
  issues: 'issues',
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
  if (fragments.length === 2 && fragments[0] === 'users' &&
    typeof fragments[1] === 'string' && UUID.test(fragments[1])) {
    kind = 'user-detail';
    subjectId = fragments[1].toLowerCase();
  } else if (fragments.length === 1 &&
    Object.hasOwn(ROUTES, fragments[0] ?? '')) {
    kind = ROUTES[fragments[0] ?? '']!;
  } else {
    throw new Error('Unknown administrator read route.');
  }

  const allowed = new Set(['limit', 'cursor', 'subjectId', 'from', 'to']);
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
  if (cursor !== null && (!/^[1-9]\d{0,4}$/u.test(cursor) || Number(cursor) > 10_000 || kind === 'user-detail')) {
    throw new Error('Administrator cursor is invalid.');
  }
  const querySubject = url.searchParams.get('subjectId');
  if (querySubject !== null && (!UUID.test(querySubject) || kind === 'user-detail')) {
    throw new Error('Administrator subject reference is invalid.');
  }
  subjectId ??= querySubject?.toLowerCase() ?? null;
  const from = readDate(url.searchParams.get('from'));
  const to = readDate(url.searchParams.get('to'));
  if ((from === null) !== (to === null)) {
    throw new Error('Both administrator date boundaries must be supplied together.');
  }
  if (from !== null && to !== null &&
    (Date.parse(to + 'T00:00:00Z') < Date.parse(from + 'T00:00:00Z') ||
    Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z') > 90 * 86_400_000)) {
    throw new Error('Administrator date range exceeds policy.');
  }
  if (!ADMIN_READ_KINDS_V1.includes(kind)) throw new Error('Unknown administrator kind.');
  return Object.freeze({ kind, limit, cursor, subjectId, from, to });
}

/** Unmounted by default. A privileged deployment must separately approve this entrypoint. */
export function createAdminReadHttpHandlerV1(deps: AdminReadHttpDependenciesV1) {
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
    ) => deps.audit.append(Object.freeze({ requestId, actorAuthUserId, action, outcome, at }));

    if (request.method !== 'GET') {
      try { await append(null, 'invalid-method', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(405, requestId, { error: 'METHOD_NOT_ALLOWED' });
    }

    let actor: { authUserId: string } | null;
    try { actor = await deps.auth.verifyOwner(request); }
    catch { return response(503, requestId, { error: 'ADMIN_AUTH_UNAVAILABLE' }); }
    if (actor === null) {
      try { await append(null, 'admin-read', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(403, requestId, { error: 'ADMIN_FORBIDDEN' });
    }

    let filters: AdminListFiltersV1;
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(PATH_PREFIX)) throw new Error('Not admin route');
      filters = parseAdminReadFiltersV1(url);
    } catch {
      try { await append(actor.authUserId, 'invalid-query', 'denied'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(400, requestId, { error: 'ADMIN_BAD_REQUEST' });
    }
    try {
      const result = projectAdminRowsV1(
        filters.kind,
        await deps.reads.read(filters),
        filters.limit,
      );
      await append(actor.authUserId, 'read:' + filters.kind, 'allowed');
      return response(200, requestId, { kind: filters.kind, ...result });
    } catch {
      try { await append(actor.authUserId, 'read:' + filters.kind, 'failed'); }
      catch { return response(503, requestId, { error: 'ADMIN_AUDIT_UNAVAILABLE' }); }
      return response(503, requestId, { error: 'ADMIN_READ_UNAVAILABLE' });
    }
  };
}
