import { useLayoutEffect, useRef, useState } from 'react';
import { createAuthPageController } from '../../auth-page.js';

type AuthMode = 'sign-in' | 'sign-up';
type StatusKind = '' | 'error' | 'success';
type AuthController = {
  selectMode(mode: AuthMode): void;
  submit(input: { email: string; password: string; confirmation: string }): Promise<void>;
  dispose(): void;
};

export function AuthPage() {
  const controller = useRef<AuthController | null>(null);
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ message: '', kind: '' as StatusKind });

  useLayoutEffect(() => {
    controller.current = createAuthPageController({
      setMode: (nextMode: AuthMode) => setMode(nextMode),
      setBusy: (nextBusy: boolean) => setBusy(nextBusy),
      setStatus: (message: string, kind: StatusKind) => setStatus({ message, kind }),
    }) as AuthController;
    return () => controller.current?.dispose();
  }, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
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

        <form className="auth-form" id="auth-form" noValidate onSubmit={handleSubmit}>
          <div className="auth-field"><label htmlFor="auth-email">이메일</label><input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={320} required /></div>
          <div className="auth-field"><label htmlFor="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} maxLength={1024} required /></div>
          <div className="auth-field" id="auth-confirm-field" hidden={!signingUp}><label htmlFor="auth-password-confirm">비밀번호 확인</label><input id="auth-password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" maxLength={1024} required={signingUp} /></div>
          <button className="auth-submit" id="auth-submit" type="submit" disabled={busy}>{submitLabel}</button>
          <p className={`auth-status${status.kind ? ` is-${status.kind}` : ''}`} id="auth-status" role="status" aria-live="polite">{status.message}</p>
        </form>
        <p className="auth-footnote">인증 정보는 명하 서버가 Supabase Auth 경계로 전달하며, 제품 페이지는 서버가 검증한 회원 토큰으로 사용자 데이터를 요청합니다.</p>
      </section>
    </div>
  );
}
