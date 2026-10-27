import { describe, expect, it, vi } from 'vitest';
import { tryHandleCloudflareContactInquiryV1 } from '../workers/cloudflare-contact-inquiry.mjs';
import { handleCloudflareStaticPreviewRequest } from '../workers/cloudflare-static-preview.mjs';

const origin = 'https://myeongha.gycha0109.workers.dev';
const route = { id: 'rewrite.contact.inquiry' };
const env = {
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.real-domain.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
  RESEND_API_KEY: 're_test',
  CONTACT_FROM_EMAIL: 'support@example.com',
};
const payload = {
  submissionId: 'd072c311-56e3-46a2-9544-6f0489ff169d',
  category: 'bug', name: '테스터', email: 'tester@example.com',
  subject: '로그인 오류 문의', message: '로그인 화면에서 문제가 발생했습니다.',
  consent: true, company: '',
};
function request(path = '/api/contact', method = 'POST', extra = {}) {
  return new Request(origin + path, {
    method, headers: { Origin: origin, Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json', ...extra },
    ...(method === 'POST' ? {body: JSON.stringify(payload)} : {}),
  });
}
const rateLimit = vi.fn(async () => null);
const sendFetch = vi.fn(async () => Response.json({ id: 'email-provider-id' }));
const verifySession = vi.fn(async () => true);

describe('Cloudflare native contact inquiry', () => {
  it('forwards authorized, bounded inquiries to the shared sender exactly once', async () => {
    const response = await tryHandleCloudflareContactInquiryV1(request(), env, route,
      { rateLimit, verifySession, sendFetch });
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe('SENT');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(sendFetch).toHaveBeenCalledOnce();
  });
  it('blocks cross-origin, query markers, non-POST and missing authorization before sending', async () => {
    for (const sample of [
      request('/api/contact?__myeongha_contact_inquiry=1'),
      request('/api/contact', 'GET'),
      request('/api/contact', 'POST', {Origin: 'https://attacker.invalid'}),
      request('/api/contact', 'POST', {Authorization: ''}),
    ]) {
      const response = await tryHandleCloudflareContactInquiryV1(sample, env, route,
        { rateLimit, verifySession, sendFetch });
      expect([401,403,404,405]).toContain(response.status);
    }
  });
  it('does not send without a verified subject, rate admission or mail configuration', async () => {
    const unauthorized = await tryHandleCloudflareContactInquiryV1(request(), env, route,
      { rateLimit, verifySession: async () => false, sendFetch });
    expect(unauthorized.status).toBe(401);
    const limited = await tryHandleCloudflareContactInquiryV1(request(), env, route,
      { rateLimit: async () => Response.json({ok:false,error:{code:'RATE_LIMITED'}},{status:429}),verifySession,sendFetch });
    expect(limited.status).toBe(429);
    const missing = await tryHandleCloudflareContactInquiryV1(request(),
      { ...env, RESEND_API_KEY: undefined }, route, { rateLimit,verifySession,sendFetch });
    expect(missing.status).toBe(503);
  });
  it('holds the new route closed in deny-only mode', () => {
    const response = handleCloudflareStaticPreviewRequest(request());
    expect(response.status).toBe(404);
  });
  it('requires a positive shared sender receipt instead of trusting a honeypot acknowledgement', async () => {
    const botPayload = { ...payload, company: 'autofill bot' };
    const botRequest = new Request(origin + '/api/contact', {
      method: 'POST', headers: { Origin: origin, Authorization: 'Bearer valid-token',
        'Content-Type': 'application/json' }, body: JSON.stringify(botPayload),
    });
    const provider = vi.fn(async () => Response.json({ id: 'should-not-send' }));
    const response = await tryHandleCloudflareContactInquiryV1(botRequest, env, route,
      { rateLimit: async () => null, verifySession: async () => true, sendFetch: provider });
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe('ACCEPTED');
    expect(provider).not.toHaveBeenCalled();
  });

  it('keeps origin admission unavailable without the real Worker approval markers', async () => {
    const provider = vi.fn(async () => Response.json({ id: 'should-not-send' }));
    const response = await tryHandleCloudflareContactInquiryV1(request(),
      { ...env, MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'not-approved' },
      route, { rateLimit: async () => null, verifySession: async () => true, sendFetch: provider });
    expect(response).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not claim delivery when the Resend API rejects or loses the receipt', async () => {
    for (const sendFetch of [
      async () => Response.json({ message: 'bad key' }, { status: 401 }),
      async () => Response.json({ message: 'missing delivery id' }),
      async () => { throw Error('connection failed'); },
    ]) {
      const response = await tryHandleCloudflareContactInquiryV1(request(), env, route,
        { rateLimit: async () => null, verifySession: async () => true, sendFetch });
      expect(response.status).toBe(502);
      expect((await response.json()).code).toBe('MAIL_DELIVERY_FAILED');
    }
  });

});
