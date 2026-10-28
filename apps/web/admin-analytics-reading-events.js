import { initializeMyeonghaAnalyticsV1, mountMyeonghaAnalyticsConsentV1 } from './admin-analytics-collector.js';

export const OFFICIAL_READING_RENDERED_EVENT_V1 = 'myeongha:official-reading-rendered';

/** Explicitly installed only with an approved and consent-gated collector.
 * Official records emit a DOM presentation signal; browser events remain
 * client intent and can never establish payment or Reading completion.
 */
export function bindApprovedReadingResultViewV1({ collector, documentImpl } = {}) {
  if (!collector || collector.status === 'disabled') return null;
  if (typeof collector.track !== 'function' || !documentImpl ||
      typeof documentImpl.addEventListener !== 'function' ||
      typeof documentImpl.removeEventListener !== 'function') return null;
  const recordView = () => {
    // Never send a Reading ID, birth input, result text, URL or user identifier.
    void Promise.resolve(collector.track('RESULT_VIEWED', {pageKey:'official_reading'})).catch(() => undefined);
  };
  documentImpl.addEventListener(OFFICIAL_READING_RENDERED_EVENT_V1, recordView);
  return () => documentImpl.removeEventListener(OFFICIAL_READING_RENDERED_EVENT_V1, recordView);
}

/** Explicit host-only activation seam. Supplying no approved policy leaves the
 * page inert. On an approved page, a user can grant or revoke consent, and an
 * existing server-verified consent can optionally be restored for this tab.
 * Neither installation nor restoration emits a Reading result view by itself. */
export function installApprovedReadingAnalyticsV1(options={}) {
  const collector=mountMyeonghaAnalyticsConsentV1(options);
  if(!collector)return null;
  const doc=options.documentImpl??document;
  const unbind=bindApprovedReadingResultViewV1({collector,documentImpl:doc});
  if(options.restoreOnMount===true && collector.status!=='disabled') {
    void Promise.resolve(collector.restoreConsent()).catch(()=>undefined);
  }
  return Object.freeze({collector,dispose:unbind??(()=>undefined)});
}

// The public Reading page is deliberately not opted in. Importing this module
// neither creates identifiers nor starts a session or transmits telemetry.
// An explicitly approved and consented runtime can install the binding later.
export const readingAnalytics = initializeMyeonghaAnalyticsV1();
if (typeof document !== 'undefined') {
  bindApprovedReadingResultViewV1({collector:readingAnalytics,documentImpl:document});
}
