import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = join(process.cwd(), 'apps', 'web');
const html = readFileSync(join(webRoot, 'records.html'), 'utf8');
const client = readFileSync(join(webRoot, 'records-runtime-client.js'), 'utf8');
const page = readFileSync(join(webRoot, 'records-page.js'), 'utf8');

describe('web records authority boundary', () => {
  it('removes the old demo identity and fabricated private records', () => {
    expect(html).not.toContain('John Doe 03');
    expect(html).not.toContain('2026.08.27');
    expect(html).not.toContain('새로운 프로젝트 방향을 고민');
    expect(html).not.toContain('기록판 3.0');
    expect(html).not.toContain('관계 이벤트');
  });

  it('keeps the first records slice explicitly read-only', () => {
    expect(html).toContain('이 화면은 현재 read-only입니다.');
    expect(html).not.toContain('수정 · 철회');
    expect(client).toContain("method: 'GET'");
    expect(client).not.toContain("method: 'POST'");
    expect(client).not.toContain("method: 'PATCH'");
    expect(client).not.toContain("method: 'DELETE'");
  });

  it('uses only server-resolved current-subject reads', () => {
    expect(client).toContain("profile: '/v1/profile'");
    expect(client).toContain("birthProfile: '/v1/records/birth-profile'");
    expect(client).toContain("lifeFacts: '/v1/records/life-facts'");
    expect(client).toContain("memories: '/v1/records/memories'");
    expect(client).not.toContain('subjectId=');
    expect(client).not.toContain('authUserId');
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("cache: 'no-store'");
  });

  it('fails closed for missing session, failed transport, and malformed JSON', () => {
    expect(client).toContain('WEB_RECORDS_SESSION_REQUIRED');
    expect(client).toContain('WEB_RECORDS_REQUEST_FAILED');
    expect(client).toContain('WEB_RECORDS_MALFORMED_RESPONSE');
    expect(page).toContain('서버 read authority가 연결되기 전에는 임의의 기록을 대신 표시하지 않습니다.');
  });

  it('renders stored values as text rather than HTML', () => {
    expect(page).toContain('textContent');
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('insertAdjacentHTML');
  });

  it('keeps memory grants separate instead of inventing an aggregate grant API', () => {
    expect(html).toContain('캐릭터별 공개 grant는 별도 authority');
    expect(client).not.toContain('access-grants');
    expect(client).not.toContain('readAccessGrants');
  });
});
