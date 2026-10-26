import { describe, expect, it, vi } from 'vitest';
import { handleContactInquiryRequestV1 } from './contact-inquiry-http.js';

const env = {
  RESEND_API_KEY: 're_test',
  CONTACT_FROM_EMAIL: 'support@example.com',
  CONTACT_TO_EMAIL: 'gycha0109@gmail.com',
};
const valid = {
  submissionId: 'd072c311-56e3-46a2-9544-6f0489ff169d',
  category: 'bug',
  name: '테스터',
  email: 'tester@example.com',
  subject: '로그인 오류 문의',
  message: '로그인 화면에서 문제가 발생했습니다.',
  consent: true,
  company: '',
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://myeongha.vercel.app/api/contact', {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('contact inquiry delivery', () => {
  it('sends only after verifying the session and preserves the reply-to address', async () => {
    const sendFetch = vi.fn<typeof fetch>(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body.to).toEqual(['gycha0109@gmail.com']);
      expect(body.reply_to).toEqual(['tester@example.com']);
      expect(body.subject).toContain('로그인 오류 문의');
      expect(options?.headers).toMatchObject({ 'Idempotency-Key': 'myeongha-contact-d072c311-56e3-46a2-9544-6f0489ff169d' });
      return Response.json({ id: 'resend-id' });
    });
    const result = await handleContactInquiryRequestV1({
      request: request(valid), env, verifySession: async () => true, sendFetch,
    });
    expect(result.status).toBe(200);
    expect(sendFetch).toHaveBeenCalledOnce();
  });

  it('rejects unauthorized senders without calling the email provider', async () => {
    const sendFetch = vi.fn<typeof fetch>();
    const result = await handleContactInquiryRequestV1({
      request: request(valid), env, verifySession: async () => false, sendFetch,
    });
    expect(result.status).toBe(401);
    expect(sendFetch).not.toHaveBeenCalled();
  });

  it('rejects malicious origin and invalid content', async () => {
    const sendFetch = vi.fn<typeof fetch>();
    const origin = await handleContactInquiryRequestV1({
      request: request(valid, { Origin: 'https://untrusted.example' }),
      env, verifySession: async () => true, sendFetch,
    });
    expect(origin.status).toBe(403);
    const malformed = await handleContactInquiryRequestV1({
      request: request({ ...valid, subject: 'hello\r\nBcc:evil@example.com' }),
      env, verifySession: async () => true, sendFetch,
    });
    expect(malformed.status).toBe(400);
    expect(sendFetch).not.toHaveBeenCalled();
  });

  it('fails closed when mail credentials are unavailable', async () => {
    const result = await handleContactInquiryRequestV1({
      request: request(valid), env: {}, verifySession: async () => true,
    });
    expect(result.status).toBe(503);
  });
});