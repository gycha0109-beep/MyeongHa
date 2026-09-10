import {
  ProductAuthError,
  clearPromotedGuestBearer,
  ensureGuestBearer,
  invalidateGuestSession,
  invalidateMemberSession,
  normalizeGuestBearer,
  readGuestBearer,
  readMemberSession,
  signInWithPassword,
  signUpWithPassword,
} from './product-auth.js';

const BIRTH_PROFILE_ID_KEY = 'myeongha.guestBirthProfileId.v1';
const CONFIRMATION_GUEST_HANDOFF_KEY = 'myeongha.pendingGuestConfirmation.v1';
const CONFIRMATION_GUEST_HANDOFF_VERSION = 2;
const CONFIRMATION_GUEST_HANDOFF_LOCK_NAME = 'myeongha.pendingGuestConfirmation.v1.lock';
const CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY = 'myeongha.pendingGuestConfirmation.journal.v1';
const CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX = 'myeongha.pendingGuestConfirmation.entry.v1.';
const CONFIRMATION_GUEST_HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;
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

function consumeConfirmationReturn() {
  const url = new URL(location.href);
  if (url.searchParams.get('confirmed') !== '1') return false;

  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const hasError = fragment.has('error') || fragment.has('error_code');
  const hasImplicitSession = fragment.has('access_token') && fragment.has('refresh_token');

  url.searchParams.delete('confirmed');
  url.hash = '';
  history.replaceState(null, '', `${url.pathname}${url.search}`);

  selectMode('sign-in');
  if (hasError) {
    setStatus('이메일 확인 링크를 처리하지 못했습니다. 링크가 만료됐거나 이미 사용됐을 수 있습니다. 가입한 계정으로 로그인을 시도해 주세요.', 'error');
  } else if (hasImplicitSession) {
    setStatus('이메일 확인이 처리되었습니다. 가입한 이메일과 비밀번호로 로그인해 주세요.', 'success');
  } else {
    setStatus('이메일 확인 화면에서 돌아왔습니다. 가입한 이메일과 비밀번호로 로그인해 주세요.');
  }
  return true;
}

function readPublicErrorCode(payload) {
  return payload && typeof payload === 'object' && payload.error && typeof payload.error === 'object'
    ? payload.error.code
    : null;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function confirmationGuestHandoffLocks() {
  const locks = globalThis.navigator?.locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

function confirmationGuestHandoffReadFailure(error) {
  return new ProductAuthError(
    'WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILED',
    '게스트 계정 연결 기록을 브라우저에서 안전하게 읽지 못했습니다.',
    error,
  );
}

function confirmationGuestHandoffClearFailure(error) {
  return new ProductAuthError(
    'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_FAILED',
    '게스트 계정 연결 기록을 브라우저에서 안전하게 제거하지 못했습니다.',
    error,
  );
}

function confirmationGuestHandoffClearRollbackFailure(error) {
  return new ProductAuthError(
    'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED',
    '게스트 계정 연결 기록 제거 확인 실패 후 브라우저 상태를 안전하게 복원하지 못했습니다.',
    error,
  );
}

function readConfirmationGuestHandoffLocal(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    throw confirmationGuestHandoffReadFailure(error);
  }
}

function reconcileConfirmationGuestHandoffRemoval(key, previousRaw) {
  let observed;
  try {
    observed = localStorage.getItem(key);
  } catch {
    return false;
  }

  if (observed === previousRaw) return true;
  if (observed !== null) return true;

  try {
    if (previousRaw !== null) localStorage.setItem(key, previousRaw);
  } catch {
    // A rollback write may throw after restoring. Exact read-back remains authoritative.
  }

  try {
    observed = localStorage.getItem(key);
    return observed === previousRaw || observed !== null;
  } catch {
    return false;
  }
}

function removeConfirmationGuestHandoffLocal(key) {
  const previousRaw = readConfirmationGuestHandoffLocal(key);
  if (previousRaw === null) return true;

  let mutationError = null;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    mutationError = error;
  }

  let observed;
  try {
    observed = localStorage.getItem(key);
  } catch (error) {
    if (!reconcileConfirmationGuestHandoffRemoval(key, previousRaw)) {
      throw confirmationGuestHandoffClearRollbackFailure(error);
    }
    throw confirmationGuestHandoffClearFailure(error);
  }

  if (mutationError) {
    if (!reconcileConfirmationGuestHandoffRemoval(key, previousRaw)) {
      throw confirmationGuestHandoffClearRollbackFailure(mutationError);
    }
    throw confirmationGuestHandoffClearFailure(mutationError);
  }

  if (observed === null || observed !== previousRaw) return true;
  throw confirmationGuestHandoffClearFailure();
}

