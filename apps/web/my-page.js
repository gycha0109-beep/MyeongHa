import { createMyRuntimeClient, MyRuntimeError } from './my-runtime-client.js';
import { readMemberSession, signOutMember } from './product-auth.js';

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing My page element: ${id}`);
  return element;
}

function textOrDash(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : '—';
}

function renderUnavailable(message, login = false) {
  byId('my-content').hidden = true;
  const status = byId('my-status');
  status.hidden = false;
  status.replaceChildren(document.createTextNode(message));
  if (login) {
    status.append(document.createElement('br'));
    const link = document.createElement('a');
    link.href = 'auth.html?next=my.html';
    link.textContent = '로그인하기 →';
    status.append(link);
  }
}

function renderAccountIdentity(subjectKind) {
  const session = readMemberSession();
  const email = byId('my-account-email');
  const note = byId('my-account-note');

  if (subjectKind === 'member') {
    email.textContent = textOrDash(session?.user?.email);
    note.textContent = session
      ? '로그인한 회원 세션으로 현재 계정의 저장된 흐름을 이어갑니다.'
      : '회원 subject가 확인되었지만 이 브라우저의 로그인 세션 정보는 확인되지 않습니다.';
    return;
  }

  email.textContent = '게스트 세션';
  note.textContent = '현재 브라우저의 게스트 흐름입니다. 계정 연결 전까지 회원 기록으로 가정하지 않습니다.';
}

function renderAccountAction(subjectKind) {
  const profileCard = document.querySelector('.my-identity-card');
  if (!(profileCard instanceof HTMLElement)) return;
  profileCard.querySelector('.my-auth-actions')?.remove();

  const actions = document.createElement('div');
  actions.className = 'my-auth-actions';
  const session = readMemberSession();

  if (subjectKind === 'member' && session) {
    const button = document.createElement('button');
    button.className = 'my-auth-action';
    button.type = 'button';
    button.textContent = '로그아웃';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = '로그아웃 중…';
      await signOutMember();
      location.assign('auth.html?next=hall.html');
    });
    actions.append(button);
  } else {
    const link = document.createElement('a');
    link.className = 'my-auth-action';
    link.href = 'auth.html?next=my.html';
    link.textContent = subjectKind === 'member' ? '다시 로그인' : '계정 연결';
    actions.append(link);
  }

  profileCard.append(actions);
}

function renderProfile(payload) {
  const profile = payload?.profile && typeof payload.profile === 'object' ? payload.profile : null;
  const displayName = profile?.displayName;
  const name = typeof displayName === 'string' && displayName.trim().length > 0 ? displayName : '호칭 미설정';
  const subjectKind = payload?.subjectKind;

  byId('my-display-name').textContent = name;
  byId('my-subject-kind').textContent = subjectKind === 'member' ? '회원' : subjectKind === 'guest' ? '게스트' : '현재 계정';
  byId('my-subject-status').textContent = payload?.subjectStatus === 'deletion_pending' ? '삭제 요청 진행 중' : payload?.subjectStatus === 'active' ? '사용 중' : '—';
  byId('my-locale').textContent = textOrDash(profile?.locale);
  byId('my-timezone').textContent = textOrDash(profile?.timezone);
  byId('my-onboarding-state').textContent = textOrDash(profile?.onboardingState);
  byId('my-profile-updated').textContent = textOrDash(profile?.updatedAt);
  renderAccountIdentity(subjectKind);
  renderAccountAction(subjectKind);

  byId('my-status').hidden = true;
  byId('my-content').hidden = false;
}

async function boot() {
  byId('my-content').hidden = true;
  const status = byId('my-status');
  status.hidden = false;
  status.textContent = '내 정보를 불러오는 중입니다…';

  try {
    const payload = await createMyRuntimeClient().readProfile();
    renderProfile(payload);
  } catch (error) {
    if (error instanceof MyRuntimeError && error.code === 'WEB_MY_SESSION_REQUIRED') {
      renderUnavailable('내 정보를 보려면 현재 세션이 필요합니다. 아래의 사주·기록·대화 진입은 로그인 전에도 확인할 수 있습니다.', true);
      return;
    }
    renderUnavailable('현재 내 정보를 불러올 수 없습니다. 확인되지 않은 계정 정보를 대신 표시하지 않습니다.');
  }
}

void boot();
