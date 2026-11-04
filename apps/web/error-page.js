(() => {
  // Match the existing product theme setting without loading auth, chat or
  // other domain runtimes on an error document.
  let theme;
  try {
    const saved = localStorage.getItem('myeongha.productTheme.v1');
    theme = saved === 'light' || saved === 'dark' ? saved : null;
  } catch { /* private browsing can block storage */ }
  if (!theme) theme = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('[data-error-back]')?.addEventListener('click', (event) => {
      let sameOrigin = false;
      try { sameOrigin = Boolean(document.referrer && new URL(document.referrer).origin === location.origin); } catch {}
      if (sameOrigin && history.length > 1) {
        event.preventDefault();
        history.back();
      }
    });
    document.querySelector('[data-error-retry]')?.addEventListener('click', () => location.reload());
  }, { once: true });
})();
