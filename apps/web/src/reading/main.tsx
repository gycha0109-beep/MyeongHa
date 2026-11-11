import { createRoot } from 'react-dom/client';
import { ReadingPage } from './ReadingPage.js';

const readingRoot = document.getElementById('reading-react-root');

if (!(readingRoot instanceof HTMLElement)) {
  throw new Error('Missing Saju Reading page element: reading-react-root');
}

const root = createRoot(readingRoot);
root.render(<ReadingPage />);

if (new URLSearchParams(window.location.search).get('checkout') === 'test') {
  void Promise.all([
    import('../commerce/approved-saju-sandbox-browser-runtime.js'),
    import('../../product-auth.js'),
  ]).then(async ([{ loadApprovedSajuSandboxCheckoutPortsV1 }, { getActiveBearer, readMemberSession, PRODUCT_AUTH_STORAGE_V1 }]) => {
    const ownerId = readMemberSession()?.user.id;
    if (!ownerId) return;
    const approvedCheckout = await loadApprovedSajuSandboxCheckoutPortsV1(async () => {
      const bearer = await getActiveBearer();
      if (bearer?.kind !== 'member' || readMemberSession()?.user.id !== ownerId) {
        throw new Error('The checkout member changed.');
      }
      return bearer.token;
    });
    if (approvedCheckout === null || readMemberSession()?.user.id !== ownerId) return;
    function hideAfterOwnerChange() {
      if (readMemberSession()?.user.id === ownerId) return;
      root.render(<ReadingPage />);
      window.removeEventListener('storage', hideAfterOwnerChange);
      window.removeEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, hideAfterOwnerChange);
    }
    window.addEventListener('storage', hideAfterOwnerChange);
    window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, hideAfterOwnerChange);
    root.render(<ReadingPage approvedCheckout={approvedCheckout} />);
  }).catch(() => { /* The ordinary Reading page remains available. */ });
}
