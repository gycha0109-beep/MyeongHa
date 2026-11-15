import { describe, expect, it } from 'vitest';
import { buildListPath, ADMIN_USER_SCOPES_V1, DEFAULT_ADMIN_USER_SCOPE_V1, formatAdminSeoulDateV1, matchesAdminReadAuditV1 } from './AdminWorkbench.js';

describe('member-first administrator user views', () => {
  it('starts with registered active members, not every guest record', () => {
    expect(DEFAULT_ADMIN_USER_SCOPE_V1).toMatchObject({kind:'member',status:'active'});
    const path=buildListPath('users','',null,'users',null,null,'all',
      DEFAULT_ADMIN_USER_SCOPE_V1.kind,DEFAULT_ADMIN_USER_SCOPE_V1.status);
    const url=new URL(path,'https://admin.invalid');
    expect(url.pathname).toBe('/api/admin/users');
    expect(url.searchParams.get('subjectKind')).toBe('member');
    expect(url.searchParams.get('subjectStatus')).toBe('active');
  });
  it('separates guest, account deletion, and all internal records', () => {
    for (const [scope,kind,status] of [
      ['guests','guest','all'],['pending','member','deletion_pending'],
      ['deleted','member','deleted'],['all','all','all'],
    ]) {
      const view=ADMIN_USER_SCOPES_V1.find(item=>item.key===scope);
      expect(view).toMatchObject({kind,status});
      const url=new URL(buildListPath('users','',null,'users',null,null,'all',view?.kind,view?.status),'https://admin.invalid');
      expect(url.searchParams.get('subjectKind')).toBe(kind==='all'?null:kind);
      expect(url.searchParams.get('subjectStatus')).toBe(status==='all'?null:status);
    }
  });
  it('shows safe Seoul times and distinguishes missing records',()=>{
    expect(formatAdminSeoulDateV1('2026-11-05 01:05:26.184147+00')).toContain('10:05');
    expect(formatAdminSeoulDateV1('2026-11-05T01:05:26+00:00')).toContain('10:05');
    expect(formatAdminSeoulDateV1(null)).toBe('기록 없음');
    expect(formatAdminSeoulDateV1('not-a-timestamp')).toBe('날짜 확인 필요');
  });
});

describe('administrator investigation navigation', () => {
  it('does not carry unsupported date filters from investigations into catalog metadata', () => {
    for (const tab of ['catalog', 'characters', 'content-releases'] as const) {
      const url = new URL(buildListPath('issues', '', null, tab, '2026-10-01', '2026-10-27'), 'https://admin.invalid');
      expect(url.searchParams.has('from')).toBe(false);
      expect(url.searchParams.has('to')).toBe(false);
    }
  });
  it('carries user and exact receipt filters into paginated entitlement history', () => {
    const subject = '123e4567-e89b-42d3-a456-426614174002';
    const receipt = '123e4567-e89b-42d3-a456-426614174003';
    const path = buildListPath('commerce', subject, '20', 'entitlement-events', null, null,
      'all', 'all', 'all', 'all', '', 'all', 'all', '', '', 'all', '', 'all', 'all', 'all', 'all', 'all', 'all', false, receipt);
    const url = new URL(path, 'https://admin.invalid');
    expect(url.pathname).toBe('/api/admin/entitlement-events');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '20', cursor: '20', subjectId: subject, receiptId: receipt });
  });
  it('applies shared keyword search to the selected list before pagination', () => {
    const path = buildListPath('issues', '', '20', 'audit', '2026-10-01', '2026-10-27',
      'all', 'all', 'all', 'all', '', 'all', 'all', '', '', 'all', '', 'all', 'all', 'all',
      'all', 'all', 'all', false, '', 'all', '', 'all', 'read:users');
    const url = new URL(path, 'https://admin.invalid');
    expect(url.searchParams.get('search')).toBe('read:users');
    expect(url.searchParams.get('cursor')).toBe('20');
    expect(url.searchParams.get('from')).toBe('2026-10-01');
    expect(url.searchParams.get('to')).toBe('2026-10-27');
  });
  it('routes Reading generation cost separately from Character AI consuming its grounding',()=>{
    const reading='123e4567-e89b-42d3-a456-426614174001';
    const path=buildListPath('readings','', '20','reading-generation-cost',null,null,
      'all','all','all','all','','all','all','',reading);
    const url=new URL(path,'https://admin.invalid');
    expect(url.pathname).toBe('/api/admin/readings/'+reading+'/generation-cost');
    expect(Object.fromEntries(url.searchParams)).toEqual({limit:'20',cursor:'20'});
    const linked=buildListPath('readings','',null,'reading-ai-usage',null,null,
      'all','all','all','all','','all','all','',reading);
    expect(new URL(linked,'https://admin.invalid').pathname)
      .toBe('/api/admin/readings/'+reading+'/ai-usage');
  });

});

describe('administrator exact Owner read and audit correlation', () => {
  const requestId = '123e4567-e89b-42d3-a456-426614174001';
  const row = { requestId, action: 'read:users', outcome: 'allowed', actorRef: 'owner' };
  const page = (rows: readonly Record<string, string>[]) => ({ kind: 'audit', rows, nextCursor: null });
  it('accepts only one audited allowed read with the exact same ID and read action', () => {
    expect(matchesAdminReadAuditV1(requestId, 'users', page([row]))).toBe(true);
    expect(matchesAdminReadAuditV1(requestId, 'users', page([{ ...row, requestId: '123e4567-e89b-42d3-a456-426614174002' }]))).toBe(false);
    expect(matchesAdminReadAuditV1(requestId, 'users', page([{ ...row, action: 'read:commerce' }]))).toBe(false);
    expect(matchesAdminReadAuditV1(requestId, 'users', page([{ ...row, outcome: 'failed' }]))).toBe(false);
    expect(matchesAdminReadAuditV1(requestId, 'users', page([row, row]))).toBe(false);
  });
  it('never treats an untrusted ID, audit listing or missing row as confirmation', () => {
    expect(matchesAdminReadAuditV1('unsafe', 'users', page([row]))).toBe(false);
    expect(matchesAdminReadAuditV1(requestId, 'audit', page([row]))).toBe(false);
    expect(matchesAdminReadAuditV1(requestId, 'users', { ...page([row]), kind: 'users' })).toBe(false);
    expect(matchesAdminReadAuditV1(requestId, 'users', page([]))).toBe(false);
  });
});
