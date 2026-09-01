import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const webRoot = join(root, 'apps', 'web');
const html = readFileSync(join(webRoot, 'birth.html'), 'utf8');
const client = readFileSync(join(webRoot, 'birth-runtime-client.js'), 'utf8');
const page = readFileSync(join(webRoot, 'birth-page.js'), 'utf8');
const server = readFileSync(join(root, 'apps', 'api', 'src', 'birth-profile-create-command.ts'), 'utf8');

describe('web Birth Profile create authority boundary', () => {
  it('removes the old demo identity and fabricated location defaults', () => {
    expect(html).not.toContain('John Doe 03');
    expect(html).not.toContain('UI DEMO');
    expect(html).not.toContain('대한민국</option>');
    expect(html).not.toContain('서울특별시</option>');
    expect(html).not.toContain('서버로 전송하거나 저장하지 않습니다');
  });

  it('binds to the canonical Birth Profile create endpoint with same-origin credentials', () => {
    expect(server).toContain('Persistence authority for POST /api/birth-profiles only.');
    expect(client).toContain("const DEFAULT_ENDPOINT = '/api/birth-profiles'");
    expect(client).toContain("method: 'POST'");
    expect(client).toContain("'Content-Type': 'application/json'");
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("cache: 'no-store'");
  });

  it('constructs only the supported Birth Profile request fields in the browser', () => {
    expect(page).toContain('label: null');
    expect(page).toContain('calendarType');
    expect(page).toContain('birthDate');
    expect(page).toContain('birthTime');
    expect(page).toContain('timeKnown');
    expect(page).toContain('isLeapMonth');
    expect(page).toContain('sex:');
    expect(page).not.toContain('subjectId');
    expect(page).not.toContain('authUserId');
    expect(page).not.toContain('inputHash');
    expect(page).not.toContain('birthProfileId:');
    expect(page).not.toContain('revisionId:');
    expect(page).not.toContain('birthPlace');
    expect(page).not.toContain('location');
  });

  it('preserves unknown birth time as null instead of inventing a time', () => {
    expect(html).toContain('id="birth-time" type="time"');
    expect(html).toContain('id="birth-time-unknown"');
    expect(page).toContain('const timeKnown = !byId(\'birth-time-unknown\').checked');
    expect(page).toContain("const birthTime = timeKnown ? byId('birth-time').value : null");
    expect(page).toContain("if (unknown.checked) time.value = ''");
  });

  it('keeps lunar leap-month and sex values explicit without hidden defaults', () => {
    expect(html).toContain('value="solar"');
    expect(html).toContain('value="lunar"');
    expect(html).toContain('id="birth-leap-month"');
    expect(html).toContain('<option value="">선택하지 않음</option>');
    expect(page).toContain("calendarType === 'lunar' ? byId('birth-leap-month').checked : false");
    expect(page).toContain("? sexValue : null");
  });

  it('unwraps only the shared success envelope and reads public error codes from the error envelope', () => {
    expect(client).toContain("from './api-envelope.js'");
    expect(client).toContain('unwrapApiSuccessEnvelope(envelope)');
    expect(client).toContain('readApiErrorCode(payload)');
    expect(client).toContain('WebApiEnvelopeError');
  });

  it('fails closed unless the server returns revision 1 with server-owned identities', () => {
    expect(client).toContain('WEB_BIRTH_SESSION_REQUIRED');
    expect(client).toContain('WEB_BIRTH_INVALID_REQUEST');
    expect(client).toContain('WEB_BIRTH_NOT_AVAILABLE');
    expect(client).toContain('WEB_BIRTH_MALFORMED_RESPONSE');
    expect(client).toContain('revisionNo !== 1');
    expect(page).toContain('서버 command가 성공하기 전에는 저장된 것으로 표시하지 않습니다.');
  });

  it('renders server outcomes with text APIs rather than HTML injection', () => {
    expect(page).toContain('textContent');
    expect(page).not.toContain('innerHTML');
    expect(page).not.toContain('insertAdjacentHTML');
  });
});
