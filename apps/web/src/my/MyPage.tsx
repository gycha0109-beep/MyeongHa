import { useEffect, useState } from 'react';
import { createMyRuntimeClient, MyRuntimeError } from '../../my-runtime-client.js';
import { PRODUCT_AUTH_STORAGE_V1, readMemberSession, signOutMember } from '../../product-auth.js';
import { shouldReloadMyForMemberSessionStorageChange } from '../../product-auth-surface.js';
import { getUiLocale } from '../../ui-i18n.js';

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

type MyPanel = 'account' | 'memory' | 'orders' | 'passes' | 'birth' | 'display' | 'support' | null;
type Glyph = 'user' | 'memory' | 'bag' | 'ticket' | 'calendar' | 'palette' | 'chat' | 'chevron' | 'arrow' | 'logout' | 'moon';

function MyGlyph({ name }: { name: Glyph }) {
  const lines: Record<Glyph, string> = {
    user: 'M20 21a8 8 0 0 0-16 0 M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    memory: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z M9 7h7 M9 11h7',
    bag: 'M4 8h16l-1.2 13H5.2L4 8Z M9 9V6a3 3 0 0 1 6 0v3',
    ticket: 'M2 9V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a3 3 0 0 0 0 6v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a3 3 0 0 0 0-6Z M12 3v3 M12 10v4 M12 18v3',
    calendar: 'M3 5h18v16H3V5Z M7 2v6 M17 2v6 M3 10h18 M8 14h2 M13 14h2 M8 18h2',
    palette: 'M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 2.2-3.7 2 2 0 0 1 1.8-3h.5A3 3 0 0 0 21 11a8 8 0 0 0-9-8Z M7 12h.01 M9 7h.01 M15 7h.01',
    chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.7-5.1A8.5 8.5 0 1 1 21 11.5Z',
    chevron: 'm9 18 6-6-6-6',
    arrow: 'M5 12h14 m-6-6 6 6-6 6',
    logout: 'M10 17l5-5-5-5 M15 12H3 M13 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
    moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  };
  return <svg className="my-glyph" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={lines[name]} /></svg>;
}

function birthDateText(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? match[1] + '.' + match[2] + '.' + match[3] : '—';
}
function birthTimeText(input: BirthInput) {
  return input.timeKnown ? input.birthTime?.slice(0, 5) ?? '—' : '시간 모름';
}
function calendarText(input: BirthInput) {
  return input.calendarType === 'solar' ? '양력' : input.isLeapMonth ? '음력 윤달' : '음력';
}
function sexText(value: BirthInput['sex']) {
  if (value === 'male') return '남성';
  if (value === 'female') return '여성';
  return value === 'unspecified' ? '미지정' : '미입력';
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
    return <a className="my-auth-action my-connect-action" href="auth.html?next=my.html">{subjectKind === 'guest' ? '계정 연결' : '로그인하기'}</a>;
  }
  return <button className="my-auth-action my-logout-action" type="button" disabled={signingOut} onClick={() => void handleSignOut()}><MyGlyph name="logout" />{signingOut ? '로그아웃 중…' : '로그아웃'}</button>;
}

