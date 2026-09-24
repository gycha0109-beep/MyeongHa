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
  subjectKind: ProfilePayload['subjectKind'] | undefined;
  hasStoredMemberSession: boolean;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const canSignOut = hasStoredMemberSession && subjectKind !== 'guest';

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutMember();
      location.assign('auth.html?next=hall.html');
    } catch {
      setSigningOut(false);
    }
  }

  if (!canSignOut) {
    return (
      <a className="my-auth-action my-connect-action" href="auth.html?next=my.html">
        {subjectKind === 'guest' ? '계정 연결' : '로그인하기 →'}
      </a>
    );
  }

  return (
    <button className="my-auth-action my-logout-action" type="button" disabled={signingOut} onClick={() => void handleSignOut()}>
      {signingOut ? '로그아웃 중…' : '로그아웃'}
    </button>
  );
}

function ProfileHome({ state }: { state: AccountState }) {
  const payload = state.kind === 'ready' ? state.payload : null;
  const profile = payload?.profile;
  const memberSession = payload ? readMemberSession() : null;
  const hasStoredMemberSession = state.kind === 'unavailable'
    ? state.hasStoredMemberSession
    : Boolean(memberSession);
  const displayName = profile?.displayName?.trim() || '호칭을 설정해주세요';
  const email = payload?.subjectKind === 'member'
    ? memberSession?.user?.email ?? '로그인 계정 확인 중'
    : '게스트로 둘러보는 중';

  return (
    <header className="my-home-hero" aria-labelledby="my-page-title">
      <div className="my-hero-orbit" aria-hidden="true"><span>明</span></div>
      <div className="my-hero-copy">
        <span className="my-kicker">MY MYEONGHA</span>
        <h1 className="my-title" id="my-page-title">길어진 하루 끝에<br />다시 나를 보는 곳.</h1>
        <p className="my-lead">내 정보와 명하에서 이어지는 사주, 기록, 대화를 한곳에서 살펴봅니다.</p>
      </div>

      <div className="my-status" id="my-status" role="status" hidden={state.kind === 'ready'}>
        {state.kind === 'loading'
          ? '내 정보를 불러오는 중입니다…'
          : state.kind === 'unavailable' ? state.message : ''}
        {state.kind === 'unavailable' && state.login ? (
          <div className="my-status-action">
            <AuthActions subjectKind={undefined} hasStoredMemberSession={hasStoredMemberSession} />
          </div>
        ) : null}
      </div>

      <div id="my-content" hidden={state.kind !== 'ready'}>
        <article className="my-identity-card">
          <div className="my-profile-mark" aria-hidden="true">之</div>
          <div className="my-profile-copy">
            <strong className="my-profile-name" id="my-display-name">{displayName}</strong>
            <span className="my-profile-email" id="my-account-email">{email}</span>
          </div>
          <a className="my-profile-manage" href="#my-settings-title">내 정보 관리 <span aria-hidden="true">→</span></a>

          <div className="my-runtime-meta" aria-hidden="true">
            <span id="my-subject-kind">{payload?.subjectKind === 'member' ? '회원' : payload?.subjectKind === 'guest' ? '게스트' : ''}</span>
            <span id="my-subject-status">{payload?.subjectStatus === 'deletion_pending' ? '삭제 요청 진행 중' : payload?.subjectStatus === 'active' ? '사용 중' : ''}</span>
            <span id="my-locale">{profile?.locale ?? ''}</span>
            <span id="my-timezone">{profile?.timezone ?? ''}</span>
            <span id="my-onboarding-state">{profile?.onboardingState ?? ''}</span>
            <span id="my-profile-updated">{profile?.updatedAt ?? ''}</span>
            <span id="my-account-note">
              {payload?.subjectKind === 'member'
                ? '로그인한 회원 세션으로 현재 계정의 저장된 흐름을 이어갑니다.'
                : '현재 브라우저의 게스트 흐름입니다. 계정 연결 전까지 회원 기록으로 가정하지 않습니다.'}
            </span>
          </div>
        </article>
      </div>
    </header>
  );
}

