export interface ContactInquiryEnvironmentV1 {
  readonly RESEND_API_KEY?: string | undefined;
  readonly CONTACT_FROM_EMAIL?: string | undefined;
  readonly CONTACT_TO_EMAIL?: string | undefined;
}

interface ContactInquiryOptionsV1 {
  readonly request: Request;
  readonly env: ContactInquiryEnvironmentV1;
  readonly verifySession: (authorization: string) => Promise<boolean>;
  readonly sendFetch?: (url: string, init: RequestInit) => Promise<Response>;
}

const MAX_BYTES = 12_288;
const RECIPIENT = 'gycha0109@gmail.com';
const CATEGORY_LABELS: Record<string, string> = {
  service: '서비스 이용',
  payment: '결제 · 이용권',
  account: '계정 · 로그인',
  bug: '오류 신고',
  other: '기타 문의',
};

function respond(status: number, code: string, message: string): Response {
  return Response.json({ ok: status === 200, code, message }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

async function boundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BYTES) throw new Error('TOO_LARGE');
  if (!request.body) throw new Error('INVALID_BODY');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let content = '';
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) throw new Error('INVALID_BODY');
      total += item.value.byteLength;
      if (total > MAX_BYTES) throw new Error('TOO_LARGE');
      content += decoder.decode(item.value, { stream: true });
    }
    content += decoder.decode();
    return JSON.parse(content) as unknown;
  } finally {
    try { await reader.cancel(); } catch { /* best effort */ }
    try { reader.releaseLock(); } catch { /* best effort */ }
  }
}

function field(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(normalized)) return null;
  return normalized;
}

function validEmail(value: string | null): value is string {
  return value !== null &&
    value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value) &&
    !/[\r\n]/u.test(value);
}

export async function handleContactInquiryRequestV1({
  request,
  env,
  verifySession,
  sendFetch = fetch,
}: ContactInquiryOptionsV1): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, {
      status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== requestUrl.origin) {
    return respond(403, 'ORIGIN_FORBIDDEN', 'The request origin is not allowed.');
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer [^\s]+$/u.test(authorization)) {
    return respond(401, 'SESSION_REQUIRED', 'A session is required.');
  }

  try {
    if (!await verifySession(authorization)) {
      return respond(401, 'SESSION_REQUIRED', 'A valid session is required.');
    }
  } catch {
    return respond(503, 'SESSION_UNAVAILABLE', 'Session verification is unavailable.');
  }

  if (!/^application\/json(?:\s*;|\s*$)/iu.test(request.headers.get('content-type') ?? '')) {
    return respond(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON is required.');
  }

  let data: unknown;
  try {
    data = await boundedJson(request);
  } catch (error) {
    return error instanceof Error && error.message === 'TOO_LARGE'
      ? respond(413, 'BODY_TOO_LARGE', 'Inquiry exceeds the size limit.')
      : respond(400, 'INVALID_BODY', 'Invalid inquiry body.');
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return respond(400, 'INVALID_FIELDS', 'Invalid inquiry details.');
  }

  const body = data as Record<string, unknown>;
  const submissionId = field(body.submissionId, 36, 36);
  const category = field(body.category, 1, 24);
  const name = field(body.name, 1, 60);
  const email = field(body.email, 3, 254);
  const subject = field(body.subject, 4, 120);
  const message = field(body.message, 10, 4000);

  if (body.company !== '' && body.company !== undefined) {
    return respond(200, 'ACCEPTED', 'Inquiry accepted.');
  }
  if (body.consent !== true ||
      !submissionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(submissionId) ||
      !category || !Object.hasOwn(CATEGORY_LABELS, category) || !name || !validEmail(email) ||
      !subject || /[\r\n]/u.test(subject) || !message) {
    return respond(400, 'INVALID_FIELDS', 'Required inquiry details are missing or invalid.');
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.CONTACT_FROM_EMAIL?.trim();
  const to = env.CONTACT_TO_EMAIL?.trim() || RECIPIENT;
  if (!apiKey || !from || !validEmail(to) ||
      !/^(?:[^<>\r\n]+ <)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/u.test(from)) {
    return respond(503, 'MAIL_NOT_CONFIGURED', 'Inquiry delivery is not configured.');
  }

  const contents = [
    '명하 서비스 문의', '',
    `유형: ${CATEGORY_LABELS[category]}`,
    `이름: ${name}`,
    `답변 이메일: ${email}`,
    `제목: ${subject}`, '',
    message, '',
    `접수 요청 ID: ${submissionId}`,
  ].join('\n');

  try {
    const delivery = await sendFetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'MyeongHa-Contact/1.0',
        'Idempotency-Key': `myeongha-contact-${submissionId}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: [email],
        subject: `[명하 문의 · ${CATEGORY_LABELS[category]}] ${subject}`,
        text: contents,
      }),
    });

    if (!delivery.ok) return respond(502, 'MAIL_DELIVERY_FAILED', 'Inquiry delivery failed.');
    const result: unknown = await delivery.json();
    if (typeof result !== 'object' || result === null ||
        typeof (result as { id?: unknown }).id !== 'string') {
      return respond(502, 'MAIL_DELIVERY_FAILED', 'Inquiry delivery was not confirmed.');
    }

    return respond(200, 'SENT', 'Inquiry sent.');
  } catch {
    return respond(502, 'MAIL_DELIVERY_FAILED', 'Inquiry delivery could not be confirmed.');
  }
}