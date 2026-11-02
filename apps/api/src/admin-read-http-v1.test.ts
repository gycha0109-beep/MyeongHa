import { describe, expect, it } from 'vitest';
import { createAdminOwnerAuthV1 } from './admin-auth-v1.js';
import { createAdminReadHttpHandlerV1, parseAdminReadFiltersV1, renderIssuesCsvV1 } from './admin-read-http-v1.js';
import type { AdminAuditEventV1 } from './admin-read-http-v1.js';
import type { AdminReadPortV1 } from './admin-read-contract-v1.js';

const OWNER = '123e4567-e89b-42d3-a456-426614174000';
const STRANGER = '123e4567-e89b-42d3-a456-426614174001';
const subject = '123e4567-e89b-42d3-a456-426614174002';

function harness(options: {
  readonly principal?: 'owner' | 'stranger' | 'guest' | 'missing';
  readonly throwAudit?: boolean;
  readonly throwRead?: boolean;
} = {}) {
  const auditEvents: AdminAuditEventV1[] = [];
  let readsCount = 0;
  const auth = createAdminOwnerAuthV1({
    ownerAuthUserId: OWNER,
    identityVerifier: {
      async verifyRequestIdentity() {
        switch (options.principal ?? 'owner') {
          case 'owner': return { kind: 'member', verifiedAuthUserId: OWNER };
          case 'stranger': return { kind: 'member', verifiedAuthUserId: STRANGER };
          case 'guest': return { kind: 'guest', verifiedGuestTokenHash: 'synthetic' };
          case 'missing': return null;
        }
      },
    },
  });
  const reads: AdminReadPortV1 = {
    async read() {
      readsCount++;
      if (options.throwRead) throw new Error('DB unavailable: private');
      return { rows: [{ subjectId: subject, status: 'active', email: 'not-allowed@example.com', privateNote: 'never leak' }], nextCursor: null };
    },
  };
  const handler = createAdminReadHttpHandlerV1({
    auth,
    reads,
    audit: {
      async append(e) {
        if (options.throwAudit) throw new Error('audit failed');
        auditEvents.push(e);
      },
    },
    requestId: () => OWNER,
    now: () => new Date('2026-10-26T10:00:00Z'),
  });
  return {
    call(path = '/api/admin/users', method = 'GET') {
      return handler(new Request('https://admin.invalid' + path, { method }));
    },
    get readCount() { return readsCount; },
    auditEvents,
  };
}

