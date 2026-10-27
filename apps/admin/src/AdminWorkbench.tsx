import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchAdminReadV1, signInForAdminSessionV1, verifyAdminOwnerSessionV1, fetchAdminIssuesCsvV1, AdminAccessDeniedErrorV1 } from './admin-client.js';
import type { AdminReadResponse } from './admin-client.js';
import type { AdminSection } from './routes.js';
import { StatusPanel } from './StatusPanel.js';

type ListSection = Exclude<AdminSection, 'overview'>;
type ReadTab = 'users' | 'commerce' | 'commerce-alerts' | 'credits' | 'readings' | 'ai-costs' | 'ai-errors' | 'ai-estimates' | 'credit-reservations' | 'issues' | 'catalog' | 'characters' | 'content-releases' | 'deletion-jobs';
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
  verifiedPurchasesCount: '현재 검증 영수증 수',
  activeEntitlementsCount: '활성 이용 권한 수',
  availableCredits: '가용 크레딧',
  eventId: '크레딧 내역 참조',
  creditDelta: '발급 크레딧',
  reservationId: '사용 예약 참조',
  requiredCredits: '예약 크레딧',
  state: '정산 상태',
  deliveredTurnId: '전달 대화 참조',
  finalizedAt: '정산 시각',
  eventKind: '지급 근거',
  balanceAfter: '지급 후 잔액',
  correlationId: '원장 출처 참조',
  transactionId: '거래 참조',
  alertKind: '점검 유형',
  detectedAt: '대상 영수증 생성시각',
  evidence: '판정 성격',
  productKey: '상품',
  amountMinor: '검증 금액',
  currency: '통화',
  providerStatus: '결제 검증',
  verifiedAt: '검증일',
  entitlementStatus: '보유 권한',
  readingId: 'Reading 참조',
  domain: '사주 영역',
  engineVersion: '엔진 버전',
  contractVersion: 'Reading 응답 계약',
  attemptState: '최근 실행 시도',
  attemptCount: '시도 수',
  completedAt: '완료 시각',
  startedAt: '최근 시도 시작',
  finishedAt: '최근 시도 종료',
  errorCode: '오류',
  day: '집계일',
  feature: '기능',
  model: '모델',
  requests: '호출',
  successes: '성공',
  failures: '실패',
  totalTokens: '관측 토큰 합계',
  unknownTokenCalls: '토큰 일부 미확인 호출',
  blocked: '차단 호출',
  avgLatencyMs: '평균 지연(ms)',
  latencySamples: '지연 측정 표본',
  costKrw: '원화 비용',
  p95LatencyMs: 'P95 지연',
  executionId: 'AI 실행 참조',
  estimatedMicroUsd: '추정 비용(마이크로 USD)',
  unknownCostCalls: '원가 미확인 호출',
  costStatus: '원가 근거',
  productType: '상품 종류',
  catalogEnabled: '카탈로그 활성',
  offerCount: '제안 수',
  deletionJobId: '삭제 작업 참조',
  requestedAt: '요청 시각',
  completedAt: '완료 시각',
  scope: '처리 범위',
  characterId: '캐릭터 참조',
  contentVersion: '콘텐츠 버전',
  availability: '공개 상태',
  enabled: '카탈로그 활성',
  releaseAt: '공개 예정',
  publishedAt: '게시 시각',
  releaseKey: '릴리스 참조',
  isDefault: '기본 릴리스',
  activatedAt: '활성화 시각',
  issueId: '이슈 참조',
  category: '이슈 유형',
  severity: '심각도',
  requestId: '요청 참조',
};

function isSubjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function buildListPath(section: ListSection, subject: string, cursor: string | null, tab: ReadTab, from: string | null = null, to: string | null = null, issueStatus: string = 'all', subjectKind: string = 'all', subjectStatus: string = 'all', readingStatus: string = 'all'): string {
  const params = new URLSearchParams({ limit: '20' });
  if (subject.length > 0) params.set('subjectId', subject);
  if (cursor !== null) params.set('cursor', cursor);
  if (from !== null && to !== null) { params.set('from', from); params.set('to', to); }
  if (tab === 'issues' && issueStatus !== 'all') params.set('status', issueStatus);
  if (tab === 'users' && subjectKind !== 'all') params.set('subjectKind', subjectKind);
  if (tab === 'users' && subjectStatus !== 'all') params.set('subjectStatus', subjectStatus);
  if (tab === 'readings' && readingStatus !== 'all') params.set('readingStatus', readingStatus);
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
        {(section === 'users' || (section === 'commerce' && result.kind === 'commerce') || (section === 'readings' && result.kind === 'readings')) && <th scope="col">상세</th>}</tr></thead>
      <tbody>{result.rows.map((row, i) => <tr key={String(row.transactionId ?? row.readingId ?? row.eventId ?? row.issueId ?? row.subjectId ?? i) + ':' + i}>
        {columns.map(k => <td key={k}>{row[k] === null || row[k] === undefined ? '—' : String(row[k])}</td>)}
        {(section === 'users' || (section === 'commerce' && result.kind === 'commerce') || (section === 'readings' && result.kind === 'readings')) && <td>{section === 'users' && typeof row.subjectId === 'string' && isSubjectId(row.subjectId)
          ? <button type="button" className="table-link" onClick={() => onDetail(String(row.subjectId))}>조회</button>
          : section === 'commerce' && typeof row.transactionId === 'string' && isSubjectId(row.transactionId)
            ? <button type="button" className="table-link" onClick={() => onDetail(String(row.transactionId))}>검증 내역</button>
            : section === 'readings' && result.kind === 'readings' && typeof row.readingId === 'string' && isSubjectId(row.readingId)
              ? <button type="button" className="table-link" onClick={() => onDetail(String(row.readingId))}>실행 내역</button> : '—'}</td>}
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
      await verifyAdminOwnerSessionV1(token);
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

export function AdminWorkbench({ section, token, onSessionExpired, onNavigate }: {
  readonly section: ListSection;
  readonly token: string;
  readonly onSessionExpired: () => void;
  readonly onNavigate?: (path: string) => void;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [tab, setTab] = useState<ReadTab>(() => DATA_PATHS[section] as ReadTab);
  const [subject, setSubject] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('subjectId') ?? '';
    return isSubjectId(value) ? value.toLowerCase() : '';
  });
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [issueStatus, setIssueStatus] = useState<'all' | 'failed' | 'dead_lettered'>('all');
  const [subjectKind, setSubjectKind] = useState<'all' | 'guest' | 'member'>('all');
  const [subjectStatus, setSubjectStatus] = useState<'all' | 'active' | 'merged' | 'deletion_pending' | 'deleted'>('all');
  const [readingStatus, setReadingStatus] = useState<'all' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'>('all');
  const [pendingSubject, setPendingSubject] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const [result, setResult] = useState<AdminReadResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    setResult(null);
    const url = detail !== null
      ? (section === 'commerce' ? '/api/admin/commerce/' : section === 'readings' ? '/api/admin/readings/' : '/api/admin/users/') + detail
      : buildListPath(section, subject, cursor, tab, from, to, issueStatus, subjectKind, subjectStatus, readingStatus);
    void fetchAdminReadV1(url, token)
      .then(value => { if (mounted) setResult(value); })
      .catch(e => {
        if (!mounted) return;
        if (e instanceof AdminAccessDeniedErrorV1) { onSessionExpired(); return; }
        setError(e instanceof Error ? e.message : '조회할 수 없습니다.');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => {
      mounted = false;
    };
  }, [section, token, cursor, subject, detail, tab, from, to, issueStatus, subjectKind, subjectStatus, readingStatus]);

  return <section className="surface admin-data">
    <div className="surface__head">
      <div><span className="section-kicker">VERIFIED READ ONLY</span>
        <h2>{detail !== null ? section === 'users' ? '사용자 상세' : section === 'readings' ? 'Reading 실행 상세' : '결제 검증 상세' : '관리자 실데이터 조회'}</h2></div>
      <span className="neutral-tag">서버 검증 필수</span>
    </div>
    <div className="admin-tabs" aria-label="조회 종류">
      {(section === 'commerce' ? [['commerce','결제 내역'],['commerce-alerts','검증·지급 점검'],['credits','크레딧 지급'],['credit-reservations','크레딧 사용·정산']] : section === 'readings' ? [['readings','Reading'],['ai-costs','AI 호출'],['ai-errors','AI 실패·차단'],['ai-estimates','AI 추정 원가']] : section === 'issues' ? [['issues','운영 이슈'],['deletion-jobs','삭제 작업'],['catalog','상품 카탈로그'],['characters','캐릭터'],['content-releases','콘텐츠 릴리스']] : [])
        .map(([name,label]) => <button key={name} type="button" className={tab===name ? 'active' : ''} onClick={() => { setTab(name as ReadTab); setCursor(null); setDetail(null); }}>{label}</button>)}
    </div>
    <div className="admin-toolbar">
      {section === 'readings' && tab === 'readings' && detail === null &&
        <label className="admin-reading-filter">실행 상태
          <select value={readingStatus} onChange={e => {
            setReadingStatus(e.target.value as typeof readingStatus);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="pending">대기</option>
            <option value="running">진행 중</option>
            <option value="succeeded">완료</option>
            <option value="failed">실패</option>
            <option value="cancelled">취소</option>
          </select>
        </label>}
      {section === 'users' && detail === null && <div className="admin-user-filters">
        <label>계정 종류
          <select value={subjectKind} onChange={e => {
            setSubjectKind(e.target.value as 'all' | 'guest' | 'member');
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="member">회원</option>
            <option value="guest">게스트</option>
          </select>
        </label>
        <label>수명주기
          <select value={subjectStatus} onChange={e => {
            setSubjectStatus(e.target.value as typeof subjectStatus);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="active">활성</option>
            <option value="merged">병합됨</option>
            <option value="deletion_pending">삭제 대기</option>
            <option value="deleted">삭제 완료</option>
          </select>
        </label>
      </div>}
      {section === 'issues' && tab === 'issues' && detail === null &&
        <label className="admin-issue-filter">이슈 상태
          <select value={issueStatus} onChange={e => {
            setIssueStatus(e.target.value as 'all' | 'failed' | 'dead_lettered');
            setCursor(null);
          }}>
            <option value="all">전체 실패</option>
            <option value="failed">실패</option>
            <option value="dead_lettered">처리 중단</option>
          </select>
        </label>}
      {detail !== null
        ? <><button type="button" onClick={() => setDetail(null)}>목록으로</button>
            {section === 'users' && onNavigate && <><button type="button" onClick={() => onNavigate('/admin/readings?subjectId=' + detail)}>Reading 조회</button><button type="button" onClick={() => onNavigate('/admin/commerce?subjectId=' + detail)}>결제 조회</button></>}</>
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
      {section === 'issues' && tab === 'issues' && detail === null && <button type="button"
        onClick={() => {
          const query = new URLSearchParams({ limit: '50' });
          if (from !== null && to !== null) { query.set('from', from); query.set('to', to); }
          if (issueStatus !== 'all') query.set('status', issueStatus);
          void fetchAdminIssuesCsvV1(token, query)
            .then(content => {
              const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
              const link = document.createElement('a');
              link.href = url;
              link.download = 'myeongha-issues.csv';
              link.click();
              URL.revokeObjectURL(url);
            })
            .catch(error => {
              if (error instanceof AdminAccessDeniedErrorV1) { onSessionExpired(); return; }
              setError('내보내기를 완료할 수 없습니다. 권한과 감사 저장 상태를 확인해 주세요.');
            });
        }}>운영 이슈 CSV (최대 50건)</button>}
      <button type="button" onClick={onSessionExpired}>로그아웃</button>
      {detail === null && <form className="date-range-form" onSubmit={e => {
        e.preventDefault();
        if ((draftFrom !== '' && draftTo === '') || (draftFrom === '' && draftTo !== '')) {
          setError('시작일과 종료일을 함께 지정해야 합니다.');
          return;
        }
        if (draftFrom && draftTo) {
          const days = (Date.parse(draftTo + 'T00:00:00Z') - Date.parse(draftFrom + 'T00:00:00Z')) / 86_400_000;
          if (!Number.isFinite(days) || days < 0 || days > 90) {
            setError('조회 기간은 90일 이내여야 합니다.');
            return;
          }
        }
        setError('');
        setFrom(draftFrom || null);
        setTo(draftTo || null);
        setCursor(null);
      }}>
        <label>시작일 <input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)} /></label>
        <label>종료일 <input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} /></label>
        <button type="submit">기간 적용</button>
      </form>}
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
