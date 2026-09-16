import { useEffect, useState } from 'react';
import { createMyRuntimeClient, MyRuntimeError } from '../../my-runtime-client.js';
import { PRODUCT_AUTH_STORAGE_V1, readMemberSession, signOutMember } from '../../product-auth.js';
import { shouldReloadMyForMemberSessionStorageChange } from '../../product-auth-surface.js';

type Profile = {
  displayName: string | null;
  locale: string | null;
  timezone: string | null;
  onboardingState: string | null;
  updatedAt: string;
};

type ProfilePayload = {
  subjectKind: 'guest' | 'member';
  subjectStatus: 'active' | 'deletion_pending';
  profile: Profile | null;
};

type BirthInput = {
  calendarType: 'solar' | 'lunar';
  birthDate: string;
  birthTime: string | null;
  timeKnown: boolean;
  isLeapMonth: boolean;
  sex: 'male' | 'female' | 'unspecified' | null;
};

type BirthPayload = {
  birthProfile: null | {
    currentRevision: { revisionNo: number; input: BirthInput };
  };
};

type AccountState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: ProfilePayload }
  | { kind: 'unavailable'; message: string; login: boolean; hasStoredMemberSession: boolean };

type BirthState =
  | { kind: 'loading' }
  | { kind: 'ready'; payload: BirthPayload }
  | { kind: 'unavailable'; message: string };

function textOrDash(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value : '—';
}

function birthDateText(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : '—';
}

function birthTimeText(input: BirthInput) {
  if (!input.timeKnown) return '시간 모름';
  return input.birthTime?.slice(0, 5) ?? '—';
}

function calendarText(input: BirthInput) {
  if (input.calendarType === 'solar') return '양력';
  return input.isLeapMonth ? '음력 · 윤달' : '음력';
}

function sexText(value: BirthInput['sex']) {
  if (value === 'male') return '남성';
  if (value === 'female') return '여성';
  if (value === 'unspecified') return '미지정';
  return '미입력';
}

function AuthActions({ subjectKind, hasStoredMemberSession }: {
  subjectKind?: ProfilePayload['subjectKind'];
  hasStoredMemberSession: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const canSignOut = hasStoredMemberSession && subjectKind !== 'guest';
  const signInLabel = subjectKind === 'guest'
    ? '계정 연결'
    : subjectKind === 'member' || hasStoredMemberSession ? '다시 로그인 →' : '로그인하기 →';

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutMember();
      location.assign('auth.html?next=hall.html');
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div className="my-auth-actions">
      {subjectKind !== 'member' || !hasStoredMemberSession ? (
        <a className="my-auth-action" href="auth.html?next=my.html">
          {signInLabel}
        </a>
      ) : null}
      {canSignOut ? (
        <button className="my-auth-action" type="button" disabled={signingOut} onClick={() => void handleSignOut()}>
          {signingOut ? '로그아웃 중…' : '로그아웃'}
        </button>
      ) : null}
    </div>
  );
}

function AccountSection({ state }: { state: AccountState }) {
  const payload = state.kind === 'ready' ? state.payload : null;
  const profile = payload?.profile;
  const memberSession = payload ? readMemberSession() : null;
  const hasStoredMemberSession = state.kind === 'unavailable'
    ? state.hasStoredMemberSession
    : Boolean(memberSession);
  const displayName = profile?.displayName?.trim() || '호칭 미설정';

  return (
    <section className="my-account-section" aria-labelledby="my-account-title">
      <div className="my-section-head">
        <div><span className="my-section-kicker">ACCOUNT</span><h2 id="my-account-title">현재 계정</h2></div>
        <p>서버가 확인한 현재 subject와 프로필만 표시합니다.</p>
      </div>
      <div className="my-status" id="my-status" role="status" hidden={state.kind === 'ready'}>
        {state.kind === 'loading' ? '내 정보를 불러오는 중입니다…' : state.kind === 'unavailable' ? state.message : ''}
        {state.kind === 'unavailable' && state.login ? <><br /><AuthActions hasStoredMemberSession={hasStoredMemberSession} /></> : null}
      </div>
      <div id="my-content" hidden={state.kind !== 'ready'}>
        <div className="my-overview-grid">
          <article className="my-card my-identity-card">
            <div className="my-profile-mark" aria-hidden="true">之</div>
            <div className="my-profile-name" id="my-display-name">{payload ? displayName : ''}</div>
            <div className="my-profile-kind">
              <span id="my-subject-kind">{payload?.subjectKind === 'member' ? '회원' : payload?.subjectKind === 'guest' ? '게스트' : ''}</span>
              {' · '}
              <span id="my-subject-status">{payload?.subjectStatus === 'deletion_pending' ? '삭제 요청 진행 중' : payload?.subjectStatus === 'active' ? '사용 중' : ''}</span>
            </div>
            <div className="my-account-email-row">
              <span>로그인 계정</span>
              <strong id="my-account-email">{payload?.subjectKind === 'member' ? textOrDash(memberSession?.user?.email) : payload ? '게스트 세션' : ''}</strong>
            </div>
            <p className="my-account-note" id="my-account-note">
              {payload?.subjectKind === 'member'
                ? memberSession ? '로그인한 회원 세션으로 현재 계정의 저장된 흐름을 이어갑니다.' : '회원 subject가 확인되었지만 이 브라우저의 로그인 세션 정보는 확인되지 않습니다.'
                : payload ? '현재 브라우저의 게스트 흐름입니다. 계정 연결 전까지 회원 기록으로 가정하지 않습니다.' : ''}
            </p>
            {payload ? <AuthActions subjectKind={payload.subjectKind} hasStoredMemberSession={hasStoredMemberSession} /> : null}
          </article>
          <article className="my-card my-facts-card">
            <div className="my-card-label">PROFILE</div>
            <dl className="my-facts">
              <div className="my-fact"><dt>언어</dt><dd id="my-locale">{payload ? textOrDash(profile?.locale) : ''}</dd></div>
              <div className="my-fact"><dt>시간대</dt><dd id="my-timezone">{payload ? textOrDash(profile?.timezone) : ''}</dd></div>
              <div className="my-fact"><dt>온보딩 상태</dt><dd id="my-onboarding-state">{payload ? textOrDash(profile?.onboardingState) : ''}</dd></div>
              <div className="my-fact"><dt>프로필 갱신</dt><dd id="my-profile-updated">{payload ? textOrDash(profile?.updatedAt) : ''}</dd></div>
            </dl>
          </article>
        </div>
      </div>
    </section>
  );
}