describe('admin owner-only reads', () => {
  it('allows exact provider-event receipt and state filters only on the evidence route', () => {
    const read = (path: string) => parseAdminReadFiltersV1(new URL('https://admin.invalid' + path));
    expect(read('/api/admin/provider-events?receiptId=' + subject + '&providerEventStatus=unresolved')).toMatchObject({ receiptId: subject, providerEventStatus: 'unresolved' });
    for (const path of ['/api/admin/provider-events?receiptId=invalid', '/api/admin/provider-events?providerEventStatus=refunded',
      '/api/admin/commerce?providerEventStatus=verified']) expect(() => read(path)).toThrow();
  });
  it('accepts model and source-specific AI features and rejects SQL-shaped or cross-source filters', () => {
    const read = (path: string) => parseAdminReadFiltersV1(new URL('https://admin.invalid' + path));
    expect(read('/api/admin/ai-costs?aiFeature=renderer&aiModel=provider/model-v1').aiModel).toBe('provider/model-v1');
    expect(read('/api/admin/ai-estimates?aiFeature=chat').aiFeature).toBe('chat');
    for (const path of ['/api/admin/ai-estimates?aiFeature=renderer', '/api/admin/ai-costs?aiFeature=chat',
      '/api/admin/users?aiModel=model', '/api/admin/ai-costs?aiModel=%27OR%201=1']) {
      expect(() => read(path)).toThrow();
    }
  });
  it('validates receipt lineage filters and strips event payloads from entitlement responses', () => {
    const read = (path: string) => parseAdminReadFiltersV1(new URL('https://admin.invalid' + path));
    expect(read('/api/admin/entitlement-events?receiptId=' + subject).receiptId).toBe(subject);
    expect(read('/api/admin/entitlements?subjectId=' + subject).kind).toBe('entitlements');
    for (const path of ['/api/admin/entitlement-events?receiptId=invalid', '/api/admin/credits?receiptId=' + subject,
      '/api/admin/entitlement-events?receiptId=' + subject + '&receiptId=' + subject]) {
      expect(() => read(path)).toThrow();
    }
  });
  it('bounds Owner reads and audits denied excess requests before touching domain data', async () => {
    const h = harness();
    for (let i = 0; i < 60; i++) expect((await h.call()).status).toBe(200);
    const limited = await h.call();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(h.readCount).toBe(60);
    expect(h.auditEvents.at(-1)).toMatchObject({ action: 'admin-rate-limit', outcome: 'denied' });
  });
  it('exports only allowlisted issue columns with audit, bounded and formula-safe', async () => {
    const h = harness();
    const csv = await h.call('/api/admin/issues.csv?limit=20');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(h.auditEvents[0]?.action).toBe('export:issues');
    expect(h.readCount).toBe(1);
    const text = await csv.text();
    expect(text.split('\r\n')[0]).toBe('issueId,category,severity,status,createdAt,requestId');
    expect(text).not.toMatch(/email|privateNote/);
    expect(renderIssuesCsvV1([{ category: '=HYPERLINK("bad")', status: '+SUM(1)' }]))
      .toContain("'=HYPERLINK");
    expect((await harness({ principal: 'stranger' }).call('/api/admin/issues.csv')).status).toBe(403);
    expect((await harness({ throwAudit: true }).call('/api/admin/issues.csv')).status).toBe(503);
  });
  it('rejects filters unsupported by the underlying SQL rather than silently ignoring them', () => {
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/issues?subjectId=123e4567-e89b-42d3-a456-426614174000'))).toThrow();
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/issues?status=dead_lettered')).issueStatus).toBe('dead_lettered');
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/issues?category=reading.failed')).issueCategory).toBe('reading.failed');
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/issues?category=%27OR%201%3D1'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings?category=reading.failed'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings?status=failed'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/issues?status=anything'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/catalog?from=2026-10-01&to=2026-10-26'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/commerce/123e4567-e89b-42d3-a456-426614174000?from=2026-10-01&to=2026-10-26'))).toThrow();
  });
  it('restricts credit and reservation filters to their canonical read kinds', () => {
    const url=(path: string) => new URL('https://a.invalid' + path);
    expect(parseAdminReadFiltersV1(url('/api/admin/credits?creditSource=portone_topup')).creditSource).toBe('portone_topup');
    expect(parseAdminReadFiltersV1(url('/api/admin/credit-reservations?reservationState=released')).reservationState).toBe('released');
    for (const path of ['/api/admin/credits?creditSource=untrusted','/api/admin/credits?reservationState=settled','/api/admin/users?creditSource=signup','/api/admin/credit-reservations?reservationState=approved']) {
      expect(() => parseAdminReadFiltersV1(url(path))).toThrow();
    }
  });
  it('allows only exact bounded credit allocation list route', () => {
    const resource=new URL('https://a.invalid/api/admin/credit-allocations?limit=20');
    expect(parseAdminReadFiltersV1(resource).kind).toBe('credit-allocations');
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/credit-allocations?reservationState=reserved'))).toThrow();
  });
  it('restricts audit inspection to approved route and refuses subject filter', () => {
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/audit?limit=20')).kind).toBe('audit');
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/audit?subjectId=' + subject))).toThrow();
  });
  it('restricts exact reservation allocation lookup to valid UUIDs on its own route', () => {
    const id='123e4567-e89b-42d3-a456-426614174002';
    const from=(path: string) => parseAdminReadFiltersV1(new URL('https://a.invalid'+path));
    expect(from('/api/admin/credit-allocations?reservationId='+id).reservationId).toBe(id);
    expect(() => from('/api/admin/credit-allocations?reservationId=unknown')).toThrow();
    expect(() => from('/api/admin/credit-reservations?reservationId='+id)).toThrow();
    expect(() => from('/api/admin/users?reservationId='+id)).toThrow();
    expect(() => from('/api/admin/credit-allocations?reservationId='+id+'&reservationId='+id)).toThrow();
  });
  it('accepts only exact Reading execution attempt routes, with bounded pagination', () => {
    const id='123e4567-e89b-42d3-a456-426614174002';
    const from=(suffix:string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+suffix));
    const parsed=from('/api/admin/readings/'+id+'/attempts?cursor=2');
    expect(parsed.kind).toBe('reading-attempts');
    expect(parsed.recordId).toBe(id);
    expect(parsed.cursor).toBe('2');
    expect(() => from('/api/admin/readings/'+id+'/attempts?cursor=10001')).toThrow();
    expect(() => from('/api/admin/readings/'+id+'/attempts?cursor=NaN')).toThrow();
    expect(() => from('/api/admin/readings/'+id+'/attempts?subjectId='+id)).toThrow();
    expect(() => from('/api/admin/readings/'+id+'/attempts?from=2026-10-01&to=2026-10-02')).toThrow();
    expect(() => from('/api/admin/readings/bad/attempts')).toThrow();
  });
  it('accepts only validated AI error stage and code on failure list', () => {
    const read=(url: string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+url));
    expect(read('/api/admin/ai-errors?aiStage=renderer&aiErrorCode=PROVIDER_TIMEOUT').aiStage).toBe('renderer');
    expect(read('/api/admin/ai-errors?aiErrorCode=PROVIDER_TIMEOUT').aiErrorCode).toBe('PROVIDER_TIMEOUT');
    expect(() => read('/api/admin/ai-errors?aiStage=invalid')).toThrow();
    expect(() => read('/api/admin/ai-errors?aiErrorCode=%27%3BDELETE')).toThrow();
    expect(() => read('/api/admin/readings?aiStage=renderer')).toThrow();
    expect(() => read('/api/admin/ai-costs?aiErrorCode=ERROR')).toThrow();
  });
  it('limits deletion lifecycle filters to known status and scope', () => {
    const get=(path:string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+path));
    const f=get('/api/admin/deletion-jobs?deletionStatus=failed&deletionScope=account');
    expect(f.deletionStatus).toBe('failed');
    expect(f.deletionScope).toBe('account');
    expect(() => get('/api/admin/deletion-jobs?deletionStatus=unknown')).toThrow();
    expect(() => get('/api/admin/deletion-jobs?deletionScope=unknown')).toThrow();
    expect(() => get('/api/admin/issues?deletionStatus=failed')).toThrow();
  });
  it('accepts only canonical content release and character availability states', () => {
    const get=(path:string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+path));
    expect(get('/api/admin/content-releases?releaseStatus=active').releaseStatus).toBe('active');
    expect(get('/api/admin/characters?characterAvailability=coming_soon').characterAvailability).toBe('coming_soon');
    expect(() => get('/api/admin/characters?releaseStatus=active')).toThrow();
    expect(() => get('/api/admin/content-releases?characterAvailability=locked')).toThrow();
    expect(() => get('/api/admin/content-releases?releaseStatus=preview')).toThrow();
  });
  it('restricts receipt verification status filters to the transaction listing', () => {
    const parse=(p:string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+p));
    expect(parse('/api/admin/commerce?receiptStatus=verified').receiptStatus).toBe('verified');
    expect(() => parse('/api/admin/commerce?receiptStatus=paid')).toThrow();
    expect(() => parse('/api/admin/commerce-alerts?receiptStatus=verified')).toThrow();
    expect(() => parse('/api/admin/credits?receiptStatus=revoked')).toThrow();
  });
  it('rejects invalid audit outcome values or audit filters on unrelated routes', () => {
    const parse=(path:string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+path));
    expect(parse('/api/admin/audit?auditOutcome=denied').auditOutcome).toBe('denied');
    expect(parse('/api/admin/audit?auditOutcome=failed').auditOutcome).toBe('failed');
    expect(() => parse('/api/admin/audit?auditOutcome=success')).toThrow();
    expect(() => parse('/api/admin/issues?auditOutcome=denied')).toThrow();
    expect(() => parse('/api/admin/audit?auditOutcome=denied&auditOutcome=failed')).toThrow();
  });

  it('allows allocation mismatch filtering only for credit reservations', () => {
    const get=(path:string)=>parseAdminReadFiltersV1(new URL('https://a.invalid'+path));
    expect(get('/api/admin/credit-reservations?allocationMismatch=only').allocationMismatchOnly).toBe(true);
    expect(get('/api/admin/credit-reservations').allocationMismatchOnly).toBe(false);
    expect(() => get('/api/admin/credit-reservations?allocationMismatch=false')).toThrow();
    expect(() => get('/api/admin/credit-allocations?allocationMismatch=only')).toThrow();
  });

  it('verifies only Owner session before any data query, with required audit', async () => {
    const allowed = harness();
    const result = await allowed.call('/api/admin/session');
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ authorized: true });
    expect(allowed.readCount).toBe(0);
    expect(allowed.auditEvents[0]?.action).toBe('session:verify');
    const other = harness({ principal: 'stranger' });
    expect((await other.call('/api/admin/session')).status).toBe(403);
    expect((await other.call('/api/admin/session?unexpected=1')).status).toBe(403);
    expect(other.readCount).toBe(0);
    expect((await harness({ throwAudit: true }).call('/api/admin/session')).status).toBe(503);
    expect((await allowed.call('/api/admin/session?unexpected=1')).status).toBe(400);
  });

  it.each(['stranger', 'guest', 'missing'] as const)('rejects %s before any read', async principal => {
    const h = harness({ principal });
    const res = await h.call();
    expect(res.status).toBe(403);
    expect(h.readCount).toBe(0);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(h.auditEvents[0]?.outcome).toBe('denied');
  });

  it('omits email and every unlisted sensitive field', async () => {
    const h = harness();
    const res = await h.call();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/not-allowed|privateNote|never leak|email/);
    expect(JSON.parse(text).rows[0]).toEqual({ subjectId: subject, status: 'active' });
    expect(h.auditEvents[0]?.actorAuthUserId).toBe(OWNER);
    const detail = harness();
    expect((await detail.call('/api/admin/users/' + subject)).status).toBe(200);
    expect(detail.auditEvents[0]?.targetRef).toBe(subject);
  });

  it('refuses unknown paths, unsafe filters, and writes before DB access', async () => {
    const h = harness();
    for (const path of [
      '/api/admin/users/' + STRANGER + '/edit',
      '/api/admin/users?limit=500',
      '/api/admin/users?cursor=%27OR%201%3D1',
      '/api/admin/users?from=2026-01-01&to=2026-10-26',
      '/api/admin/users?subjectId=anyone',
      '/api/admin/users?limit=2&limit=3',
      '/api/admin/users?secret=true',
      '/api/admin/users?from=2026-10-01',
      '/api/admin/users?to=2026-10-26',
      '/api/admin/users?cursor=99999',
    ]) {
      expect((await h.call(path)).status).toBe(400);
    }
    expect((await h.call('/api/admin/users', 'POST')).status).toBe(405);
    expect(h.readCount).toBe(0);
  });

  it('fails closed when audit or data is unavailable', async () => {
    const noAudit = harness({ throwAudit: true });
    expect((await noAudit.call()).status).toBe(503);
    const noDb = harness({ throwRead: true });
    const res = await noDb.call();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('private');
  });

  it('bounds user lifecycle filters and disallows using them on unrelated resources', () => {
    const f = parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/users?subjectKind=guest&subjectStatus=merged'));
    expect(f.subjectKind).toBe('guest');
    expect(f.subjectStatus).toBe('merged');
    for (const query of [
      '/api/admin/users?subjectKind=unknown',
      '/api/admin/users?subjectStatus=pending',
      '/api/admin/commerce?subjectKind=guest',
      '/api/admin/users/' + subject + '?subjectStatus=active',
    ]) expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid' + query))).toThrow();
  });
  it('accepts only Reading lifecycle statuses on the Reading listing', () => {
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings?readingStatus=failed')).readingStatus).toBe('failed');
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings?readingStatus=any'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings/123e4567-e89b-42d3-a456-426614174002?readingStatus=failed'))).toThrow();
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/users?readingStatus=failed'))).toThrow();
  });
  it('validates single resource lookup and date bounds', () => {
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/users/' + subject)).kind).toBe('user-detail');
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/commerce/' + subject)).recordId).toBe(subject);
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings/' + subject)).kind).toBe('reading-detail');
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/readings/' + subject + '?cursor=1'))).toThrow();
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/commerce-alerts?subjectId=' + subject)).kind).toBe('commerce-alerts');
    expect(() => parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/commerce/' + subject + '?cursor=1'))).toThrow();
    expect(parseAdminReadFiltersV1(new URL('https://a.invalid/api/admin/ai-costs?limit=50&from=2026-10-01&to=2026-10-26')).limit).toBe(50);
  });

  it('does not accept undefined or non-UUID owner allowlist', () => {
    expect(() => createAdminOwnerAuthV1({
      identityVerifier: { verifyRequestIdentity: () => null },
      ownerAuthUserId: 'owner@example.com',
    })).toThrow();
  });
});