function clearConfirmationGuestHandoff() {
  try {
    localStorage.removeItem(CONFIRMATION_GUEST_HANDOFF_KEY);
  } catch {
    return;
  }
}

function writeConfirmationGuestHandoffs(entries) {
  if (entries.length === 0) {
    clearConfirmationGuestHandoff();
    return true;
  }
  try {
    localStorage.setItem(CONFIRMATION_GUEST_HANDOFF_KEY, JSON.stringify({
      version: CONFIRMATION_GUEST_HANDOFF_VERSION,
      entries,
    }));
    return true;
  } catch {
    return false;
  }
}

function normalizeConfirmationGuestHandoff(value, now = Date.now()) {
  const email = normalizeEmail(value?.email);
  const guestBearer = normalizeGuestBearer(value?.guestBearer);
  const expiresAtMs = typeof value?.expiresAt === 'string' ? Date.parse(value.expiresAt) : Number.NaN;
  if (!email || !guestBearer || guestBearer.includes('.') || Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
    return null;
  }
  return Object.freeze({
    guestBearer,
    email,
    expiresAt: new Date(expiresAtMs).toISOString(),
  });
}

function dedupeConfirmationGuestHandoffs(candidates) {
  const deduped = new Map();
  for (const candidate of candidates) {
    const normalized = normalizeConfirmationGuestHandoff(candidate);
    if (!normalized) continue;
    const key = `${normalized.email}\u0000${normalized.guestBearer}`;
    const previous = deduped.get(key);
    if (!previous || Date.parse(previous.expiresAt) < Date.parse(normalized.expiresAt)) {
      deduped.set(key, normalized);
    }
  }
  return [...deduped.values()];
}

function readLegacyConfirmationGuestHandoffCandidates() {
  const raw = readConfirmationGuestHandoffLocal(CONFIRMATION_GUEST_HANDOFF_KEY);
  if (!raw) return [];

  let stored = null;
  try {
    stored = JSON.parse(raw);
  } catch {
    clearConfirmationGuestHandoff();
    return [];
  }

  return stored?.version === CONFIRMATION_GUEST_HANDOFF_VERSION && Array.isArray(stored.entries)
    ? stored.entries
    : [stored];
}

function hasConfirmationGuestHandoffJournal() {
  return readConfirmationGuestHandoffLocal(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY) === '1';
}

function confirmationGuestHandoffJournalKeys() {
  const keys = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX)) keys.push(key);
    }
  } catch (error) {
    throw confirmationGuestHandoffReadFailure(error);
  }
  return keys;
}

function readConfirmationGuestHandoffJournalCandidates() {
  const entries = [];
  for (const key of confirmationGuestHandoffJournalKeys()) {
    const raw = readConfirmationGuestHandoffLocal(key);
    let normalized = null;
    try {
      normalized = raw ? normalizeConfirmationGuestHandoff(JSON.parse(raw)) : null;
    } catch {}
    if (!normalized) {
      try {
        localStorage.removeItem(key);
      } catch {}
      continue;
    }
    entries.push(normalized);
  }
  return entries;
}

function writeConfirmationGuestHandoffJournalEntry(entry) {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const key = `${CONFIRMATION_GUEST_HANDOFF_ENTRY_PREFIX}${suffix}`;
  const raw = JSON.stringify(entry);
  try {
    localStorage.setItem(key, raw);
    return localStorage.getItem(key) === raw;
  } catch {
    return false;
  }
}