function Detail({ panel, account, birth }: { panel: Exclude<MyPanel, null>; account: AccountState; birth: BirthState }) {
  const payload = account.kind === 'ready' ? account.payload : null;
  const profile = payload?.profile;
  const session = readMemberSession();
  const input = birth.kind === 'ready' ? birth.payload.birthProfile?.currentRevision.input : null;
  const [locale, setLocale] = useState<string>(getUiLocale());
  function switchTheme() {
    document.querySelector<HTMLButtonElement>('.product-theme-toggle')?.click();
  }
  function changeLocale(next: string) {
    const picker = document.querySelector<HTMLSelectElement>('.ui-locale-select');
    if (!picker) return;
    picker.value = next;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    setLocale(next);
  }
  return (
    <div className="my-detail-panel" role="region" aria-label="선택한 관리 항목">
      {panel === 'account' ? (
        <>
          <h3>계정 정보</h3>
          {account.kind === 'loading' ? <p>계정 정보를 확인하는 중입니다…</p> : null}
          {account.kind === 'unavailable' ? <p>{account.message}</p> : null}
          {payload ? (
            <dl className="my-account-facts">
              <div><dt>로그인 이메일</dt><dd>{payload.subjectKind === 'member' ? session?.user?.email ?? '현재 세션에서 확인할 수 없습니다.' : '게스트 계정'}</dd></div>
              <div><dt>계정 유형</dt><dd>{payload.subjectKind === 'member' ? '회원' : '게스트'}</dd></div>
              <div><dt>계정 상태</dt><dd>{payload.subjectStatus === 'deletion_pending' ? '삭제 요청 진행 중' : '사용 중'}</dd></div>
              <div><dt>표시 언어</dt><dd>{profile?.locale ?? '정보 없음'}</dd></div>
            </dl>
          ) : null}
          {payload?.subjectKind === 'guest' || (account.kind === 'unavailable' && account.login) ? <a className="my-detail-link" href="auth.html?next=my.html">회원 계정 연결하기 <MyGlyph name="arrow" /></a> : null}
          <p className="my-detail-hint">프로필 변경 및 회원 탈퇴 요청은 검증된 서버 절차가 연결되기 전까지 이 화면에서 실행하지 않습니다.</p>
        </>
      ) : null}
      {panel === 'memory' ? (
        <>
          <h3>캐릭터 메모리 관리</h3>
          <p>캐릭터가 기억할 정보를 확인하고 직접 추가하거나 관리하는 공간입니다.</p>
          <p className="my-detail-hint">캐릭터별 메모리 조회·저장 기능은 아직 연결되지 않았습니다. 확인되지 않은 기억을 임의로 표시하거나 저장하지 않습니다.</p>
        </>
      ) : null}
      {panel === 'orders' ? (
        <>
          <h3>구매 내역</h3>
          <p>결제한 해석과 상품의 거래 내역을 확인하는 공간입니다.</p>
          <p className="my-detail-hint">구매 내역 조회가 연결되지 않았습니다. 구매 내역이 없다는 뜻은 아닙니다.</p>
        </>
      ) : null}
      {panel === 'passes' ? (
        <>
          <h3>내 이용권</h3>
          <p>보유 이용권, 사용 내역, 유효기간을 확인하는 공간입니다.</p>
          <p className="my-detail-hint">이용권 조회가 연결되지 않았습니다. 보유 수량이나 잔여 사용량을 추정하여 표시하지 않습니다.</p>
        </>
      ) : null}
      {panel === 'birth' ? (
        <>
          <h3>출생 정보</h3>
          {birth.kind === 'loading' ? <p>저장된 출생 정보를 확인하는 중입니다…</p> : null}
          {birth.kind === 'unavailable' ? <p>{birth.message}</p> : null}
          {birth.kind === 'ready' && !input ? <p>저장된 본인 출생 정보가 없습니다. <a className="my-detail-link" href="birth.html">출생 정보 입력하기 <MyGlyph name="arrow" /></a></p> : null}
          {input ? (
            <dl className="my-account-facts">
              <div><dt>생년월일</dt><dd>{birthDateText(input.birthDate)}</dd></div>
              <div><dt>출생 시간</dt><dd>{birthTimeText(input)}</dd></div>
              <div><dt>달력 기준</dt><dd>{calendarText(input)}</dd></div>
              <div><dt>성별</dt><dd>{sexText(input.sex)}</dd></div>
            </dl>
          ) : null}
          <p className="my-detail-hint">저장된 출생 정보를 조회하는 화면입니다. 수정 기능은 현재 준비 중입니다.</p>
        </>
      ) : null}
      {panel === 'display' ? (
        <>
          <h3>화면 및 언어</h3>
          <div className="my-display-actions">
            <button type="button" className="my-detail-link my-display-toggle" onClick={switchTheme}><MyGlyph name="moon" /> 라이트 · 다크 모드 전환</button>
            <label htmlFor="my-locale-select">표시 언어</label>
            <select id="my-locale-select" value={locale} onChange={event => changeLocale(event.target.value)}>
              <option value="ko-KR">한국어</option><option value="ja-JP">日本語</option><option value="zh-TW">繁體中文</option><option value="en-US">English</option><option value="zh-CN">简体中文</option>
            </select>
          </div>
        </>
      ) : null}
      {panel === 'support' ? (
        <>
          <h3>문의</h3>
          <p>명하 이용 중 불편한 사항을 관리자에게 문의할 수 있는 공간입니다.</p>
          <p className="my-detail-hint">관리자 문의 페이지와 접수 기능은 준비 중입니다. 이 화면에서는 아직 문의를 제출할 수 없습니다.</p>
        </>
      ) : null}
    </div>
  );
}

function Choice({ title, description, glyph, open, onClick }: {
  title: string; description: string; glyph: Glyph; open: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className="my-choice-card" aria-expanded={open} onClick={onClick}>
      <span className="my-icon-circle"><MyGlyph name={glyph} /></span>
      <span className="my-choice-copy"><strong>{title}</strong><span>{description}</span></span>
      <span className="my-chevron"><MyGlyph name="chevron" /></span>
    </button>
  );
}

