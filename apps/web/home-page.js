import { createHomeRuntimeClient } from './home-runtime-client.js';

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

function renderGenericProfile() {
  byId('home-profile-name').textContent = '내 기록';
  byId('home-profile-link').setAttribute('aria-label', '내 프로필');
}

function renderProfile(payload) {
  const name = payload?.profile?.displayName;
  if (typeof name !== 'string' || name.trim().length === 0) {
    renderGenericProfile();
    return;
  }
  byId('home-profile-name').textContent = name;
  byId('home-profile-link').setAttribute('aria-label', `${name}의 프로필`);
}

async function boot() {
  renderCalendarDate();
  renderGenericProfile();

  try {
    const profile = await createHomeRuntimeClient().readProfile();
    renderProfile(profile);
  } catch {
    renderGenericProfile();
  }
}

void boot();
