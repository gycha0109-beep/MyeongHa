import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PORTONE_V2_BROWSER_CHECKOUT_PREPARATION_V1 } from '../apps/web/src/commerce/portone-v2-browser-checkout-preparation.js';
import { PORTONE_V2_BROWSER_REQUEST_COMPOSER_V1 } from '../apps/web/src/commerce/portone-v2-browser-request-composer.js';
import { PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1 } from '../apps/web/src/commerce/portone-v2-browser-sdk-execution-guard.js';

/**
 * Legal L4 release hold: purchase-specific digital-content preview, withdrawal
 * disclosure, customer request route and server delivery evidence are not yet
 * signed off. This guards the currently approved "public checkout OFF" state.
 *
 * It does not implement a second Commerce engine or waive statutory rights.
 */
describe('LEGAL L4: consumer checkout stays unavailable before legal notices are ready', () => {
  it('shows the 19+ paid-service restriction in Web and Native Reader entry', () => {
    const web = readFileSync(new URL('../apps/web/src/reading-detail/ReadingDetailPage.tsx', import.meta.url), 'utf8');
    const native = readFileSync(new URL('../apps/mobile/src/features/reading/MobileOfficialReadingReaderEntry.tsx', import.meta.url), 'utf8');
    const policy = '유료 해설 구매는 만 19세 이상만 가능합니다. 현재 공개 결제는 제공하지 않습니다.';
    expect(web).toContain('data-legal-reading-paid-age-hold');
    expect(web).toContain(policy);
    expect(native).toContain(policy);
    expect(web.indexOf(policy)).toBeLessThan(web.indexOf('data-reading-route-action'));
  });

  it('does not expose a live purchase entry or activate the browser payment SDK', () => {
    expect(PORTONE_V2_BROWSER_CHECKOUT_PREPARATION_V1).toMatchObject({
      active: false,
      publicRoute: null,
      sdkInvocationEnabled: false,
      liveEnvironmentEnabled: false,
      sdkPortAccepted: false,
    });
    expect(PORTONE_V2_BROWSER_REQUEST_COMPOSER_V1).toMatchObject({
      active: false,
      publicRoute: null,
      sdkInvocationEnabled: false,
    });
    expect(PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1).toMatchObject({
      active: false,
      publicRoute: null,
      sdkDependency: false,
      sdkPortAccepted: false,
      sdkInvocationEnabled: false,
      liveEnvironmentEnabled: false,
      admittedEnvironment: 'sandbox',
    });
  });
});
