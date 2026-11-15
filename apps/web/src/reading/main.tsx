import { createRoot } from 'react-dom/client';
import { ReadingPage } from './ReadingPage.js';
import type { ApprovedSajuCheckoutPanelPorts } from '../commerce/approved-saju-sandbox-checkout.js';
import {
  getActiveBearer,
  readMemberSession,
  PRODUCT_AUTH_STORAGE_V1,
} from '../../product-auth.js';
import { loadApprovedSajuSandboxCheckoutPortsV1 } from '../commerce/approved-saju-sandbox-browser-runtime.js';

const readingRoot = document.getElementById('reading-react-root');
if (!(readingRoot instanceof HTMLElement)) {
  throw new Error('Missing Saju Reading page element: reading-react-root');
}
const root = createRoot(readingRoot);
let currentMember: string | null | undefined;
let generation = 0;
let approvedCheckout: ApprovedSajuCheckoutPanelPorts | undefined;

async function refreshCheckoutForMember() {
  const memberId = readMemberSession()?.user.id ?? null;
  if (currentMember === memberId) return;
  const activeGeneration = ++generation;
  currentMember = memberId;
  approvedCheckout = undefined;
  root.render(<ReadingPage />);
  if (memberId === null) return;

  const ports = await loadApprovedSajuSandboxCheckoutPortsV1(async () => {
    const bearer = await getActiveBearer();
    if (bearer?.kind !== 'member' || readMemberSession()?.user.id !== memberId) {
      throw new Error('Owner checkout identity changed.');
    }
    return bearer.token;
  });
  if (generation !== activeGeneration || readMemberSession()?.user.id !== memberId) return;
  if (ports === null) return;
  approvedCheckout = ports;
  root.render(<ReadingPage approvedCheckout={approvedCheckout} />);
}

// An Owner may sign in from another tab AFTER the Reading page was opened.
// Keep that 14-product checkout page live on member login/logout and tab sync;
// server permission checks remain the sole authority for exposing TEST ports.
window.addEventListener('storage', () => { void refreshCheckoutForMember(); });
window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, () => {
  void refreshCheckoutForMember();
});
void refreshCheckoutForMember();