function BirthSection({ state }: { state: BirthState }) {
  const birthProfile = state.kind === 'ready' ? state.payload.birthProfile : null;
  const input = birthProfile?.currentRevision.input;
  const isEmpty = state.kind === 'ready' && state.payload.birthProfile === null;

  return (
    <section className="my-today-section" aria-labelledby="my-birth-title">
      <div className="my-section-intro">
        <span className="my-section-kicker">TODAY</span>
        <h2 id="my-birth-title">오늘의 나</h2>
        <p>내 사주의 기준이 되는 출생 정보입니다.</p>
      </div>

      <div className="my-status my-birth-status" id="my-birth-status" role="status" hidden={Boolean(birthProfile)}>
        {state.kind === 'loading'
          ? '출생 정보를 확인하는 중입니다…'
          : state.kind === 'unavailable'
            ? state.message
            : isEmpty ? (
              <>
                저장된 본인 출생 정보가 없습니다.
                <a href="birth.html">출생 정보 입력하기 →</a>
              </>
            ) : ''}
      </div>

      <article className="my-birth-card" id="my-birth-content" hidden={!birthProfile}>
        <div className="my-birth-art" aria-hidden="true">
          <span className="my-birth-moon" />
          <span className="my-birth-orbit" />
        </div>

        <dl className="my-birth-facts">
          <div>
            <dt>생년월일</dt>
            <dd id="my-birth-date">{input ? birthDateText(input.birthDate) : ''}</dd>
          </div>
          <div>
            <dt>태어난 시간</dt>
            <dd id="my-birth-time">{input ? birthTimeText(input) : ''}</dd>
          </div>
          <div>
            <dt>기준</dt>
            <dd className="my-birth-basis">
              <span id="my-birth-calendar">{input ? calendarText(input) : ''}</span>
              <span aria-hidden="true">·</span>
              <span id="my-birth-sex">{input ? sexText(input.sex) : ''}</span>
            </dd>
          </div>
        </dl>

        <div className="my-birth-actions">
          <a className="my-primary-action" href="reading.html">내 사주 보기 <span aria-hidden="true">→</span></a>
          <span className="my-secondary-action is-disabled" aria-disabled="true">출생 정보 수정 준비 중</span>
        </div>

        <span className="my-runtime-meta" id="my-birth-revision" aria-hidden="true">
          {birthProfile ? `현재 입력 · revision ${birthProfile.currentRevision.revisionNo}` : ''}
        </span>
      </article>
    </section>
  );
}