function removeConfirmationGuestHandoffJournalMatches(expectedEmail, promotedGuestBearer) {
  let removed = false;
  for (const key of confirmationGuestHandoffJournalKeys()) {
    const raw = readConfirmationGuestHandoffLocal(key);
    let normalized = null;
    try {
      normalized = raw ? normalizeConfirmationGuestHandoff(JSON.parse(raw)) : null;
    } catch {}
    if (!normalized) {
      try {
        localStorage.removeItem(key);
      } catch {}
      continue;
    }
    if (normalized.email === expectedEmail && normalized.guestBearer === promotedGuestBearer) {
      removeConfirmationGuestHandoffLocal(key);
      removed = true;
    }
  }
  return removed;
}

function ensureConfirmationGuestHandoffJournalInitialized() {
  if (hasConfirmationGuestHandoffJournal()) return true;

  const legacyEntries = dedupeConfirmationGuestHandoffs(readLegacyConfirmationGuestHandoffCandidates());
  for (const entry of legacyEntries) {
    if (!writeConfirmationGuestHandoffJournalEntry(entry)) return false;
  }

  try {
    localStorage.setItem(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY, '1');
    return localStorage.getItem(CONFIRMATION_GUEST_HANDOFF_JOURNAL_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

function readConfirmationGuestHandoffs() {
  const source = hasConfirmationGuestHandoffJournal()
    ? readConfirmationGuestHandoffJournalCandidates()
    : readLegacyConfirmationGuestHandoffCandidates();
  const entries = dedupeConfirmationGuestHandoffs(source);
  writeConfirmationGuestHandoffs(entries);
  return entries;
}

async function stageConfirmationGuestHandoff(email) {
  const guestBearer = readGuestBearer();
  const normalizedEmail = normalizeEmail(email);
  if (!guestBearer || !normalizedEmail) return false;

  const locks = confirmationGuestHandoffLocks();
  if (!locks) return false;
  try {
    return await locks.request(CONFIRMATION_GUEST_HANDOFF_LOCK_NAME, { mode: 'exclusive' }, () => {
      if (!ensureConfirmationGuestHandoffJournalInitialized()) return false;
      const entry = Object.freeze({
        guestBearer,
        email: normalizedEmail,
        expiresAt: new Date(Date.now() + CONFIRMATION_GUEST_HANDOFF_TTL_MS).toISOString(),
      });
      if (!writeConfirmationGuestHandoffJournalEntry(entry)) return false;
      const entries = readConfirmationGuestHandoffs();
      return entries.some((candidate) => (
        candidate.email === normalizedEmail && candidate.guestBearer === guestBearer
      ));
    });
  } catch {
    return false;
  }
}

async function readConfirmationGuestHandoff(memberEmail) {
  const expectedEmail = normalizeEmail(memberEmail);
  if (!expectedEmail) return null;
  const readExact = () => {
    const matches = readConfirmationGuestHandoffs().filter((entry) => entry.email === expectedEmail);
    if (matches.length !== 1) return null;
    return matches[0].guestBearer;
  };

  const locks = confirmationGuestHandoffLocks();
  if (!locks) return readExact();
  try {
    return await locks.request(CONFIRMATION_GUEST_HANDOFF_LOCK_NAME, { mode: 'exclusive' }, () => {
      if (!ensureConfirmationGuestHandoffJournalInitialized()) return null;
      return readExact();
    });
  } catch (error) {
    if (error instanceof ProductAuthError && error.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILED') {
      throw error;
    }
    return null;
  }
}

async function clearConfirmationGuestHandoffIfMatches(memberEmail, promotedGuestBearer) {
  const expectedEmail = normalizeEmail(memberEmail);
  if (!expectedEmail || !promotedGuestBearer) return false;
  const clearExact = () => {
    if (!ensureConfirmationGuestHandoffJournalInitialized()) return false;
    const current = readConfirmationGuestHandoffs();
    const next = current.filter((entry) => !(
      entry.email === expectedEmail && entry.guestBearer === promotedGuestBearer
    ));
    if (next.length === current.length) return true;
    if (!removeConfirmationGuestHandoffJournalMatches(expectedEmail, promotedGuestBearer)) return false;
    writeConfirmationGuestHandoffs(next);
    return true;
  };

  const locks = confirmationGuestHandoffLocks();
  if (!locks) return clearExact();
  try {
    return await locks.request(CONFIRMATION_GUEST_HANDOFF_LOCK_NAME, { mode: 'exclusive' }, clearExact);
  } catch (error) {
    if (error instanceof ProductAuthError && (
      error.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILED' ||
      error.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_FAILED' ||
      error.code === 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED'
    )) {
      throw error;
    }
    return false;
  }
}

async function promoteGuestIfPresent(accessToken, memberEmail) {
  const guestBearer = readGuestBearer() ?? await readConfirmationGuestHandoff(memberEmail);
  if (!guestBearer) return { status: 'none' };

  let response;
  try {
    response = await fetch('/api/auth/promote-guest', {
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
  } catch {
    return { status: 'preserved' };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && payload?.ok === true) {
    clearPromotedGuestBearer();
    if (!await clearConfirmationGuestHandoffIfMatches(memberEmail, guestBearer)) {
      throw confirmationGuestHandoffClearFailure();
    }
    return { status: 'promoted' };
  }

  const code = readPublicErrorCode(payload);
  if (response.status === 401) {
    if (code === 'MEMBER_AUTH_REQUIRED') {
      invalidateMemberSession(accessToken);
      return { status: 'member-rejected' };
    }
    if (code === 'GUEST_AUTH_REQUIRED') {
      invalidateGuestSession(guestBearer);
      if (!await clearConfirmationGuestHandoffIfMatches(memberEmail, guestBearer)) {
        throw confirmationGuestHandoffClearFailure();
      }
      return { status: 'guest-rejected' };
    }
    return { status: 'auth-rejected' };
  }
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
    case 'WEB_AUTH_CONFIRMATION_HANDOFF_READ_FAILED':
      return '저장된 게스트 계정 연결 기록을 확인하지 못했습니다. 브라우저 저장소 접근을 복구한 뒤 다시 로그인해 주세요.';
    case 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_FAILED':
    case 'WEB_AUTH_CONFIRMATION_HANDOFF_CLEAR_ROLLBACK_FAILED':
      return '게스트 계정 연결 기록을 정리하지 못했습니다. 브라우저 저장소 접근을 복구한 뒤 다시 로그인해 주세요.';
    default:
      return '인증을 완료하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.';
  }
}

async function finishAuthenticated(session) {
  const promotion = await promoteGuestIfPresent(session.accessToken, session.user?.email);
  if (promotion.status === 'member-rejected') {
    setStatus('로그인 세션이 서버에서 거부되었습니다. 다시 로그인해 주세요.', 'error');
    return;
  }
  if (promotion.status === 'auth-rejected') {
    setStatus('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.', 'error');
    return;
  }
  if (promotion.status === 'merge-required') {
    setStatus('로그인되었습니다. 이 브라우저의 별도 게스트 기록은 기존 계정에 임의로 합치지 않고 그대로 보존했습니다.', 'success');
  } else if (promotion.status === 'guest-rejected') {
    setStatus('로그인되었습니다. 더 이상 유효하지 않은 게스트 연결 정보는 해제했습니다.', 'success');
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
      await ensureGuestBearer();
      const result = await signUpWithPassword(email, password, nextHref());
      if (result.status === 'verification_required') {
        if (!await stageConfirmationGuestHandoff(result.email)) {
          setStatus('확인 메일은 전송됐지만 현재 게스트 흐름의 계정 연결 정보를 안전하게 보존하지 못했습니다. 이 탭을 닫지 말고 이메일 확인 후 돌아와 주세요.', 'error');
          return;
        }
        setStatus(`${result.email}로 확인 메일을 보냈습니다. 이메일 확인 후 이 로그인 화면으로 돌아와 현재 게스트 흐름을 이어갈 수 있습니다.`, 'success');
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

const confirmationReturn = consumeConfirmationReturn();
if (readMemberSession() && !confirmationReturn) {
  setStatus('현재 브라우저에 이전 로그인 세션이 있습니다. 계정 상태가 맞지 않으면 아래에서 다시 로그인해 세션을 갱신할 수 있습니다.');
}
