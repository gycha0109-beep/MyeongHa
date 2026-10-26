import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchAdminReadV1, signInForAdminSessionV1 } from './admin-client.js';
import type { AdminReadResponse } from './admin-client.js';
import type { AdminSection } from './routes.js';
import { StatusPanel } from './StatusPanel.js';

type ListSection = Exclude<AdminSection, 'overview'>;
type ReadTab = 'commerce' | 'credits' | 'readings' | 'ai-costs' | 'ai-estimates' | 'issues' | 'catalog';
const DATA_PATHS: Record<ListSection, string> = {
  users: 'users',
  commerce: 'commerce',
  readings: 'readings',
  analytics: 'analytics',
  issues: 'issues',
};

const LABELS: Record<string, string> = {
  subjectId: '사용자 참조',
  kind: '구분',
  status: '상태',
  createdAt: '생성일',
  lastActivityAt: '최근 활동',
  readingsCount: 'Reading 수',
  verifiedPurchasesCount: '검증된 구매 수',
  availableCredits: '가용 크레딧',
  transactionId: '거래 참조',
  productKey: '상품',
  amountMinor: '검증 금액',
  currency: '통화',
  providerStatus: '결제 검증',
  verifiedAt: '검증일',
  entitlementStatus: '보유 권한',
  readingId: 'Reading 참조',
  domain: '사주 영역',
  engineVersion: '엔진 버전',
  errorCode: '오류',
  day: '집계일',
  feature: '기능',
  model: '모델',
  requests: '호출',
  successes: '성공',
  failures: '실패',
  totalTokens: '토큰',
  costKrw: '원화 비용',
  p95LatencyMs: 'P95 지연',
  estimatedMicroUsd: '추정 비용(마이크로 USD)',
  unknownCostCalls: '원가 미확인 호출',
  costStatus: '원가 근거',
  productType: '상품 종류',
  catalogEnabled: '카탈로그 활성',
  offerCount: '제안 수',
  issueId: '이슈 참조',
  category: '이슈 유형',
  severity: '심각도',
  requestId: '요청 참조',
};

function isSubjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function buildListPath(section: ListSection, subject: string, cursor: string | null, tab: ReadTab): string {
  const params = new URLSearchParams({ limit: '20' });
  if (subject.length > 0) params.set('subjectId', subject);
  if (cursor !== null) params.set('cursor', cursor);
  return '/api/admin/' + tab + '?' + params.toString();
}

function DataTable({ result, section, onDetail }: {
  readonly result: AdminReadResponse;
  readonly section: ListSection;
  readonly onDetail: (id: string) => void;
}) {
  if (result.rows.length === 0) {
    return <StatusPanel kind="empty" detail="해당 범위에서 실제 조회된 데이터가 없습니다." />;
  }
  const columns = Object.keys(LABELS).filter(k => result.rows.some(row => k in row));
  return <div className="admin-table-scroll">
    <table className="admin-table">
      <thead><tr>{columns.map(k => <th scope="col" key={k}>{LABELS[k]}</th>)}
        {section === 'users' && <th scope="col">상세</th>}</tr></thead>
      <tbody>{result.rows.map((row, i) => <tr key={String(row.subjectId ?? row.transactionId ?? row.readingId ?? row.issueId ?? i)}>
        {columns.map(k => <td key={k}>{row[k] === null || row[k] === undefined ? '—' : String(row[k])}</td>)}
        {section === 'users' && <td>{typeof row.subjectId === 'string' && isSubjectId(row.subjectId)
          ? <button type="button" className="table-link" onClick={() => onDetail(String(row.subjectId))}>조회</button>
          : '—'}</td>}
      </tr>)}</tbody>
    </table>
  </div>;
}

