import { useEffect, useRef, useState } from 'react';
import { BirthRuntimeError, createBirthRuntimeClient } from '../../birth-runtime-client.js';
import { PRODUCT_AUTH_STORAGE_V1 } from '../../product-auth.js';
import { shouldReloadBirthForMemberSessionStorageChange } from '../../product-auth-surface.js';

type CurrentBirth = { revisionNo?: number };
type CreateReceipt = { revisionNo: number };
type BirthView =
  | { kind: 'loading' }
  | { kind: 'create' }
  | { kind: 'existing'; current: CurrentBirth }
  | { kind: 'success'; receipt: CreateReceipt }
  | { kind: 'error'; message: string; allowForm: boolean };

const client = createBirthRuntimeClient();

function requestFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const birthDate = String(data.get('birthDate') ?? '');
  const timeKnown = !data.has('timeUnknown');
  const birthTime = timeKnown ? String(data.get('birthTime') ?? '') : null;
  const calendarType = data.get('calendar') === 'lunar' ? 'lunar' : 'solar';
  const sexValue = String(data.get('sex') ?? '');

  if (!birthDate) {
    throw new BirthRuntimeError('WEB_BIRTH_INVALID_REQUEST', '생년월일을 입력해 주세요.');
  }
  if (timeKnown && !birthTime) {
    throw new BirthRuntimeError('WEB_BIRTH_INVALID_REQUEST', '태어난 시각을 입력하거나 시각 모름을 선택해 주세요.');
  }

  return Object.freeze({
    label: null,
    input: Object.freeze({
      calendarType,
      birthDate,
      birthTime,
      timeKnown,
      isLeapMonth: calendarType === 'lunar' ? data.has('isLeapMonth') : false,
      sex: sexValue === 'male' || sexValue === 'female' || sexValue === 'unspecified' ? sexValue : null,
    }),
  });
}

function failureView(error: unknown): BirthView {
  if (error instanceof BirthRuntimeError) {
    switch (error.code) {
      case 'WEB_BIRTH_SESSION_REQUIRED':
      case 'WEB_BIRTH_SESSION_PREPARE_FAILED':
        return { kind: 'error', message: '현재 세션을 확인하지 못했습니다. 서버에서 현재 출생 정보를 확인하기 전에는 새 명식록 생성을 허용하지 않습니다.', allowForm: false };
      case 'WEB_BIRTH_INVALID_REQUEST':
        return { kind: 'error', message: error.message || '입력값을 확인해 주세요.', allowForm: true };
      case 'WEB_BIRTH_NOT_AVAILABLE':
        return { kind: 'error', message: '현재 계정에서는 명식록을 만들 수 없습니다.', allowForm: false };
      case 'WEB_BIRTH_MALFORMED_CURRENT':
      case 'WEB_BIRTH_CURRENT_REQUEST_FAILED':
        return { kind: 'error', message: '현재 저장된 출생 정보를 확인할 수 없습니다. 중복 생성을 막기 위해 새 명식록 입력을 잠갔습니다.', allowForm: false };
      default:
        return { kind: 'error', message: '명식록을 저장하지 못했습니다. 서버 command가 성공하기 전에는 저장된 것으로 표시하지 않습니다.', allowForm: false };
    }
  }
  return { kind: 'error', message: '명식록을 저장하지 못했습니다. 서버 상태를 확인하기 전에는 새 명식록 입력을 허용하지 않습니다.', allowForm: false };
}

function StatusPanel({ view }: { view: BirthView }) {
  const visible = view.kind === 'loading' || view.kind === 'success' || view.kind === 'error';
  const tone = view.kind === 'success' ? 'success' : view.kind === 'error' ? 'error' : 'neutral';

  return (
    <div className="panel" id="birth-status" role="status" style={{ padding: 18, marginBottom: 20 }} hidden={!visible} data-tone={visible ? tone : undefined}>
      {view.kind === 'loading' ? '현재 저장된 출생 정보를 확인하는 중입니다…' : null}
      {view.kind === 'error' ? view.message : null}
      {view.kind === 'success' ? (
        <><strong>{`명식록 revision ${view.receipt.revisionNo}이 저장되었습니다.`}</strong><br /><a className="button button-primary" href="my.html#my-birth-title" style={{ marginTop: 12, marginRight: 8 }}>My에서 확인하기 →</a><a className="button button-secondary" href="reading.html" style={{ marginTop: 12, marginRight: 8 }}>사주에서 결과 보기 →</a></>
      ) : null}
    </div>
  );
}

