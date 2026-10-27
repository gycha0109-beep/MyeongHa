import { randomUUID } from 'node:crypto';
const origin = 'https://myeongha.gycha0109.workers.dev';
const recipient = 'gycha0109@gmail.com';
const expectedVersion = process.env.CLOUDFLARE_EXPECTED_WORKER_VERSION;
const maxMs = 12000;
function requireTrue(test, message) { if (!test) throw Error(message); }
async function call(path, init = {}) {
  requireTrue(path.startsWith('/') && !path.startsWith('//'), 'INVALID_PATH');
  const response = await fetch(origin + path, {
    redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(maxMs), ...init,
    headers: { Accept: 'application/json', ...(init.headers || {}) },
  });
  requireTrue(response.headers.get('x-myeongha-worker-version') === expectedVersion,
    'WORKER_VERSION_CHANGED');
  requireTrue(response.headers.get('cache-control')?.includes('no-store'),
    'MISSING_NO_STORE');
  return response;
}
async function body(response) {
  const text = await response.text();
  requireTrue(text.length <= 4096, 'UNEXPECTED_LARGE_RESPONSE');
  try { return JSON.parse(text); } catch { throw Error('INVALID_RESPONSE_JSON'); }
}
async function run() {
  requireTrue(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(expectedVersion || ''),
    'MISSING_PINNED_WORKER_VERSION');
  requireTrue(process.env.MYEONGHA_CONTACT_LIVE_CONFIRM === 'SEND_ONE_CONTACT_TEST',
    'LIVE_SEND_NOT_CONFIRMED');
  const me = await call('/api/health');
  requireTrue(me.status === 200, 'HEALTH_NOT_READY');
  const method = await call('/api/contact', { method: 'GET' });
  requireTrue(method.status === 405 && method.headers.get('allow') === 'POST',
    'CONTACT_ROUTE_NOT_DEPLOYED');
  const anonymous = await call('/api/contact', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
  requireTrue(anonymous.status === 401, 'CONTACT_AUTH_FENCE_NOT_READY');
  const bootstrap = await call('/api/session/bootstrap', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}',
  });
  requireTrue(bootstrap.status === 200, 'GUEST_BOOTSTRAP_FAILED_' + bootstrap.status);
  const b = await body(bootstrap);
  const token = b?.data?.guestSession?.bearerToken || b?.guestSession?.bearerToken;
  requireTrue(typeof token === 'string' && token.length >= 20, 'GUEST_TOKEN_MISSING');
  const submissionId = randomUUID();
  const send = await call('/api/contact', {
    method: 'POST',
    headers: {
      Origin: origin, 'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      submissionId, category: 'other', name: '명하 운영 검증',
      email: recipient, subject: '문의 메일 발송 경로 검증',
      message: '명하 단일 Cloudflare Worker 문의 전송 및 Reply-To 확인을 위한 1회 테스트입니다.',
      consent: true, company: '',
    }),
  });
  const result = await body(send);
  requireTrue(send.status === 200 && result.ok === true && result.code === 'SENT',
    'CONTACT_MAIL_NOT_SENT_' + send.status + '_' + (result.code || 'UNKNOWN'));
  console.log(JSON.stringify({ status: 'RESEND_ACCEPTED', submissionId,
    recipient, workerVersion: expectedVersion, gmailDelivered: 'NOT_VERIFIED' }));
}
run().catch(error => {
  console.error('CONTACT_LIVE_GATE_FAILED: ' + (error instanceof Error ? error.message : 'UNKNOWN'));
  process.exitCode = 1;
});
