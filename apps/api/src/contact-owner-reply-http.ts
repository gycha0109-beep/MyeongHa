// Owner-only support reply. Intentionally independent of public inquiry reception.
// No domain -> no send. No mailbox, ticket ledger, or client-provided sender identity.
export interface ContactOwnerReplyEnvironmentV1 {
  readonly RESEND_API_KEY?: string;
  readonly CONTACT_REPLY_ENABLED?: string;
  readonly CONTACT_REPLY_FROM_EMAIL?: string;
  readonly CONTACT_REPLY_VERIFIED_DOMAIN?: string;
}
interface Options {
  request: Request;
  env: ContactOwnerReplyEnvironmentV1;
  verifyOwner: (authorization: string) => Promise<boolean>;
  sendFetch?: (url: string, init: RequestInit) => Promise<Response>;
}
const MAX_BYTES = 12_288;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const DOMAIN = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u;

const reply = (status: number, code: string) => Response.json(
  { ok: status === 200, code },
  { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
);

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length >= min && v.length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(v) ? v : null;
}

async function boundedBody(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared > MAX_BYTES) throw Error('BODY_TOO_LARGE');
  if (!request.body) throw Error('INVALID_BODY');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) throw Error('INVALID_BODY');
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw Error('BODY_TOO_LARGE');
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } finally {
    try { await reader.cancel(); } catch { /* no-op */ }
    try { reader.releaseLock(); } catch { /* no-op */ }
  }
}

function enabledSender(env: ContactOwnerReplyEnvironmentV1): string | null {
  if (env.CONTACT_REPLY_ENABLED !== 'enabled-with-verified-domain-v1') return null;
  const domain = env.CONTACT_REPLY_VERIFIED_DOMAIN?.trim().toLowerCase() ?? '';
  const from = env.CONTACT_REPLY_FROM_EMAIL?.trim().toLowerCase() ?? '';
  if (!DOMAIN.test(domain) || !EMAIL.test(from) || /[\r\n]/u.test(from) ||
      ['resend.dev', 'gmail.com', 'googlemail.com'].includes(domain) ||
      from.split('@')[1] !== domain || !env.RESEND_API_KEY?.trim()) return null;
  return from;
}

export async function handleContactOwnerReplyRequestV1({
  request, env, verifyOwner, sendFetch = fetch,
}: Options): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, {
    status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
  const url = new URL(request.url);
  if (url.search || url.hash) return reply(404, 'NOT_FOUND');
  if (request.headers.get('origin') !== url.origin) return reply(403, 'ORIGIN_FORBIDDEN');
  const sender = enabledSender(env);
  if (!sender) return reply(503, 'REPLY_NOT_ENABLED');
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [^\s]+$/u.test(authorization)) return reply(401, 'SESSION_REQUIRED');
  try {
    if (!await verifyOwner(authorization)) return reply(403, 'OWNER_REQUIRED');
  } catch {
    return reply(503, 'OWNER_AUTH_UNAVAILABLE');
  }
  if (!/^application\/json(?:\s*;|\s*$)/iu.test(request.headers.get('content-type') ?? '')) {
    return reply(415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  let parsed: unknown;
  try { parsed = await boundedBody(request); }
  catch (e) { return reply(e instanceof Error && e.message === 'BODY_TOO_LARGE' ? 413 : 400,
    e instanceof Error && e.message === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'INVALID_BODY'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(400, 'INVALID_FIELDS');
  const data = parsed as Record<string, unknown>;
  const submissionId = text(data.submissionId, 36, 36);
  const replyId = text(data.replyId, 36, 36);
  const recipientEmail = text(data.recipientEmail, 3, 254);
  const originalSubject = text(data.originalSubject, 4, 120);
  const message = text(data.message, 10, 4000);
  if (!submissionId || !UUID_V4.test(submissionId) || !replyId || !UUID_V4.test(replyId) ||
      !recipientEmail || !EMAIL.test(recipientEmail) || /[\r\n]/u.test(recipientEmail) ||
      !originalSubject || /[\r\n]/u.test(originalSubject) || !message ||
      data.confirmRecipient !== true) return reply(400, 'INVALID_FIELDS');

  try {
    const result = await sendFetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'MyeongHa-OwnerReply/1.0',
        'Idempotency-Key': `myeongha-owner-reply-${replyId}`,
      },
      body: JSON.stringify({
        from: `명하 고객지원 <${sender}>`,
        to: [recipientEmail],
        reply_to: [sender],
        subject: `[명하 답변] Re: ${originalSubject}`,
        text: [
          '안녕하세요. 명하 고객지원입니다.', '',
          message, '',
          `문의 접수 ID: ${submissionId}`,
          '본 메일에 답장하시면 명하 고객지원 주소로 회신됩니다.',
        ].join('\n'),
      }),
    });
    if (!result.ok) return reply(502, 'REPLY_DELIVERY_FAILED');
    const body: unknown = await result.json();
    if (!body || typeof body !== 'object' ||
        typeof (body as { id?: unknown }).id !== 'string' ||
        (body as { id: string }).id.trim() === '') return reply(502, 'REPLY_DELIVERY_FAILED');
    return reply(200, 'REPLY_SENT');
  } catch { return reply(502, 'REPLY_DELIVERY_FAILED'); }
}
