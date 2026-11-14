import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APPROVED_SAJU_CATALOG_V1 } from './approved-saju-catalog.js';
import type { ApprovedSajuCheckoutPanelPorts } from '../commerce/approved-saju-sandbox-checkout.js';
import { ApprovedSajuCheckoutPanel } from '../commerce/ApprovedSajuCheckoutPanel.js';
import { ReadingPage } from './ReadingPage.js';

const ownerPorts = {} as ApprovedSajuCheckoutPanelPorts;

describe('14 approved Saju product cards and private checkout entry', () => {
  it('keeps the complete approved catalog on the Saju page', () => {
    const markup = renderToStaticMarkup(<ReadingPage />);
    expect(APPROVED_SAJU_CATALOG_V1).toHaveLength(14);
    expect(markup.match(/class="saju-design-product-card"/gu)).toHaveLength(14);
    for (const offer of APPROVED_SAJU_CATALOG_V1) {
      expect(markup).toContain(offer.title);
    }
  });

  it('does not show payment entry without server-verified Owner sandbox ports', () => {
    const markup = renderToStaticMarkup(<ReadingPage />);
    expect(markup).not.toContain('테스트 결제·발급 확인');
    expect(markup).not.toContain('사주 상품 결제 테스트');
  });

  it('shows a correctly labeled test checkout action for all 14 offers for an admitted Owner', () => {
    const markup = renderToStaticMarkup(<ReadingPage approvedCheckout={ownerPorts} />);
    expect(markup.match(/테스트 결제·발급 확인/gu)).toHaveLength(14);
    for (const offer of APPROVED_SAJU_CATALOG_V1) {
      expect(markup).toContain(`aria-label="${offer.title} 테스트 결제 진행"`);
    }
  });

  it('preselects the selected card in the existing verified sandbox checkout panel', () => {
    const markup = renderToStaticMarkup(<ApprovedSajuCheckoutPanel
      ports={ownerPorts}
      selection={{ offerId: 'wealth', sequence: 1 }}
    />);
    expect(markup).toMatch(/<option[^>]*value="wealth"[^>]*selected/);
    expect(markup).toContain('결제창');
  });
});
