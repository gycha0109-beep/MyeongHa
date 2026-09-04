import {
  PRODUCT_AUTH_STORAGE_V1,
  ProductAuthError,
  clearPromotedGuestBearer,
  readGuestBearer,
  readMemberSession,
  signInWithPassword,
  signUpWithPassword,
} from './product-auth.js';

const BIRTH_PROFILE_ID_KEY = 'myeongha.guestBirthProfileId.v1';
const ALLOWED_NEXT = new Set([
  'hall.html',
  'reading.html',
  'reading-detail.html',
  'chat-hub.html',
  'chat.html',
  'records.html',
  'my.html',
]);

let mode = 'sign-in';

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing auth element: ${id}`);
  return element;
}

function nextHref() {
  const raw = new URLSearchParams(location.search).get('next');
  if (!raw) return 'hall.html';
  try {
    const resolved = new URL(raw, location.href);
    if (resolved.origin !== location.origin) return 'hall.html';
    const page = resolved.pathname.split('/').pop() || '';
    if (!ALLOWED_NEXT.has(page)) return 'hall.html';
    return `${page}${resolved.search}${resolved.hash}`;
  } catch {
    return 'hall.html';
  }
}

function setStatus(message, kind = '') {
  const status = byId('auth-status');
  status.textContent = message;
  status.className = `auth-status${kind ? ` is-${kind}` : ''}`;
}

function setBusy(busy) {
  const submit = byId('auth-submit');
  submit.disabled = busy;
  submit.textContent = busy
    ? mode === 'sign-up' ? '계정을 만드는 중…' : '로그인하는 중…'
    : mode === 'sign-up' ? '회원가입' : '로그인';
}

function selectMode(nextMode) {
  mode = nextMode === 'sign-up' ? 'sign-up' : 'sign-in';
  const signInTab = byId('auth-tab-signin');
  const signUpTab = byId('auth-tab-signup');
  signInTab.setAttribute('aria-selected', String(mode === 'sign-in'));
  signUpTab.setAttribute('aria-selected', String(mode === 'sign-up'));
  byId('auth-confirm-field').hidden = mode !== 'sign-up';
  const password = byId('auth-password');
  password.setAttribute('autocomplete', mode === 'sign-up' ? 'new-password' : 'current-password');
  byId('auth-password-confirm').required = mode === 'sign-up';
  setStatus('');
  setBusy(false);
}

function readPublicErrorCode(payload) {
  return payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
    ? payload.error.code
    : null;
}

async function ensureGuestForNewAccount() {
  if (readGuestBearer()) return;
  const response = await fetch('/api/session/bootstrap', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    body: '{}',
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || payload.ok !== true || !payload.data) {
    throw new ProductAuthError('WEB_AUTH_GUEST_PREPARE_FAILED', '게스트 흐름을 계정 연결용으로 준비하지 못했습니다.');
  }
  const data = payload.data;
  const token = data?.guestSession?.bearerToken;
  if (data.kind !== 'guest' || typeof token !== 'string' || token.length === 0) {
    throw new ProductAuthError('WEB_AUTH_GUEST_PREPARE_FAILED', '계정 연결용 게스트 세션을 확인하지 못했습니다.');
  }
  sessionStorage.setItem(PRODUCT_AUTH_STORAGE_V1.guestBearer, token);
}

async function promoteGuestIfPresent(accessToken) {
  const guestBearer = readGuestBearer();
  if (!guestBearer) return { status: 'none' };

  const response = await fetch('/api/auth/promote-guest', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-MyeongHa-Guest-Bearer': guestBearer,
    },
    credentials: 'same-origin',
    cache: 'no-store',
    body: '{}',
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && payload?.ok === true) {
    clearPromotedGuestBearer();
    return { status: 'promoted' };
  }

  const code = readPublicErrorCode(payload);
  if (response.status === 409 && code === 'GUEST_MERGE_REQUIRED') {
    return { status: 'merge-required' };
  }
  return { status: 'preserved' };
}

function authErrorMessage(error) {
  const code = error instanceof ProductAuthError ? error.code : null;
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return '이메일 또는 비밀번호를 확인해 주세요.';
    case 'SIGN_UP_REJECTED':
      return '이 이메일로 계정을 만들 수 없습니다. 이미 가입한 계정인지 확인해 주세요.';
    case 'RATE_LIMITED':
      return '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.';
    case 'WEB_AUTH_NETWORK_FAILED':
    case 'AUTH_UPSTREAM_UNAVAILABLE':
      return '인증 서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.';
    case 'WEB_AUTH_GUEST_PREPARE_FAILED':
      return '현재 게스트 흐름을 안전하게 보존하지 못해 회원가입을 중단했습니다. 다시 시도해 주세요.';
    default:
      return '인증을 완료하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.';
  }
}

async function finishAuthenticated(session) {
  const promotion = await promoteGuestIfPresent(session.accessToken);
  if (promotion.status === 'merge-required') {
    setStatus('로그인되었습니다. 이 브라우저의 별도 게스트 기록은 기존 계정에 임의로 합치지 않고 그대로 보존했습니다.', 'success');
  } else if (promotion.status === 'preserved') {
    setStatus('로그인되었습니다. 게스트 기록 연결은 완료되지 않아 현재 브라우저에 그대로 보존했습니다.', 'success');
  } else if (promotion.status === 'promoted') {
    setStatus('계정 연결이 완료되었습니다. 이어 보던 흐름을 그대로 계속합니다.', 'success');
  } else {
    setStatus('로그인되었습니다.', 'success');
  }
  setTimeout(() => location.assign(nextHref()), 500);
}

async function onSubmit(event) {
  event.preventDefault();
  if (byId('auth-submit').disabled) return;

  const email = byId('auth-email').value.trim();
  const password = byId('auth-password').value;
  const confirmation = byId('auth-password-confirm').value;
  if (!email || !password) {
    setStatus('이메일과 비밀번호를 입력해 주세요.', 'error');
    return;
  }
  if (mode === 'sign-up' && password !== confirmation) {
    setStatus('비밀번호 확인이 일치하지 않습니다.', 'error');
    return;
  }

  setBusy(true);
  setStatus('');
  try {
    if (mode === 'sign-up') {
      await ensureGuestForNewAccount();
      const result = await signUpWithPassword(email, password);
      if (result.status === 'verification_required') {
        setStatus(`${result.email}로 확인 메일을 보냈습니다. 같은 브라우저에서 인증 후 로그인하면 현재 게스트 흐름을 이어갈 수 있습니다.`, 'success');
        return;
      }
      await finishAuthenticated(result.session);
      return;
    }

    const session = await signInWithPassword(email, password);
    await finishAuthenticated(session);
  } catch (error) {
    setStatus(authErrorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

byId('auth-tab-signin').addEventListener('click', () => selectMode('sign-in'));
byId('auth-tab-signup').addEventListener('click', () => selectMode('sign-up'));
byId('auth-form').addEventListener('submit', (event) => void onSubmit(event));

if (readMemberSession()) {
  setStatus('이미 로그인되어 있습니다. 잠시 후 이전 화면으로 이동합니다.', 'success');
  setTimeout(() => location.assign(nextHref()), 350);
}
