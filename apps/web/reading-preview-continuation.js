import { resolveReadingDetailRoute } from './reading-detail-route.js';
import { resolveSajuButtonEngineRequest } from './reading-saju-engine-request.js';

const ADMITTED_PREVIEW_TEXTS = new Set(['전체 사주', '직업운', '재물운', '연애운', '사업운']);
const CANONICAL_ORIGIN = 'https://myeongha.local';

function admittedPreviewHref(routeSearch) {
  const params = routeSearch instanceof URLSearchParams ? routeSearch : new URLSearchParams(routeSearch);
  if (params.has('reader') || params.has('character') || params.has('readingId')) return null;
  if ([...params.keys()].some((key) => key !== 'topic' && key !== 'scope')) return null;
  if (params.getAll('topic').length !== 1 || params.getAll('scope').length > 1) return null;
  const route = resolveReadingDetailRoute(params);
  if (!route.valid) return null;
  const engine = resolveSajuButtonEngineRequest(route);
  if (engine.state !== 'ready' || !ADMITTED_PREVIEW_TEXTS.has(engine.readingText)) return null;
  const allowed = new URLSearchParams({ topic: route.topic });
  if (params.has('scope')) allowed.set('scope', route.scope);
  return `reading-detail.html?${allowed.toString()}`;
}

/**
 * Navigation-only return path, not Reading admission or user-data authority.
 * The source Reading gate still decides whether a preview can be delivered.
 */
export function previewSetupHrefV1(detailSearch) {
  const href = admittedPreviewHref(detailSearch);
  return href ? `reading.html?next=${encodeURIComponent(href)}` : 'reading.html';
}

export function resumePreviewHrefV1(sajuPageSearch) {
  const params = sajuPageSearch instanceof URLSearchParams ? sajuPageSearch : new URLSearchParams(sajuPageSearch);
  if ([...params.keys()].some((key) => key !== 'next') || params.getAll('next').length !== 1) return null;
  const target = params.get('next');
  if (!target || target.startsWith('//') || target.startsWith('/') || target.includes('#')) return null;
  let url;
  try { url = new URL(target, CANONICAL_ORIGIN); } catch { return null; }
  if (url.origin !== CANONICAL_ORIGIN || url.pathname !== '/reading-detail.html') return null;
  return admittedPreviewHref(url.searchParams);
}
