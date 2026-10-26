// Browser callback host selection only. Server-side Worker admission and the
// provider's exact redirect allowlist remain the independent authorities.
const LEGACY_VERCEL_PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';
const VERCEL_PROJECT_PREVIEW_HOST = /^https:\/\/myeongha-[a-z0-9-]+-johnny-self\.vercel\.app$/u;
const CANONICAL_WORKER_ORIGINS = new Set([
  'https://myeongha.gycha0109.workers.dev',
  'https://myeongha-web.gycha0109.workers.dev',
]);

export function isCloudflareHostedAuthOriginV1(currentOrigin) {
  let url;
  try { url = new URL(currentOrigin); } catch { return false; }
  if (url.protocol !== 'https:' || url.origin !== currentOrigin ||
      url.username !== '' || url.password !== '' || url.port !== '' ||
      url.pathname !== '/' || url.search !== '' || url.hash !== '') return false;
  if (CANONICAL_WORKER_ORIGINS.has(currentOrigin)) return true;
  const hostname = url.hostname;
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/u.test(hostname) &&
    !/(?:\.workers\.dev|\.vercel\.app|\.(?:localhost|local|internal|invalid|test|example))$/u.test(hostname) &&
    !['example.com', 'example.net', 'example.org'].some(
      reserved => hostname === reserved || hostname.endsWith('.' + reserved),
    );
}

export function resolveWebSocialAuthCallbackUriV1(currentOrigin) {
  const callbackOrigin = isCloudflareHostedAuthOriginV1(currentOrigin)
    ? currentOrigin
    : currentOrigin === LEGACY_VERCEL_PRODUCTION_ORIGIN || VERCEL_PROJECT_PREVIEW_HOST.test(currentOrigin)
      ? LEGACY_VERCEL_PRODUCTION_ORIGIN : null;
  return callbackOrigin === null ? null : `${callbackOrigin}/auth.html?social=callback`;
}
