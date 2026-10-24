import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createAuthPageController } from '../../auth-page.js';
import {
  createWebPortOneIdentityFlowV1,
  WEB_PORTONE_IDENTITY_FLOW_V1,
  type WebPortOneBrowserSdkPortV1,
} from '../../portone-v2-identity-flow.js';

type AuthMode = 'sign-in' | 'sign-up';
type StatusKind = '' | 'error' | 'success';
type SocialProvider = 'google' | 'kakao' | 'naver';

const SOCIAL_LOGIN_OPTIONS = Object.freeze([
  { provider: 'google', label: 'Google로 계속' },
  { provider: 'kakao', label: '카카오로 계속' },
  { provider: 'naver', label: '네이버로 계속' },
] as const satisfies readonly { provider: SocialProvider; label: string }[]);
type AuthController = {
  selectMode(mode: AuthMode): void;
  startSocial(provider: SocialProvider): Promise<void>;
  submit(input: { email: string; password: string; confirmation: string }): Promise<void>;
  dispose(): void;
};

async function loadPortOnePreenrollmentSdk(): Promise<WebPortOneBrowserSdkPortV1> {
  // Never imported before server-issued attempt succeeds.
  const sdkUrl = 'https://cdn.portone.io/v2/browser-sdk.esm.js';
  const loaded: unknown = await import(/* @vite-ignore */ sdkUrl);
  if (!loaded || typeof loaded !== 'object' ||
      !('requestIdentityVerification' in loaded) ||
      typeof loaded.requestIdentityVerification !== 'function') {
    throw new Error('PortOne SDK unavailable.');
  }
  return loaded as WebPortOneBrowserSdkPortV1;
}

function PreEnrollmentAgeSection() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    let active = true;
    async function check() {
      let permitted = false;
      try {
        const response = await fetch(
          WEB_PORTONE_IDENTITY_FLOW_V1.preenrollment.capabilityRoute,
          { method: 'GET', credentials: 'same-origin', cache: 'no-store' },
        );
        if (response.ok) {
          const payload: unknown = await response.json();
          permitted = !!payload && typeof payload === 'object' &&
            'data' in payload && !!payload.data &&
            typeof payload.data === 'object' &&
            'available' in payload.data && payload.data.available === true;
        }
      } catch {
        // An unreachable capability server is an OFF state.
      }
      if (active) setAvailable(permitted);
      const params = new URLSearchParams(window.location.search);
      if (!params.has('preenrollmentIdentity')) return;
      const url = new URL(window.location.href);
      for (const key of ['preenrollmentIdentity', 'identityVerificationId',
                         'code', 'message', 'pgCode', 'pgMessage']) {
        url.searchParams.delete(key);
      }
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      if (!permitted || !active) return;
      try {
        const flow = createWebPortOneIdentityFlowV1({
          origin: window.location.origin, preenrollment: true,
        });
        await flow.resumeFromRedirect(params);
        if (active) setStatus('가입 전 본인확인이 완료되었습니다. 회원 계정 연결은 별도 서버 확인 후 진행됩니다.');
      } catch {
        if (active) setStatus('가입 전 본인확인을 완료하지 못했습니다. 인증 절차를 다시 확인해 주세요.');
      }
    }
    void check();
    return () => { active = false; };
  }, []);

  async function start() {
    if (!available || busy) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await createWebPortOneIdentityFlowV1({
        origin: window.location.origin,
        preenrollment: true,
        sdkFactory: loadPortOnePreenrollmentSdk,
      }).start();
      setStatus(result.kind === 'verified'
        ? '가입 전 본인확인이 완료되었습니다. 회원 계정 연결은 별도 서버 확인 후 진행됩니다.'
        : '본인확인 화면에서 인증 절차를 완료해 주세요.');
    } catch {
      setStatus('가입 전 본인확인을 완료하지 못했습니다. 인증 절차를 다시 확인해 주세요.');
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-preserve-note" data-legal-preenrollment-age>
      <strong>가입 전 본인확인</strong>
      <p>만 14세 이상인지 본인확인 업체의 서버 결과로 확인합니다. 체크박스만으로 연령 확인이 완료되지는 않습니다.</p>
      {available ? (
        <button type="button" disabled={busy} data-legal-preenrollment-start
          onClick={() => void start()}>
          {busy ? '본인확인 진행 중…' : '가입 전 본인확인 시작'}
        </button>
      ) : (
        <p>가입 전 본인확인 기능은 현재 준비 중입니다. 승인 전에는 진행할 수 없습니다.</p>
      )}
      <p role="status" aria-live="polite">{status}</p>
    </div>
  );
}