function FlowSection() {
  return (
    <section className="my-flow-section" aria-labelledby="my-flow-title">
      <div className="my-section-intro">
        <span className="my-section-kicker">MY FLOW</span>
        <h2 id="my-flow-title">내 흐름</h2>
        <p>지금의 나를 이해하고, 지나온 기록과 대화를 계속 이어갑니다.</p>
      </div>

      <div className="my-flow-grid">
        <a className="my-route-card my-flow-primary" href="reading.html">
          <span className="my-flow-symbol" aria-hidden="true">命</span>
          <span className="my-route-copy">
            <span className="my-route-kicker">SAJU</span>
            <strong>내 사주</strong>
            <span>지금의 사주 흐름과 해석을 다시 확인합니다.</span>
          </span>
          <span className="my-route-cta">사주 보기 <span aria-hidden="true">→</span></span>
        </a>

        <div className="my-flow-side">
          <a className="my-route-card" href="records.html">
            <span className="my-route-icon" aria-hidden="true">▤</span>
            <span className="my-route-copy"><strong>내 기록</strong><span>지난 해석과 저장된 기록을 확인합니다.</span></span>
            <span className="my-route-arrow" aria-hidden="true">→</span>
          </a>
          <a className="my-route-card" href="chat-hub.html">
            <span className="my-route-icon" aria-hidden="true">◌</span>
            <span className="my-route-copy"><strong>이어지는 대화</strong><span>이전에 나눈 대화를 계속 이어갑니다.</span></span>
            <span className="my-route-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function RecentSection() {
  const items = [
    { label: '사주', detail: '내 사주에서 현재 해석을 확인합니다.', href: 'reading.html', action: '사주 열기', icon: '✦' },
    { label: '대화', detail: '대화 허브에서 이어갈 상대를 선택합니다.', href: 'chat-hub.html', action: '대화 열기', icon: '◌' },
    { label: '기록', detail: '지나온 기록에서 저장된 내용을 확인합니다.', href: 'records.html', action: '기록 열기', icon: '▤' },
  ] as const;

  return (
    <section className="my-recent-section" aria-labelledby="my-recent-title">
      <div className="my-section-intro">
        <span className="my-section-kicker">CONTINUE</span>
        <h2 id="my-recent-title">최근 이어진 것</h2>
        <p>최근 활동의 실제 내용은 각 화면에서 확인하고, 여기서는 바로 이어갈 길만 보여줍니다.</p>
      </div>
      <div className="my-recent-grid">
        {items.map((item) => (
          <a className="my-recent-card" href={item.href} key={item.label}>
            <span className="my-recent-icon" aria-hidden="true">{item.icon}</span>
            <span className="my-recent-copy"><strong>{item.label}</strong><span>{item.detail}</span></span>
            <span className="my-recent-action">{item.action} <span aria-hidden="true">→</span></span>
          </a>
        ))}
      </div>
    </section>
  );
}

function SettingsSection({ account }: { account: AccountState }) {
  const payload = account.kind === 'ready' ? account.payload : null;
  const hasStoredMemberSession = account.kind === 'unavailable'
    ? account.hasStoredMemberSession
    : Boolean(payload && readMemberSession());

  return (
    <section className="my-settings-section" aria-labelledby="my-settings-title">
      <div className="my-section-intro">
        <span className="my-section-kicker">SETTINGS</span>
        <h2 id="my-settings-title">설정</h2>
        <p>계정과 이용 환경에 필요한 항목을 한곳에 모았습니다.</p>
      </div>

      <div className="my-settings-list">
        <div className="my-setting-row is-pending"><span className="my-setting-icon" aria-hidden="true">♧</span><strong>알림 설정</strong><span>준비 중</span></div>
        <div className="my-setting-row is-pending"><span className="my-setting-icon" aria-hidden="true">◇</span><strong>이용권 · 결제</strong><span>준비 중</span></div>
        <div className="my-setting-row is-pending"><span className="my-setting-icon" aria-hidden="true">⚙</span><strong>계정 관리</strong><span>준비 중</span></div>
        <div className="my-setting-row is-pending"><span className="my-setting-icon" aria-hidden="true">?</span><strong>고객지원</strong><span>준비 중</span></div>
        <div className="my-setting-row my-setting-auth">
          <span className="my-setting-icon" aria-hidden="true">{payload?.subjectKind === 'member' ? '↪' : '之'}</span>
          <strong>{payload?.subjectKind === 'member' ? '로그아웃' : '계정 연결'}</strong>
          <AuthActions subjectKind={payload?.subjectKind} hasStoredMemberSession={hasStoredMemberSession} />
        </div>
      </div>

      <p className="my-settings-note">알림과 이용 권한 설정은 준비 중입니다. 연결되지 않은 설정 상태를 임의로 표시하지 않습니다.</p>
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
            ? '내 정보를 보려면 현재 세션이 필요합니다. 사주·기록·대화 화면은 계속 둘러볼 수 있습니다.'
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

  return (
    <div className="product-shell my-page-shell">
      <ProfileHome state={account} />
      <BirthSection state={birth} />
      <FlowSection />
      <RecentSection />
      <SettingsSection account={account} />
    </div>
  );
}