function BirthSection({ state }: { state: BirthState }) {
  const birthProfile = state.kind === 'ready' ? state.payload.birthProfile : null;
  const input = birthProfile?.currentRevision.input;
  const isEmpty = state.kind === 'ready' && state.payload.birthProfile === null;

  return (
    <section className="my-birth-section" aria-labelledby="my-birth-title">
      <div className="my-section-head">
        <div><span className="my-section-kicker">BIRTH INPUT</span><h2 id="my-birth-title">출생 정보</h2></div>
        <p>현재 subject에 연결된 본인 출생 원본 입력만 표시합니다. 계산 결과는 사주 화면에서 확인합니다.</p>
      </div>
      <div className="my-status my-birth-status" id="my-birth-status" role="status" hidden={Boolean(birthProfile)}>
        {state.kind === 'loading' ? '출생 정보를 확인하는 중입니다…' : state.kind === 'unavailable' ? state.message : isEmpty ? <>{'저장된 본인 출생 정보가 없습니다.'}<br /><a href="birth.html">출생 정보 입력하기 →</a></> : ''}
      </div>
      <article className="my-birth-card" id="my-birth-content" hidden={!birthProfile}>
        <div className="my-birth-heading">
          <div><span className="my-card-label">CURRENT INPUT</span><strong>현재 저장된 출생 정보</strong></div>
          <span className="my-setting-state" id="my-birth-revision">{birthProfile ? `현재 입력 · revision ${birthProfile.currentRevision.revisionNo}` : ''}</span>
        </div>
        <dl className="my-birth-facts">
          <div><dt>생년월일</dt><dd id="my-birth-date">{input ? birthDateText(input.birthDate) : ''}</dd></div>
          <div><dt>태어난 시간</dt><dd id="my-birth-time">{input ? birthTimeText(input) : ''}</dd></div>
          <div><dt>달력</dt><dd id="my-birth-calendar">{input ? calendarText(input) : ''}</dd></div>
          <div><dt>성별</dt><dd id="my-birth-sex">{input ? sexText(input.sex) : ''}</dd></div>
        </dl>
        <div className="my-birth-footer">
          <p>현재는 저장된 원본 입력을 확인할 수 있습니다. 안전한 revision 수정 경로가 제품에 연결되기 전에는 기존 값을 임의로 덮어쓰지 않습니다.</p>
          <a className="my-auth-action" href="reading.html">사주에서 계산 결과 보기 →</a>
        </div>
      </article>
    </section>
  );
}

function RouteSection({ canCreateBirth }: { canCreateBirth: boolean }) {
  return (
    <section className="my-section" aria-labelledby="my-paths-title">
      <div className="my-section-head">
        <div><span className="my-section-kicker">YOUR DATA</span><h2 id="my-paths-title">내 정보와 이어지는 곳</h2></div>
        <p>같은 정보를 여러 화면에 복제하지 않고 각 화면의 역할로 이동합니다.</p>
      </div>
      <div className="my-route-grid">
        <a className="my-route-card is-primary" href="reading.html"><span className="my-route-index">01</span><span className="my-route-copy"><strong>내 사주</strong><span>계산된 명식과 오행 구조를 확인합니다.</span></span><span className="my-route-arrow" aria-hidden="true">→</span></a>
        <a className="my-route-card" id="my-birth-route" href={canCreateBirth ? 'birth.html' : '#my-birth-title'}>
          <span className="my-route-index">02</span>
          <span className="my-route-copy"><strong id="my-birth-route-title">{canCreateBirth ? '출생 정보 입력하기' : '현재 출생 정보 확인'}</strong><span id="my-birth-route-copy">{canCreateBirth ? '저장된 본인 출생 정보가 없으므로 새 원본 입력을 시작합니다.' : '현재 저장된 원본 입력을 이 화면에서 확인합니다. 수정 기능은 아직 열지 않습니다.'}</span></span>
          <span className="my-route-arrow" aria-hidden="true">→</span>
        </a>
        <a className="my-route-card" href="records.html"><span className="my-route-index">03</span><span className="my-route-copy"><strong>내 기록</strong><span>명식록 · 현세록 · 기억을 확인합니다.</span></span><span className="my-route-arrow" aria-hidden="true">→</span></a>
        <a className="my-route-card" href="chat-hub.html"><span className="my-route-index">04</span><span className="my-route-copy"><strong>대화 이어가기</strong><span>관계를 맺은 사람과 대화 화면으로 이동합니다.</span></span><span className="my-route-arrow" aria-hidden="true">→</span></a>
      </div>
    </section>
  );
}

