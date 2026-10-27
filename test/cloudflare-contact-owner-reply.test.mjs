import { describe, expect, it, vi } from 'vitest';
import { tryHandleCloudflareContactOwnerReplyV1 } from '../workers/cloudflare-contact-owner-reply.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import { handleCloudflareStaticPreviewRequest } from '../workers/cloudflare-static-preview.mjs';

const origin = 'https://myeongha.gycha0109.workers.dev';
const route = { id: 'rewrite.contact.owner-reply' };
const env = {
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_WORKERS_DEV_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.real-domain.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
  RESEND_API_KEY: 're_test',
  CONTACT_REPLY_ENABLED: 'enabled-with-verified-domain-v1',
  CONTACT_REPLY_FROM_EMAIL: 'support@myeongha.example',
  CONTACT_REPLY_VERIFIED_DOMAIN: 'myeongha.example',
};
const data = {
  submissionId: 'd072c311-56e3-46a2-9544-6f0489ff169d',
  replyId: 'c0255d26-9324-49f4-85de-3ee3c30db1b5',
  recipientEmail: 'customer@example.net',
  originalSubject: '결제 확인 요청',
  message: '안녕하세요. 문의 내용에 대한 안내드립니다.',
  confirmRecipient: true,
};
function request(path = '/api/admin/contact/reply', method = 'POST', extra = {}) {
  return new Request(origin + path, {
    method, headers: { Origin: origin, Authorization: 'Bearer member-token',
      'Content-Type': 'application/json', ...extra },
    ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
  });
}
describe('Cloudflare owner contact reply adapter', () => {
  it('registers a distinct private route but deny-only preview never admits it', () => {
    expect(matchCloudflareApiRoute('/api/admin/contact/reply')?.id).toBe(route.id);
    expect(handleCloudflareStaticPreviewRequest(request()).status).toBe(404);
  });
  it('remains disabled on worker with no domain before DB/rate/provider access', async () => {
    const rateLimit = vi.fn(async () => null);
    const verifyOwner = vi.fn(async () => true);
    const sendFetch = vi.fn(async () => Response.json({ id: 'must-not-send' }));
    const response = await tryHandleCloudflareContactOwnerReplyV1(request(),
      { ...env, CONTACT_REPLY_ENABLED: undefined }, route, { rateLimit, verifyOwner, sendFetch });
    expect(response.status).toBe(503);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(verifyOwner).not.toHaveBeenCalled();
    expect(sendFetch).not.toHaveBeenCalled();
  });
  it('only sends after positive owner admission and rate limit', async () => {
    const provider = vi.fn(async () => Response.json({ id: 'provider-receipt' }));
    const denied = await tryHandleCloudflareContactOwnerReplyV1(request(), env, route,
      { rateLimit: async () => null, verifyOwner: async () => false, sendFetch: provider });
    expect(denied.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    const admitted = await tryHandleCloudflareContactOwnerReplyV1(request(), env, route,
      { rateLimit: async () => null, verifyOwner: async () => true, sendFetch: provider });
    expect(admitted.status).toBe(200);
    expect((await admitted.json()).code).toBe('REPLY_SENT');
    expect(provider).toHaveBeenCalledOnce();
    const blocked = await tryHandleCloudflareContactOwnerReplyV1(request(), env, route,
      { rateLimit: async () => Response.json({ ok: false, code: 'RATE_LIMITED' }, {status:429}),
        verifyOwner: async () => true, sendFetch: provider });
    expect(blocked.status).toBe(429);
    expect(provider).toHaveBeenCalledOnce();
  });
  it('rejects cross-origin, foreign query, wrong method, and anonymous sessions', async () => {
    const provider = vi.fn();
    for (const sample of [
      request('/api/admin/contact/reply?override=1'),
      request('/api/admin/contact/reply', 'GET'),
      request('/api/admin/contact/reply', 'POST', { Origin: 'https://evil.invalid' }),
      request('/api/admin/contact/reply', 'POST', { Authorization: '' }),
    ]) {
      const response = await tryHandleCloudflareContactOwnerReplyV1(sample, env, route,
        { rateLimit: async () => null, verifyOwner: async () => true, sendFetch: provider });
      expect([401,403,404,405]).toContain(response.status);
    }
    expect(provider).not.toHaveBeenCalled();
  });
});
