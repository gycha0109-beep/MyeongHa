// Product web document errors only. API and domain-specific failures keep their
// original JSON contract, authentication authority and retry/settlement state.
export const WEB_DOCUMENT_ERROR_COPY_V1 = Object.freeze({
  404: Object.freeze({
    title: '페이지를 찾을 수 없습니다.',
    description: '요청하신 페이지가 없거나 주소가 변경되었을 수 있습니다.',
  }),
  500: Object.freeze({
    title: '일시적인 오류가 발생했습니다.',
    description: '페이지를 표시하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
  501: Object.freeze({
    title: '현재 지원하지 않는 기능입니다.',
    description: '요청하신 기능은 아직 제공되지 않습니다.',
  }),
  502: Object.freeze({
    title: '서비스 연결에 문제가 발생했습니다.',
    description: '요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
  503: Object.freeze({
    title: '일시적으로 이용할 수 없습니다.',
    description: '현재 페이지를 표시할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  }),
  504: Object.freeze({
    title: '응답이 지연되고 있습니다.',
    description: '요청한 페이지의 응답이 늦어지고 있습니다. 다시 시도해 주세요.',
  }),
});

const DEFAULT_TITLE = '페이지를 찾을 수 없습니다.';
const DEFAULT_DESCRIPTION = '요청하신 페이지가 없거나 주소가 변경되었을 수 있습니다.';

export function isPublicWebDocumentRequestV1(request) {
  if (!request || (request.method !== 'GET' && request.method !== 'HEAD')) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  // Even if this helper were accidentally called from an API branch, an
  // encoded/variant API root must never receive a document instead of JSON.
  const isApiRootSegment = (segment) => {
    if (segment.slice(0, 3).toLowerCase() !== 'api') return false;
    const suffix = segment.slice(3, 4);
    return suffix === '' || ['/', '\\', '.', ';', '%'].includes(suffix);
  };
  let first = url.pathname.split('/')[1] ?? '';
  for (let i = 0; i < 4; i += 1) {
    if (isApiRootSegment(first)) return false;
    if (!first.includes('%')) break;
    try {
      const decoded = decodeURIComponent(first);
      if (decoded === first) break;
      first = decoded;
    } catch { return false; }
  }
  if (isApiRootSegment(first)) return false;
  const accept = request.headers.get('accept') ?? '';
  return request.headers.get('sec-fetch-mode') === 'navigate'
    || request.headers.get('sec-fetch-dest') === 'document'
    || /(?:^|,)\s*text\/html(?:\s*;|\s*,|\s*$)/iu.test(accept)
    || /\.html?$/iu.test(url.pathname);
}

export async function renderPublicWebErrorResponseV1({ request, response, assets }) {
  if (!response || !Object.hasOwn(WEB_DOCUMENT_ERROR_COPY_V1, response.status)
      || !isPublicWebDocumentRequestV1(request) || typeof assets?.fetch !== 'function') {
    return response;
  }
  try {
    // Internal asset fetch has no incoming credentials, query or headers.
    const templateRequest = new Request(new URL('/error.html', request.url), { method: 'GET' });
    const templateResponse = await assets.fetch(templateRequest);
    if (templateResponse.status !== 200) return response;
    const template = await templateResponse.text();
    const expected = [
      'data-error-status="404"',
      '<span data-error-code>404</span>',
      '<h1 data-error-title>' + DEFAULT_TITLE + '</h1>',
      '<p data-error-description>' + DEFAULT_DESCRIPTION + '</p>',
    ];
    if (!expected.every(text => template.includes(text))) return response;
    const code = response.status;
    const copy = WEB_DOCUMENT_ERROR_COPY_V1[code];
    const html = template
      .replace(expected[0], 'data-error-status="' + code + '"')
      .replace(expected[1], '<span data-error-code>' + code + '</span>')
      .replace(expected[2], '<h1 data-error-title>' + copy.title + '</h1>')
      .replace(expected[3], '<p data-error-description>' + copy.description + '</p>');
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!headers.has('Content-Security-Policy')) {
      headers.set('Content-Security-Policy',
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'");
    }
    for (const key of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified']) headers.delete(key);
    return new Response(request.method === 'HEAD' ? null : html, {
      status: code,
      headers,
    });
  } catch {
    // If the error template is unavailable, keep the original HTTP response.
    return response;
  }
}
