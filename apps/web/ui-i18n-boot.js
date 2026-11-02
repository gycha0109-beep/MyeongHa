// Run synchronously before first paint; keep non-Korean UI concealed until labels are localized.
(() => {
  let locale = 'ko-KR';
  try { locale = window.localStorage.getItem('myeongha.ui.locale.v1') || 'ko-KR'; } catch { /* private mode */ }
  if (!['ja-JP', 'zh-TW', 'en-US', 'zh-CN'].includes(locale)) return;
  document.documentElement.lang = locale;
  document.documentElement.dataset.uiPending = 'true';
  const fallback = setTimeout(() => document.documentElement.removeAttribute('data-ui-pending'), 4500);
  document.addEventListener('myeongha:ui-ready', () => clearTimeout(fallback), { once: true });
})();