function ExistingPanel({ view }: { view: BirthView }) {
  const current = view.kind === 'existing' ? view.current : null;
  return (
    <article className="panel birth-panel" id="birth-existing" hidden={!current}>
      <div className="eyebrow">CURRENT BIRTH PROFILE</div>
      <h2 style={{ margin: '8px 0 10px' }}>이미 저장된 출생 정보가 있습니다.</h2>
      <p className="lead" style={{ fontSize: '1rem' }}>현재 production에는 기존 입력을 수정하는 PATCH transport가 연결되어 있지 않습니다. 이 화면에서는 두 번째 본인 Birth Profile을 만들지 않습니다.</p>
      <p className="fine" id="birth-existing-revision">{current?.revisionNo ? `현재 저장된 revision ${current.revisionNo}을 My에서 확인할 수 있습니다.` : current ? '현재 저장된 출생 정보를 My에서 확인할 수 있습니다.' : ''}</p>
      <div className="birth-submit" style={{ gap: 10, flexWrap: 'wrap' }}><a className="button button-primary" href="my.html#my-birth-title">My에서 확인하기 →</a><a className="button button-secondary" href="reading.html">사주에서 결과 보기 →</a></div>
    </article>
  );
}

function CreateForm({ view, busy, onSubmit }: { view: BirthView; busy: boolean; onSubmit(event: React.FormEvent<HTMLFormElement>): void }) {
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>('solar');
  const visible = view.kind === 'create' || (view.kind === 'error' && view.allowForm);

  return (
    <form className="panel birth-panel" id="birth-form" noValidate hidden={!visible} onSubmit={onSubmit}>
      <div className="form-row"><label className="form-label" htmlFor="birth-date">생년월일</label><div><input className="input" id="birth-date" name="birthDate" type="date" required /><div className="fine">선택한 달력 기준의 날짜를 입력합니다.</div></div></div>
      <div className="form-row"><label className="form-label" htmlFor="birth-time">태어난 시각</label><div><div className="field-grid two"><input className="input" id="birth-time" name="birthTime" type="time" step="60" required={!timeUnknown} disabled={timeUnknown} /><label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-soft)' }}><input id="birth-time-unknown" name="timeUnknown" type="checkbox" onChange={(event) => setTimeUnknown(event.currentTarget.checked)} /> 시각 모름</label></div><div className="fine">시각을 모르면 별도 추정값을 만들지 않고 null로 저장합니다.</div></div></div>
      <div className="form-row"><span className="form-label">달력 기준</span><div><div className="choice-line"><label><input type="radio" name="calendar" value="solar" defaultChecked onChange={() => setCalendar('solar')} /> 양력 (Solar)</label><label><input type="radio" name="calendar" value="lunar" onChange={() => setCalendar('lunar')} /> 음력 (Lunar)</label></div><label id="birth-leap-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--text-soft)' }} hidden={calendar !== 'lunar'}><input id="birth-leap-month" name="isLeapMonth" type="checkbox" disabled={calendar !== 'lunar'} /> 윤달</label></div></div>
      <div className="form-row"><label className="form-label" htmlFor="birth-sex">성별 입력</label><div><select className="select" id="birth-sex" name="sex"><option value="">선택하지 않음</option><option value="male">남성</option><option value="female">여성</option><option value="unspecified">미지정</option></select><div className="fine">선택하지 않으면 null로 전송합니다.</div></div></div>
      <div className="birth-submit"><button className="button button-primary" id="birth-submit-button" type="submit" disabled={busy}>{busy ? '확인 중…' : '명식록 저장하기 →'}</button></div>
      <p className="fine" style={{ textAlign: 'center' }}>현재 create contract가 허용하지 않는 출생지·클라이언트 ID·해시 값은 전송하지 않습니다.</p>
    </form>
  );
}

export function BirthPage() {
  const [view, setView] = useState<BirthView>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let active = true;
    void client.readCurrentBirthProfile()
      .then((current: CurrentBirth | null) => {
        if (active) setView(current ? { kind: 'existing', current } : { kind: 'create' });
      })
      .catch((error: unknown) => {
        if (active) setView(failureView(error));
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== PRODUCT_AUTH_STORAGE_V1.memberSession) return;
      if (!shouldReloadBirthForMemberSessionStorageChange({ pathname: '/birth.html', oldValue: event.oldValue, newValue: event.newValue })) return;
      window.history.go(0);
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  async function submitBirthProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const form = event.currentTarget;
    busyRef.current = true;
    setBusy(true);
    if (view.kind === 'error' && view.allowForm) setView({ kind: 'create' });

    try {
      const current = await client.readCurrentBirthProfile() as CurrentBirth | null;
      if (current) {
        setView({ kind: 'existing', current });
        return;
      }
      const request = requestFromForm(form);
      const receipt = await client.createBirthProfile(request) as CreateReceipt;
      setView({ kind: 'success', receipt });
    } catch (error) {
      setView(failureView(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="page"><div className="shell birth-wrap">
      <a className="backlink" href="records.html">← 기록으로 돌아가기</a>
      <div className="birth-intro"><div className="eyebrow">BIRTH PROFILE</div><h1 className="display display-lg">태어난 순간의 기록을 엽니다.</h1><p className="lead">명식 계산에 필요한 원본 입력만 저장합니다. Birth Profile과 첫 revision의 식별자는 서버가 생성하며, 브라우저에서는 지정하지 않습니다.</p></div>
      <StatusPanel view={view} />
      <ExistingPanel view={view} />
      <CreateForm view={view} busy={busy} onSubmit={submitBirthProfile} />
    </div></section>
  );
}
