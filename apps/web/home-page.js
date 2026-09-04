function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Home page element: ${id}`);
  return element;
}

function renderCalendarDate() {
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  byId('home-current-date').textContent = `${formatted} · 오늘의 흐름`;
}

// Header authentication state is owned exclusively by product-auth-ui.js.
// Home must not rewrite the shared profile label/ARIA state after auth reconciliation.
renderCalendarDate();
