/**
 * Contact reply transport, deliberately not exposed as a public route.
 * A future owner-only controller must verify owner authority before calling.
 * No sending is possible until an authenticated domain sender is configured.
 */
export interface ContactReplyEnvironmentV1 {
  readonly RESEND_API_KEY?: string;
  readonly CONTACT_REPLY_FROM_EMAIL?: string;
  readonly CONTACT_REPLY_ENABLED?: string;
}
export interface ContactReplyCommandV1 {
  readonly inquiryId: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly message: string;
  readonly replyId: string;
}
export type ContactReplyResultV1 =
  | { readonly ok: true; readonly providerId: string }
  | { readonly ok: false; readonly code: 'REPLY_DISABLED' | 'INVALID_REPLY' | 'DELIVERY_FAILED' };

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const clean = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 &&
  value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const validEmail = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 254 && EMAIL.test(value) &&
  !/[\r\n]/u.test(value);

export async function sendContactReplyV1(
  env: ContactReplyEnvironmentV1,
  command: ContactReplyCommandV1,
  sendFetch: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<ContactReplyResultV1> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const sender = env.CONTACT_REPLY_FROM_EMAIL?.trim();
  // The default Resend sandbox sender must never be used for customer replies.
  if (env.CONTACT_REPLY_ENABLED !== 'true' || !apiKey || !validEmail(sender) ||
      sender.toLowerCase().endsWith('@resend.dev')) {
    return { ok: false, code: 'REPLY_DISABLED' };
  }
  if (!UUID.test(command.inquiryId) || !UUID.test(command.replyId) ||
      !validEmail(command.customerEmail) ||
      !clean(command.subject, 120) || !clean(command.message, 4000)) {
    return { ok: false, code: 'INVALID_REPLY' };
  }
  try {
    const response = await sendFetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `myeongha-contact-reply-${command.replyId}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [command.customerEmail],
        subject: `Re: ${command.subject}`,
        text: `${command.message}\n\n문의 접수 ID: ${command.inquiryId}`,
      }),
    });
    if (!response.ok) return { ok: false, code: 'DELIVERY_FAILED' };
    const result: unknown = await response.json();
    if (typeof result !== 'object' || result === null ||
        typeof (result as { id?: unknown }).id !== 'string' ||
        !(result as { id: string }).id.trim()) {
      return { ok: false, code: 'DELIVERY_FAILED' };
    }
    return { ok: true, providerId: (result as { id: string }).id };
  } catch {
    return { ok: false, code: 'DELIVERY_FAILED' };
  }
}