export function MyPage() {
  const [account, setAccount] = useState<AccountState>({ kind: 'loading' });
  const [birth, setBirth] = useState<BirthState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    const client = createMyRuntimeClient();

    async function boot() {
      try {
        const payload = await client.readProfile() as ProfilePayload;
        if (!active) return;
        setAccount({ kind: 'ready', payload });
      } catch (error) {
        if (!active) return;
        const sessionRequired = error instanceof MyRuntimeError && error.code === 'WEB_MY_SESSION_REQUIRED';
        setAccount({
          kind: 'unavailable',
          message: sessionRequired
            ? '내 정보를 보려면 현재 세션이 필요합니다. 아래의 사주·기록·대화 진입은 로그인 전에도 확인할 수 있습니다.'
            : '현재 내 정보를 불러올 수 없습니다. 확인되지 않은 계정 정보를 대신 표시하지 않습니다.',
          login: sessionRequired,
          hasStoredMemberSession: Boolean(readMemberSession()),
        });
        setBirth({ kind: 'unavailable', message: sessionRequired ? '현재 세션이 연결되면 저장된 출생 정보를 확인할 수 있습니다.' : '현재 출생 정보를 확인할 수 없습니다.' });
        return;
      }

      try {
        const payload = await client.readBirthProfile() as BirthPayload;
        if (active) setBirth({ kind: 'ready', payload });
      } catch (error) {
        if (!active) return;
        if (error instanceof MyRuntimeError && error.code === 'WEB_MY_SESSION_REQUIRED') {
          if (error.status !== 403) {
            setAccount({
              kind: 'unavailable',
              message: '현재 세션 권한이 더 이상 유효하지 않아 내 정보를 표시하지 않습니다.',
              login: true,
              hasStoredMemberSession: Boolean(readMemberSession()),
            });
          }
          setBirth({ kind: 'unavailable', message: error.status === 403 ? '현재 세션 권한으로 출생 정보를 확인할 수 없습니다.' : '현재 세션 권한이 더 이상 유효하지 않아 출생 정보를 표시하지 않습니다.' });
          return;
        }
        setBirth({ kind: 'unavailable', message: '현재 출생 정보를 불러올 수 없습니다. 확인되지 않은 값을 대신 표시하지 않습니다.' });
      }
    }

    void boot();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== PRODUCT_AUTH_STORAGE_V1.memberSession) return;
      if (!shouldReloadMyForMemberSessionStorageChange({ pathname: location.pathname, oldValue: event.oldValue, newValue: event.newValue })) return;
      location.reload();
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const canCreateBirth = birth.kind === 'ready' && birth.payload.birthProfile === null;

  return (
    <div className="product-shell">
      <header className="my-head"><div><div className="my-kicker">MY MyeongHa</div><h1 className="my-title">내 명하를 관리합니다.</h1></div><p className="my-lead">계정과 원본 입력은 여기서 관리하고, 계산된 사주는 사주에서, 지나온 기록은 기록에서 확인합니다.</p></header>
      <AccountSection state={account} />
      <BirthSection state={birth} />
      <RouteSection canCreateBirth={canCreateBirth} />
      <section className="my-settings-section" aria-labelledby="my-settings-title">
        <div className="my-section-head"><div><span className="my-section-kicker">SETTINGS</span><h2 id="my-settings-title">설정과 계정 경계</h2></div></div>
        <div className="my-setting-grid">
          <article className="my-setting-card"><strong>알림 · 이용 권한</strong><p>알림과 이용 권한 설정은 준비 중입니다. 확인 가능한 설정 API가 연결되기 전에는 구독이나 알림 상태를 임의로 만들어 표시하지 않습니다.</p><span className="my-setting-state">준비 중</span></article>
          <article className="my-setting-card my-boundary-card"><strong>데이터 역할 분리</strong><p>마이는 계정과 입력 관리의 시작점입니다. 계산 결과는 사주, 이력은 기록, 관계와 대화는 대화 화면이 담당합니다.</p><span className="my-setting-state">제품 경계</span></article>
        </div>
      </section>
    </div>
  );
}
