const root = document.documentElement;
const savedTheme = localStorage.getItem('myeongha-theme');
const autoTheme = new Date().getHours() >= 7 && new Date().getHours() < 18 ? 'day' : 'night';
root.dataset.theme = savedTheme || autoTheme;

const themeButton = document.querySelector('[data-theme-toggle]');
if (themeButton) {
  const syncLabel = () => {
    const next = root.dataset.theme === 'night' ? '낮' : '밤';
    themeButton.setAttribute('aria-label', `${next} 화면으로 전환`);
    themeButton.textContent = root.dataset.theme === 'night' ? '☼' : '☾';
  };
  syncLabel();
  themeButton.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'night' ? 'day' : 'night';
    localStorage.setItem('myeongha-theme', root.dataset.theme);
    syncLabel();
  });
}

document.querySelectorAll('[data-record-toggle]').forEach((button) => {
  const target = document.getElementById(button.dataset.recordToggle);
  if (!target) return;
  button.addEventListener('click', () => {
    const willOpen = target.hidden;
    target.hidden = !willOpen;
    button.setAttribute('aria-expanded', String(willOpen));
    button.textContent = willOpen ? '기록 접기' : '기록 펼치기';
  });
});

document.querySelectorAll('.memory-option').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.memory-option').forEach((other) => other.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    const status = document.querySelector('[data-memory-status]');
    if (status) status.textContent = `${button.dataset.label} 선택 — 실제 저장은 서버 권한 확인 후 확정됩니다.`;
  });
});

const birthForm = document.querySelector('[data-birth-form]');
if (birthForm) {
  birthForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sessionStorage.setItem('myeongha-ui-demo-birth', 'submitted');
    window.location.href = 'reading.html?from=birth';
  });
}

document.querySelectorAll('[role="tab"]').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tablist = tab.closest('[role="tablist"]');
    if (!tablist) return;
    const targetId = tab.getAttribute('aria-controls');
    tablist.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute('aria-selected', 'false'));
    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = panel.id !== targetId; });
    tab.setAttribute('aria-selected', 'true');
  });
});

if (document.body.dataset.page === 'hall') {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'guest') {
    document.querySelectorAll('[data-returning-only]').forEach((el) => { el.hidden = true; });
    document.querySelectorAll('[data-guest-only]').forEach((el) => { el.hidden = false; });
  }
}
