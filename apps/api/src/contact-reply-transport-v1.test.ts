import { describe, expect, it, vi } from 'vitest';
import { sendContactReplyV1 } from './contact-reply-transport-v1.js';

const command = {
  inquiryId: '37735bc7-46e0-451e-abbd-ebb8e6da88e9',
  replyId: 'd072c311-56e3-46a2-9544-6f0489ff169d',
  customerEmail: 'customer@example.com',
  subject: '문의 제목',
  message: '안녕하세요. 문의하신 내용에 답변드립니다.',
};
const env = { RESEND_API_KEY: 're_fake', CONTACT_REPLY_FROM_EMAIL: 'support@example.com', CONTACT_REPLY_ENABLED: 'true' };

describe('contact reply transport (not publicly routed)', () => {
  it('fails closed before domain verification / activation', async () => {
    const send = vi.fn();
    expect(await sendContactReplyV1({}, command, send)).toEqual({ ok: false, code: 'REPLY_DISABLED' });
    expect(await sendContactReplyV1({ ...env, CONTACT_REPLY_FROM_EMAIL: 'onboarding@resend.dev' }, command, send))
      .toEqual({ ok: false, code: 'REPLY_DISABLED' });
    expect(send).not.toHaveBeenCalled();
  });
  it('sends to customer from official sender without exposing private Gmail', async () => {
    const send = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.from).toBe('support@example.com');
      expect(body.to).toEqual(['customer@example.com']);
      expect(JSON.stringify(body)).not.toContain('gycha0109@gmail.com');
      expect(init.headers).toMatchObject({ 'Idempotency-Key': `myeongha-contact-reply-${command.replyId}` });
      return Response.json({ id: 'resend-reply-id' });
    });
    expect(await sendContactReplyV1(env, command, send)).toEqual({ ok: true, providerId: 'resend-reply-id' });
    expect(send).toHaveBeenCalledOnce();
  });
  it('rejects invalid destination, subject and reply ID', async () => {
    const send = vi.fn();
    for (const bad of [
      { ...command, customerEmail: 'bad\r\nBcc:evil@example.com' },
      { ...command, subject: 'bad\nBcc: evil' },
      { ...command, replyId: 'not-a-uuid' },
    ]) expect(await sendContactReplyV1(env, bad, send)).toEqual({ ok: false, code: 'INVALID_REPLY' });
    expect(send).not.toHaveBeenCalled();
  });
  it('does not report success on provider error', async () => {
    expect(await sendContactReplyV1(env, command, async () => new Response('fail', { status: 403 })))
      .toEqual({ ok: false, code: 'DELIVERY_FAILED' });
  });
});
