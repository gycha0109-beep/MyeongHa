import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const webRoot = join(root, 'apps', 'web');
const myHtml = readFileSync(join(webRoot, 'my.html'), 'utf8');
const myCss = readFileSync(join(webRoot, 'my.css'), 'utf8');
const client = readFileSync(join(webRoot, 'my-runtime-client.js'), 'utf8');
const page = readFileSync(join(webRoot, 'my-page.js'), 'utf8');
const hall = readFileSync(join(webRoot, 'hall.html'), 'utf8');
const homePage = readFileSync(join(webRoot, 'home-page.js'), 'utf8');
const reading = readFileSync(join(webRoot, 'reading.html'), 'utf8');
const profileAuthority = readFileSync(join(root, 'apps', 'api', 'src', 'subject-profile.ts'), 'utf8');

describe('web My profile authority boundary', () => {
  it('ships a real My destination in the five-part product IA', () => {
    expect(myHtml).toContain('<title>마이 · 명하</title>');
    expect(myHtml).toContain('href="product.css"');
    expect(myHtml).toContain('href="my.css"');
    expect(myHtml).toContain('src="my-page.js"');
    expect(myHtml).toContain('href="my.html" aria-current="page">마이</a>');
    expect(hall).toContain('class="product-nav-link" href="my.html">마이</a>');
    expect(hall).toContain('class="mobile-nav-link" href="my.html"');
    expect(reading).toContain('class="product-nav-link" href="my.html">마이</a>');
    expect(reading).toContain('class="mobile-nav-link" href="my.html"');
  });

  it('reads only the verified current profile surface through GET /api/me', () => {
    expect(profileAuthority).toContain("readCurrent: 'public.qry_subject_profile_current_v1'");
    expect(client).toContain("const DEFAULT_PROFILE_ENDPOINT = '/api/me'");
    expect(client).toContain("method: 'GET'");
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("cache: 'no-store'");
    expect(client).toContain("from './api-envelope.js'");
    expect(client).toContain('unwrapApiSuccessEnvelope(envelope)');
    expect(client).not.toContain('/v1/profile');
    expect(client).not.toContain('subjectId');
    expect(client).not.toContain('authUserId');
    expect(client).not.toContain('entitlement');
    expect(client).not.toContain('notification');
  });

  it('validates the bounded current-profile response before rendering', () => {
    expect(client).toContain("payload.subjectKind !== 'guest'");
    expect(client).toContain("payload.subjectKind !== 'member'");
    expect(client).toContain("payload.subjectStatus !== 'active'");
    expect(client).toContain("payload.subjectStatus !== 'deletion_pending'");
    expect(client).toContain("['displayName', 'locale', 'timezone', 'onboardingState']");
    expect(client).toContain('Date.parse(profile.updatedAt)');
    expect(client).toContain('WEB_MY_MALFORMED_PROFILE');
  });

  it('renders only fields present in the current profile response', () => {
    for (const field of [
      'displayName',
      'subjectKind',
      'subjectStatus',
      'locale',
      'timezone',
      'onboardingState',
      'updatedAt',
    ]) {
      expect(page).toContain(field);
    }
    expect(page).toContain('textContent');
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('insertAdjacentHTML');
  });

  it('does not fabricate plan, entitlement, or notification values', () => {
    expect(myHtml).toContain('알림과 이용 권한 설정은 준비 중입니다.');
    expect(myHtml).not.toContain('프리미엄');
    expect(myHtml).not.toContain('구독 중');
    expect(myHtml).not.toContain('알림 켜짐');
    expect(myHtml).not.toContain('HTTP surface');
    expect(myHtml).not.toContain('authority');
    expect(myHtml).not.toContain('contract');
  });

  it('keeps My styles self-contained rather than borrowing Home-only classes', () => {
    expect(myHtml).toContain('class="my-kicker"');
    expect(myCss).toContain('.my-kicker');
    expect(myHtml).not.toContain('class="home-kicker"');
  });

  it('aligns Home and Reading profile affordances with the My destination', () => {
    expect(hall).toContain('<span id="home-profile-name">마이</span>');
    expect(homePage).toContain("byId('home-profile-name').textContent = '마이'");
    expect(reading).not.toContain('<span>지환</span>');
    expect(reading).toContain('<span>마이</span>');
    expect(reading).toContain('href="my.html" aria-label="내 프로필"');
    expect(reading).toContain('src="reading-character.js"');
    expect(reading).toContain('data-reader="baekheon"');
  });

  it('fails closed when the current session, envelope, or profile read is unavailable', () => {
    expect(client).toContain('WEB_MY_SESSION_REQUIRED');
    expect(client).toContain('WEB_MY_PROFILE_REQUEST_FAILED');
    expect(client).toContain('WEB_MY_MALFORMED_PROFILE');
    expect(client).toContain('WebApiEnvelopeError');
    expect(page).toContain('내 정보를 보려면 현재 세션이 필요합니다.');
    expect(page).toContain('확인되지 않은 계정 정보를 대신 표시하지 않습니다.');
  });
});