export function AuthPage() {
  const controller = useRef<AuthController | null>(null);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [busy, setBusy] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [status, setStatus] = useState({ message: '', kind: '' as StatusKind });

  useLayoutEffect(() => {
    controller.current = createAuthPageController({
      setMode: (nextMode: AuthMode) => setMode(nextMode),
      setBusy: (nextBusy: boolean) => setBusy(nextBusy),
      setStatus: (message: string, kind: StatusKind) => setStatus({ message, kind }),
    }) as AuthController;
    return () => controller.current?.dispose();
  }, []);

  function handleSocialSignIn(provider: SocialProvider) {
    if (!ageConfirmed) {
      setStatus({ message: '만 14세 이상 이용 가능 여부를 먼저 확인해 주세요.', kind: 'error' });
      return;
    }
    void controller.current?.startSocial(provider);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (mode === 'sign-up' && !form.has('ageConfirmed')) {
      setStatus({ message: '만 14세 이상 이용 가능 여부를 먼저 확인해 주세요.', kind: 'error' });
      return;
    }
    void controller.current?.submit({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      confirmation: String(form.get('passwordConfirm') ?? ''),
    });
  }

  const signingUp = mode === 'sign-up';
  const submitLabel = busy ? signingUp ? '계정을 만드는 중…' : '로그인하는 중…' : signingUp ? '회원가입' : '로그인';

  return (
    <div className="auth-layout">
      <section className="auth-intro" aria-labelledby="auth-title">
        <span className="auth-intro-kicker">YOUR MyeongHa</span>
        <h1 id="auth-title">이어 보던 흐름을<br />내 계정으로 가져갑니다.</h1>
        <p>명하는 로그인 전에도 사주 입력과 탐색을 시작할 수 있습니다. 계정을 연결하면 인증된 회원 세션으로 같은 제품 흐름을 이어갈 수 있습니다.</p>
        <div className="auth-preserve-note">새 계정을 만드는 경우 현재 브라우저의 게스트 흐름을 보존한 채 계정 연결을 준비합니다. 기존 계정으로 로그인할 때는 서로 다른 사람의 기록을 임의로 합치지 않습니다.</div>
      </section>

      <section className="auth-card" aria-label="계정 인증">
        <div className="auth-tabs" role="tablist" aria-label="인증 방식">
          <button className="auth-tab" id="auth-tab-signin" type="button" role="tab" aria-selected={!signingUp} aria-controls="auth-form" onClick={() => controller.current?.selectMode('sign-in')}>로그인</button>
          <button className="auth-tab" id="auth-tab-signup" type="button" role="tab" aria-selected={signingUp} aria-controls="auth-form" onClick={() => controller.current?.selectMode('sign-up')}>회원가입</button>
        </div>

        <div className="auth-social" aria-label="소셜 로그인">
          <label className="auth-age-confirm" data-legal-age-self-declaration>
            <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.currentTarget.checked)} />
            저는 만 14세 이상입니다. 만 14세 미만은 보호자 동의 확인 기능이 준비되기 전까지 가입하거나 개인화 서비스를 이용할 수 없습니다.
          </label>
          <div className="auth-social-actions">
            {SOCIAL_LOGIN_OPTIONS.map(({ provider, label }) => (
              <button
                key={provider}
                className="auth-social-button"
                data-provider={provider}
                type="button"
                disabled={busy}
                onClick={() => handleSocialSignIn(provider)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="auth-divider" aria-hidden="true">
            <span>또는 이메일로 계속</span>
          </div>
        </div>

        {signingUp ? <PreEnrollmentAgeSection /> : null}

        <form className="auth-form" id="auth-form" noValidate onSubmit={handleSubmit}>
          <div className="auth-field"><label htmlFor="auth-email">이메일</label><input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={320} required /></div>
          <div className="auth-field"><label htmlFor="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} maxLength={1024} required /></div>
          <div className="auth-field" id="auth-confirm-field" hidden={!signingUp}><label htmlFor="auth-password-confirm">비밀번호 확인</label><input id="auth-password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" maxLength={1024} required={signingUp} /></div>
          <input type="hidden" name="ageConfirmed" value="1" disabled={!ageConfirmed} />
          <button className="auth-submit" id="auth-submit" type="submit" disabled={busy}>{submitLabel}</button>
          <p className={`auth-status${status.kind ? ` is-${status.kind}` : ''}`} id="auth-status" role="status" aria-live="polite">{status.message}</p>
        </form>
        <p className="auth-footnote" data-legal-minor-paid-policy>유료 해설 구매는 만 19세 이상만 가능합니다. 현재 공개 결제는 제공하지 않습니다.</p>
        <p className="auth-footnote">인증 정보는 명하 서버가 Supabase Auth 경계로 전달하며, 제품 페이지는 서버가 검증한 회원 토큰으로 사용자 데이터를 요청합니다.</p>
      </section>
    </div>
  );
}
