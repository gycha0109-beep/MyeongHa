import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';
import { formatMobileUiCopy, translateMobileUiCopy } from '../../ui/mobile-ui-copy.js';

/** Home uses the same approved four-pillar wording as Saju.
 * Only formats server-derived calculation completeness; never infers luck or interpretation.
 */
export function formatMobileHomeCompletenessV1(
  fullyResolved: boolean,
  resolvedPillarCount: number,
  locale: MobileUiLocale = 'ko-KR',
): string {
  if (fullyResolved) return translateMobileUiCopy('네 기둥 계산 완료', locale);
  return formatMobileUiCopy('{count}/4 기둥 확정', { count: String(resolvedPillarCount) }, locale);
}
