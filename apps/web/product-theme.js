(() => {
  const STORAGE_KEY = 'myeongha.productTheme.v1';
  const root = document.documentElement;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');

  const readStoredTheme = () => {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };

  const systemTheme = () => (media?.matches ? 'dark' : 'light');
  const resolvedTheme = () => readStoredTheme() ?? systemTheme();

  const syncToggle = () => {
    const button = document.querySelector('.product-theme-toggle');
    if (!button) return;
    const dark = root.dataset.theme === 'dark';
    button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    button.setAttribute('aria-label', dark ? '라이트 모드로 전환' : '다크 모드로 전환');
    button.setAttribute('title', dark ? '라이트 모드' : '다크 모드');
    const mark = button.querySelector('.product-theme-toggle-mark');
    if (mark) mark.textContent = dark ? '☀' : '☾';
  };

  const applyTheme = (theme) => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    syncToggle();
  };

  const saveTheme = (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Theme selection remains valid for the current page even when storage is unavailable.
    }
  };

  const installToggle = () => {
    const utilities = document.querySelector('.product-utilities');
    if (!utilities || utilities.querySelector('.product-theme-toggle')) return;

    const button = document.createElement('button');
    button.className = 'product-theme-toggle';
    button.type = 'button';
    button.innerHTML = '<span class="product-theme-toggle-mark" aria-hidden="true"></span>';
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      applyTheme(next);
    });

    const profile = utilities.querySelector('.product-profile');
    utilities.insertBefore(button, profile ?? utilities.firstChild);
    syncToggle();
  };

  applyTheme(resolvedTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installToggle, { once: true });
  } else {
    installToggle();
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(resolvedTheme());
  });

  media?.addEventListener?.('change', () => {
    if (!readStoredTheme()) applyTheme(systemTheme());
  });
})();