export function MyPage() {
  const [activePanel, setActivePanel] = useState<MyPanel>(null);
  const [account, setAccount] = useState<AccountState>({ kind: 'loading' });
  const [birth, setBirth] = useState<BirthState>({ kind: 'loading' });
  const payload = account.kind === 'ready' ? account.payload : null;
  const memberSession = readMemberSession();
  const memberEmail = payload?.subjectKind === 'member' ? memberSession?.user?.email ?? '로그인 이메일 확인 중' : '계정 연결이 필요합니다.';
  const accountBadge = payload?.subjectStatus === 'deletion_pending' ? '삭제 요청 진행 중' : payload?.subjectKind === 'member' ? '회원 계정' : payload?.subjectKind === 'guest' ? '게스트' : '확인 중';

  useEffect(() => {
    let active = true;
    const client = createMyRuntimeClient();
    async function boot() {
      try {
        const data = await client.readProfile() as ProfilePayload;
        if (!active) return;
        setAccount({ kind: 'ready', payload: data });
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
        const data = await client.readBirthProfile() as BirthPayload;
        if (active) setBirth({ kind: 'ready', payload: data });
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

  function toggle(panel: Exclude<MyPanel, null>) {
    setActivePanel(current => current === panel ? null : panel);
  }
  function details(panel: Exclude<MyPanel, null>) {
    return activePanel === panel ? <Detail key={panel} panel={panel} account={account} birth={birth} /> : null;
  }

  return (
    <div className="my-page-shell">
      <div className="my-hero">
        <div className="product-shell my-hero-inner">
          <span className="my-kicker">MY PAGE</span>
          <h1 className="my-title" id="my-page-title">마이페이지</h1>
          <p className="my-lead">내 계정과 이용 정보를 관리합니다.</p>
        </div>
      </div>

      <div className="product-shell my-dashboard">
        <section className="my-account-section" aria-label="계정 정보">
          <button type="button" className="my-account-card" aria-expanded={activePanel === 'account'} aria-controls="my-account-panel" onClick={() => toggle('account')}>
            <span className="my-account-avatar"><MyGlyph name="user" /></span>
            <span className="my-account-copy">
              <strong>계정 정보</strong>
              <span className="my-account-meta">{account.kind === 'ready' ? memberEmail : '내 계정 정보를 확인하세요.'} <span className="my-account-badge">{accountBadge}</span></span>
            </span>
            <span className="my-account-action">계정 정보 관리하기 <MyGlyph name="chevron" /></span>
          </button>
          <div id="my-account-panel">{details('account')}</div>
        </section>

        <section className="my-memory-section" aria-labelledby="my-memory-title">
          <div className="my-memory-copy">
            <h2 id="my-memory-title">캐릭터 메모리</h2>
            <p>대화 중 기억한 내용과 내가 직접 추가한 내용을<br className="my-desktop-break" /> 확인하고 관리합니다.</p>
            <button type="button" className="my-primary-action" onClick={() => toggle('memory')} aria-expanded={activePanel === 'memory'}>메모리 관리하기 <MyGlyph name="chevron" /></button>
          </div>
        </section>
        {details('memory')}

        <section className="my-section-card my-commerce-section" aria-labelledby="my-commerce-title">
          <div className="my-section-heading">
            <h2 id="my-commerce-title">구매 내역 · 내 이용권</h2>
            <p>결제한 상품과 보유 이용권을 확인합니다.</p>
          </div>
          <div className="my-choice-grid">
            <Choice title="구매 내역" description="결제한 상품 및 거래 내역" glyph="bag" open={activePanel === 'orders'} onClick={() => toggle('orders')} />
            <Choice title="내 이용권" description="보유 이용권 · 사용 내역 · 유효기간" glyph="ticket" open={activePanel === 'passes'} onClick={() => toggle('passes')} />
          </div>
          {activePanel === 'orders' ? details('orders') : activePanel === 'passes' ? details('passes') : null}
        </section>

        <section className="my-section-card my-settings-section" aria-labelledby="my-settings-title">
          <div className="my-section-heading">
            <h2 id="my-settings-title">설정 및 지원</h2>
            <p>서비스 이용을 위한 설정과 문의를 관리합니다.</p>
          </div>
          <div className="my-choice-grid my-settings-grid">
            <Choice title="출생 정보" description="사주 계산에 사용하는 정보 관리" glyph="calendar" open={activePanel === 'birth'} onClick={() => toggle('birth')} />
            <Choice title="화면 및 언어" description="테마 · 언어 설정" glyph="palette" open={activePanel === 'display'} onClick={() => toggle('display')} />
            <Choice title="문의" description="관리자에게 문의하기" glyph="chat" open={activePanel === 'support'} onClick={() => toggle('support')} />
          </div>
          {activePanel === 'birth' ? details('birth') : activePanel === 'display' ? details('display') : activePanel === 'support' ? details('support') : null}
        </section>

        <footer className="my-footer">
          <span>MYEONGHA · 나를 이해하는 또 하나의 방법</span>
          <AuthActions subjectKind={payload?.subjectKind} hasStoredMemberSession={Boolean(memberSession)} />
        </footer>
      </div>
    </div>
  );
}