export function AdminLogin({ onSession }: {
  readonly onSession: (token: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const token = await signInForAdminSessionV1(email.trim(), password);
      setPassword('');
      onSession(token);
    } catch {
      setError('관리자 세션을 시작할 수 없습니다. 인증 서버 연결 또는 권한을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="surface admin-login" aria-label="운영자 세션">
    <span className="section-kicker">OWNER ACCESS</span>
    <h2>운영자 계정 확인</h2>
    <p>기존 명하 회원 계정으로 인증한 뒤 서버의 별도 Owner 허용 목록을 확인합니다. 단순 회원 로그인만으로는 관리자 데이터에 접근할 수 없습니다.</p>
    <form onSubmit={handleLogin}>
      <label>이메일<input type="email" autoComplete="username" required value={email}
        onChange={e => setEmail(e.target.value)} maxLength={254} /></label>
      <label>비밀번호<input type="password" autoComplete="current-password" required value={password}
        onChange={e => setPassword(e.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? '확인 중' : '인증 요청'}</button>
    </form>
    {error && <p className="login-error" role="alert">{error}</p>}
    <p className="login-footnote">토큰은 이 화면의 메모리에만 유지됩니다. 새로고침하거나 로그아웃하면 다시 인증해야 합니다. 독립 관리자 서버가 연결되지 않았다면 사용할 수 없습니다.</p>
  </section>;
}

export function AdminWorkbench({ section, token, onSessionExpired }: {
  readonly section: ListSection;
  readonly token: string;
  readonly onSessionExpired: () => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ReadTab>(() => DATA_PATHS[section] as ReadTab);
  const [subject, setSubject] = useState('');
  const [pendingSubject, setPendingSubject] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [result, setResult] = useState<AdminReadResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);
    setError('');
    setResult(null);
    const url = detail !== null
      ? '/api/admin/users/' + detail
      : buildListPath(section, subject, cursor, tab);
    void fetchAdminReadV1(url, token)
      .then(value => { if (mounted) setResult(value); })
      .catch(e => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : '조회할 수 없습니다.');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [section, token, cursor, subject, detail, tab]);

  return <section className="surface admin-data">
    <div className="surface__head">
      <div><span className="section-kicker">VERIFIED READ ONLY</span>
        <h2>{detail !== null ? '사용자 상세' : '관리자 실데이터 조회'}</h2></div>
      <span className="neutral-tag">서버 검증 필수</span>
    </div>
    <div className="admin-tabs" aria-label="조회 종류">
      {(section === 'commerce' ? [['commerce','결제 내역'],['credits','크레딧 지급']] : section === 'readings' ? [['readings','Reading'],['ai-costs','AI 호출'],['ai-estimates','AI 추정 원가']] : section === 'issues' ? [['issues','운영 이슈'],['catalog','상품 카탈로그']] : [])
        .map(([name,label]) => <button key={name} type="button" className={tab===name ? 'active' : ''} onClick={() => { setTab(name as ReadTab); setCursor(null); setDetail(null); }}>{label}</button>)}
    </div>
    <div className="admin-toolbar">
      {detail !== null
        ? <button type="button" onClick={() => setDetail(null)}>목록으로</button>
        : <>
          {section !== 'issues' && section !== 'analytics' && <form onSubmit={e => {
            e.preventDefault();
            if (pendingSubject !== '' && !isSubjectId(pendingSubject)) {
              setError('사용자 참조는 UUID 형식이어야 합니다.');
              return;
            }
            setSubject(pendingSubject.toLowerCase());
            setCursor(null);
          }}>
            <input aria-label="사용자 참조 검색" placeholder="사용자 ID (선택)"
              value={pendingSubject} onChange={e => setPendingSubject(e.target.value.trim())} />
            <button type="submit">검색</button>
          </form>}
        </>}
      <button type="button" onClick={onSessionExpired}>로그아웃</button>
    </div>
    {loading ? <StatusPanel kind="loading" /> : error
      ? <StatusPanel kind={error.includes('권한') ? 'forbidden' : 'error'} detail={error} />
      : result ? <>
        <DataTable result={result} section={section} onDetail={setDetail} />
        {result.nextCursor !== null && <div className="admin-pagination">
          <button type="button" onClick={() => setCursor(result.nextCursor)}>다음 페이지</button>
        </div>}
      </> : <StatusPanel kind="empty" />}
  </section>;
}
