function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing Home page element: ${id}`);
  return element;
}

function renderMonthLabel() {
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
  }).format(new Date());
  byId('home-current-date').textContent = `${formatted}의 흐름`;
}

// Header authentication state is owned exclusively by product-auth-ui.js.
// Home keeps a static greeting fallback and only formats browser calendar data.
renderMonthLabel();
