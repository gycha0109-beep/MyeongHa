import {
  PRODUCT_AUTH_STORAGE_V1,
  getMemberAccessToken,
  readMemberSession,
} from './product-auth.js';

function safeNextHref() {
  const url = new URL(location.href);
  return `${url.pathname.split('/').pop() || 'hall.html'}${url.search}`;
}

function render() {
  const profile = document.querySelector('.product-profile');
  if (!(profile instanceof HTMLAnchorElement)) return;
  const mark = profile.querySelector('.product-profile-mark');
  const label = profile.querySelector('span:last-child');
  const member = readMemberSession();

  if (member) {
    profile.href = 'my.html';
    profile.setAttribute('aria-label', '마이 페이지');
    if (mark) mark.textContent = '之';
    if (label) label.textContent = '마이';
    profile.dataset.authState = 'member';
    return;
  }

  profile.href = `auth.html?next=${encodeURIComponent(safeNextHref())}`;
  profile.setAttribute('aria-label', '로그인');
  if (mark) mark.textContent = '入';
  if (label) label.textContent = '로그인';
  profile.dataset.authState = 'guest';
}

async function reconcile() {
  render();
  if (!readMemberSession()) return;
  try {
    await getMemberAccessToken();
  } catch {
    render();
    return;
  }
  render();
}

window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent, render);
window.addEventListener('storage', (event) => {
  if (event.key === PRODUCT_AUTH_STORAGE_V1.memberSession) render();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void reconcile(), { once: true });
} else {
  void reconcile();
}
