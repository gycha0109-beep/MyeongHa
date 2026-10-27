import { describe, expect, it, vi } from 'vitest';
import { handleContactOwnerReplyRequestV1 } from './contact-owner-reply-http.js';

const enabled = {
  RESEND_API_KEY: 're_test',
  CONTACT_REPLY_ENABLED: 'enabled-with-verified-domain-v1',
  CONTACT_REPLY_FROM_EMAIL: 'support@myeongha.example',
  CONTACT_REPLY_VERIFIED_DOMAIN: 'myeongha.example',
};
const input = {
  submissionId: 'd072c311-56e3-46a2-9544-6f0489ff169d',
  replyId: 'c0255d26-9324-49f4-85de-3ee3c30db1b5',
  recipientEmail: 'customer@example.net',
  originalSubject: '결제 오류 확인',
  message: '안녕하세요. 문의하신 결제 내역을 확인했습니다.',
  confirmRecipient: true,
};
function request(body: unknown = input, origin = 'https://myeongha.example') {
  return new Request(origin + '/api/admin/contact/reply', {
    method: 'POST',
    headers: { Origin: origin, Authorization: 'Bearer verified-member', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
describe('owner-only contact reply', () => {
  it('is disabled by default with no verification or provider egress', async () => {
    const verifyOwner = vi.fn(async () => true);
    const sendFetch = vi.fn();
    const result = await handleContactOwnerReplyRequestV1({
      request: request(), env: {}, verifyOwner, sendFetch,
    });
    expect(result.status).toBe(503);
    expect((await result.json()).code).toBe('REPLY_NOT_ENABLED');
    expect(verifyOwner).not.toHaveBeenCalled();
    expect(sendFetch).not.toHaveBeenCalled();
  });
  it('rejects test sender, personal gmail sender and domain mismatch', async () => {
    const sendFetch = vi.fn();
    for (const from of ['onboarding@resend.dev', 'gycha0109@gmail.com', 'support@other.example']) {
      const response = await handleContactOwnerReplyRequestV1({
        request: request(),
        env: { ...enabled, CONTACT_REPLY_FROM_EMAIL: from },
        verifyOwner: async () => true, sendFetch,
      });
      expect(response.status).toBe(503);
    }
    expect(sendFetch).not.toHaveBeenCalled();
  });
  it('requires canonical owner membership before delivering to one customer', async () => {
    const sendFetch = vi.fn(async () => Response.json({ id: 'provider-accepted' }));
    const denied = await handleContactOwnerReplyRequestV1({
      request: request(), env: enabled, verifyOwner: async () => false, sendFetch,
    });
    expect(denied.status).toBe(403);
    expect(sendFetch).not.toHaveBeenCalled();
    const accepted = await handleContactOwnerReplyRequestV1({
      request: request(), env: enabled, verifyOwner: async () => true, sendFetch,
    });
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).code).toBe('REPLY_SENT');
    const [, options] = sendFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(body.to).toEqual(['customer@example.net']);
    expect(body.from).toBe('명하 고객지원 <support@myeongha.example>');
    expect(body.reply_to).toEqual(['support@myeongha.example']);
    expect(body.text).toContain(input.submissionId);
    expect(JSON.stringify(body)).not.toContain('gycha0109@gmail.com');
    expect(options.headers).toMatchObject({ 'Idempotency-Key': 'myeongha-owner-reply-c0255d26-9324-49f4-85de-3ee3c30db1b5' });
  });
  it('requires recipient confirmation, prevents header injection and invalid UUID', async () => {
    const sendFetch = vi.fn();
    for (const broken of [
      { ...input, confirmRecipient: false },
      { ...input, recipientEmail: 'x@example.org\r\nBcc:fake@example.org' },
      { ...input, originalSubject: 'hello\r\nBcc:fake@example.org' },
      { ...input, submissionId: 'not-original' },
    ]) {
      const result = await handleContactOwnerReplyRequestV1({
        request: request(broken), env: enabled, verifyOwner: async () => true, sendFetch,
      });
      expect(result.status).toBe(400);
    }
    expect(sendFetch).not.toHaveBeenCalled();
  });
  it('treats provider failure, missing receipt and exceptions as non-success', async () => {
    for (const sendFetch of [
      async () => Response.json({}, { status: 500 }),
      async () => Response.json({}),
      async () => { throw Error('egress failure'); },
    ]) {
      const result = await handleContactOwnerReplyRequestV1({
        request: request(), env: enabled, verifyOwner: async () => true, sendFetch,
      });
      expect(result.status).toBe(502);
    }
  });
});
