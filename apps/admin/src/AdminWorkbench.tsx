import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchAdminReadV1, signInForAdminSessionV1, verifyAdminOwnerSessionV1, fetchAdminIssuesCsvV1, AdminAccessDeniedErrorV1 } from './admin-client.js';
import type { AdminReadResponse } from './admin-client.js';
import type { AdminSection } from './routes.js';
import { StatusPanel } from './StatusPanel.js';

type ListSection = Exclude<AdminSection, 'overview'>;
type ReadTab = 'users' | 'commerce' | 'commerce-alerts' | 'entitlements' | 'entitlement-events' | 'provider-events' | 'credits' | 'readings' | 'reading-attempts' | 'reading-ai-usage' | 'ai-costs' | 'ai-errors' | 'ai-estimates' | 'credit-reservations' | 'credit-allocations' | 'issues' | 'audit' | 'catalog' | 'characters' | 'content-releases' | 'deletion-jobs';
const DATA_PATHS: Record<ListSection, string> = {
  users: 'users',
  commerce: 'commerce',
  readings: 'readings',
  analytics: 'analytics',
  issues: 'issues',
};

const ALLOCATION_EVIDENCE_LABELS: Readonly<Record<string,string>> = Object.freeze({
  matching_allocation: '배분 수량 일치',
  allocation_mismatch: '배분 수량 불일치 · 수동 점검',
});

const COMMERCE_ALERT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  receipt_same_scope_multiple_active_grants: '동일 영수증·권한·범위의 복수 활성 지급 · 수동 점검',
  verified_credit_receipt_without_linked_credit_lot: '검증 결제 · 충전 Lot 미확인',
  revoked_credit_receipt_with_remaining_lot: '철회 영수증 · 충전 Lot 잔액 존재',
  verified_receipt_no_linked_grant_event: '검증 결제 · 권한 지급 이력 미확인',
  revoked_receipt_with_active_linked_grant: '철회 영수증 · 활성 이용권 존재',
});

const LABELS: Record<string, string> = {
  subjectId: '사용자 참조',
  providerEventId: '결제사 이벤트 참조',
  provider: '결제사',
  providerEventType: '저장된 결제사 이벤트 유형',
  resolutionSource: '소유자 결속 근거',
  receivedAt: '수신 시각',
  processedAt: '처리 시각',
  entitlementId: '보유 권한 참조',
  entitlementKey: '권한 종류',
  activeGrantCount: '활성 지급 수',
  effectiveValidUntil: '기록된 권한 만료',
  updatedAt: '상태 갱신',
  grantId: '개별 지급 참조',
  sourceType: '이벤트 근거 종류',
  effectiveAt: '이벤트 효력 시각',
  threadId: '대화 스레드 참조',
  clientTurnId: '요청 멱등성 참조',
  kind: '구분',
  status: '상태',
  createdAt: '생성일',
  lastThreadUpdatedAt: '최근 대화 갱신',
  readingsCount: 'Reading 수',
  verifiedPurchasesCount: '현재 검증 영수증 수',
  activeEntitlementsCount: '활성 투영 권한 수',
  availableCredits: '가용 크레딧',
  eventId: '지급·권한 이력 참조',
  creditDelta: '발급 크레딧',
  creditsRemaining: 'Lot 잔여 크레딧',
  expiresAt: '만료 시각',
  validity: '유효 기간',
  reservationId: '사용 예약 참조',
  lotId: '재원 Lot 참조',
  allocatedCredits: '예약 투입 크레딧',
  allocationEvidence: '예약 배분 증거',
  reservationState: '예약 처리 상태',
  lotSource: '재원 출처',
  requiredCredits: '예약 크레딧',
  state: '정산 상태',
  deliveredTurnId: '전달 대화 참조',
  finalizedAt: '정산 시각',
  eventKind: '원장 이벤트 종류',
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
  entitlementStatus: '영수증 연계 권한 근거',
  linkedGrantEventCount: '연계 지급 이벤트 수',
  linkedActiveGrantCount: '연계 활성 지급 수',
  linkedRevokedGrantCount: '연계 철회 지급 수',
  linkedCreditLotCount: '연계 충전 Lot 수',
  linkedCreditRemaining: '연계 Lot 잔여',
  readingId: 'Reading 참조',
  attribution: 'Reading attribution',
  inputTokens: 'Input tokens',
  outputTokens: 'Output tokens',
  attemptId: '시도 참조',
  attemptNo: '시도 번호',
  engineKey: '사주 엔진',
  requestedEngineVersion: '요청 엔진 버전',
  resolvedEngineVersion: '실제 엔진 버전',
  domain: '사주 영역',
  engineVersion: '엔진 버전',
  contractVersion: 'Reading 응답 계약',
  requestContractVersion: 'Reading 요청 계약',
  responseState: '기록된 응답 상태',
  committedAttemptId: '확정 실행 시도',
  characterChatCalls: '대화 연결 호출',
  unclassifiedCalls: '용도 미분류 호출',
  enabledOfferCount: '미폐기 활성 제안 수',
  retiredAt: '카탈로그 폐기 시각',
  ageSeconds: '요청 후 경과(초·완료 시 정지)',
  availableAt: '저장된 처리 가능 시각',
  leaseExpiresAt: '처리 임대 만료',
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
  latencyMs: '개별 호출 지연(ms)',
  executionId: 'AI 실행 참조',
  estimatedMicroUsd: '추정 비용(마이크로 USD)',
  unknownCostCalls: '원가 미확인 호출',
  costStatus: '원가 근거',
  productType: '상품 종류',
  catalogEnabled: '카탈로그 활성',
  offerCount: '제안 수',
  deletionJobId: '삭제 작업 참조',
  requestedAt: '요청 시각',
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
  actorRef: '운영자 인증 참조',
  targetRef: '대상 참조',
  action: '관리자 행동',
  outcome: '감사 결과',
  occurredAt: '발생·기록 시각',
  issueId: '이슈 참조',
  category: '이슈 유형',
  severity: '심각도',
  requestId: '조회·감사 요청 참조',
};

function isSubjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export function buildListPath(section: ListSection, subject: string, cursor: string | null, tab: ReadTab, from: string | null = null, to: string | null = null, issueStatus: string = 'all', subjectKind: string = 'all', subjectStatus: string = 'all', readingStatus: string = 'all', issueCategory: string = '', creditSource: string = 'all', reservationState: string = 'all', reservationId: string = '', attemptReadingId: string = '', aiStage: string = 'all', aiErrorCode: string = '', deletionStatus: string = 'all', deletionScope: string = 'all', releaseStatus: string = 'all', characterAvailability: string = 'all', receiptStatus: string = 'all', auditOutcome: string = 'all', allocationMismatchOnly: boolean = false, receiptId: string = '', aiFeature: string = 'all', aiModel: string = '', providerEventStatus: string = 'all'): string {
  if (['reading-attempts','reading-ai-usage'].includes(tab) && isSubjectId(attemptReadingId)) {
    const params = new URLSearchParams({ limit: '20' });
    if (cursor !== null) params.set('cursor', cursor);
    return '/api/admin/readings/' + attemptReadingId + (tab === 'reading-ai-usage' ? '/ai-usage?' : '/attempts?') + params.toString();
  }
  const params = new URLSearchParams({ limit: '20' });
  if (subject.length > 0) params.set('subjectId', subject);
  if (cursor !== null) params.set('cursor', cursor);
  if (from !== null && to !== null && !['catalog','characters','content-releases'].includes(tab)) { params.set('from', from); params.set('to', to); }
  if (tab === 'issues' && issueStatus !== 'all') params.set('status', issueStatus);
  if (tab === 'issues' && issueCategory !== '') params.set('category', issueCategory);
  if (tab === 'audit' && auditOutcome !== 'all') params.set('auditOutcome', auditOutcome);
  if (tab === 'deletion-jobs' && deletionStatus !== 'all') params.set('deletionStatus', deletionStatus);
  if (tab === 'deletion-jobs' && deletionScope !== 'all') params.set('deletionScope', deletionScope);
  if (tab === 'content-releases' && releaseStatus !== 'all') params.set('releaseStatus', releaseStatus);
  if (tab === 'characters' && characterAvailability !== 'all') params.set('characterAvailability', characterAvailability);
  if (tab === 'commerce' && receiptStatus !== 'all') params.set('receiptStatus', receiptStatus);
  if (tab === 'users' && subjectKind !== 'all') params.set('subjectKind', subjectKind);
  if (tab === 'users' && subjectStatus !== 'all') params.set('subjectStatus', subjectStatus);
  if (tab === 'readings' && readingStatus !== 'all') params.set('readingStatus', readingStatus);
  if ((tab === 'ai-costs' || tab === 'ai-estimates') && aiFeature !== 'all') params.set('aiFeature', aiFeature);
  if (['ai-costs','ai-errors','ai-estimates'].includes(tab) && aiModel !== '') params.set('aiModel', aiModel);
  if (tab === 'ai-errors' && aiStage !== 'all') params.set('aiStage', aiStage);
  if (tab === 'ai-errors' && aiErrorCode !== '') params.set('aiErrorCode', aiErrorCode);
  if (tab === 'credits' && creditSource !== 'all') params.set('creditSource', creditSource);
  if (tab === 'credit-reservations' && reservationState !== 'all') params.set('reservationState', reservationState);
  if (tab === 'credit-reservations' && allocationMismatchOnly) params.set('allocationMismatch','only');
  if (['entitlement-events','provider-events'].includes(tab) && receiptId !== '') params.set('receiptId', receiptId);
  if (tab === 'provider-events' && providerEventStatus !== 'all') params.set('providerEventStatus', providerEventStatus);
  if (tab === 'credit-allocations' && reservationId !== '') params.set('reservationId', reservationId);
  return '/api/admin/' + tab + '?' + params.toString();
}

function DataTable({ result, section, onDetail, onAllocation }: {
  readonly result: AdminReadResponse;
  readonly section: ListSection;
  readonly onDetail: (id: string) => void;
  readonly onAllocation: (id: string) => void;
}) {
  if (result.rows.length === 0) {
    return <StatusPanel kind="empty" detail="해당 범위에서 실제 조회된 데이터가 없습니다." />;
  }
  const columns = Object.keys(LABELS).filter(k => result.rows.some(row => k in row));
  return <div className="admin-table-scroll">
    <table className="admin-table">
      <thead><tr>{columns.map(k => <th scope="col" key={k}>{LABELS[k]}</th>)}
        {(section === 'users' || (section === 'commerce' && (result.kind === 'commerce' || result.kind === 'commerce-alerts')) || (section === 'readings' && result.kind === 'readings') || (section === 'commerce' && result.kind === 'credit-reservations')) && <th scope="col">상세</th>}</tr></thead>
      <tbody>{result.rows.map((row, i) => <tr key={String(row.transactionId ?? row.readingId ?? row.eventId ?? row.issueId ?? row.subjectId ?? i) + ':' + i}>
        {columns.map(k => <td key={k}>{row[k] === null || row[k] === undefined ? '—' : k === 'alertKind' && typeof row[k] === 'string' ? (COMMERCE_ALERT_LABELS[row[k]] ?? row[k]) : k === 'allocationEvidence' && typeof row[k] === 'string' ? (ALLOCATION_EVIDENCE_LABELS[row[k]] ?? row[k]) : String(row[k])}</td>)}
        {(section === 'users' || (section === 'commerce' && (result.kind === 'commerce' || result.kind === 'commerce-alerts')) || (section === 'readings' && result.kind === 'readings') || (section === 'commerce' && result.kind === 'credit-reservations')) && <td>{section === 'users' && typeof row.subjectId === 'string' && isSubjectId(row.subjectId)
          ? <button type="button" className="table-link" onClick={() => onDetail(String(row.subjectId))}>조회</button>
          : section === 'commerce' && typeof row.transactionId === 'string' && isSubjectId(row.transactionId)
            ? <button type="button" className="table-link" onClick={() => onDetail(String(row.transactionId))}>검증 내역</button>
            : section === 'readings' && result.kind === 'readings' && typeof row.readingId === 'string' && isSubjectId(row.readingId)
              ? <button type="button" className="table-link" onClick={() => onDetail(String(row.readingId))}>실행 내역</button>
              : result.kind === 'credit-reservations' && typeof row.reservationId === 'string' && isSubjectId(row.reservationId)
                ? <button type="button" className="table-link" onClick={() => onAllocation(String(row.reservationId))}>재원 추적</button> : '—'}</td>}
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
  const [auditOutcome, setAuditOutcome] = useState<'all' | 'allowed' | 'denied' | 'failed'>('all');
  const [deletionStatus, setDeletionStatus] = useState<'all' | 'requested' | 'running' | 'completed' | 'failed'>('all');
  const [deletionScope, setDeletionScope] = useState<'all' | 'account' | 'conversation' | 'memory' | 'life_fact' | 'target_person'>('all');
  const [releaseStatus, setReleaseStatus] = useState<'all' | 'draft' | 'active' | 'retired'>('all');
  const [characterAvailability, setCharacterAvailability] = useState<'all' | 'available' | 'unlockable' | 'locked' | 'coming_soon'>('all');
  const [subjectKind, setSubjectKind] = useState<'all' | 'guest' | 'member'>('all');
  const [subjectStatus, setSubjectStatus] = useState<'all' | 'active' | 'merged' | 'deletion_pending' | 'deleted'>('all');
  const [readingStatus, setReadingStatus] = useState<'all' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'>('all');
  const [aiFeature, setAiFeature] = useState('all');
  const [aiModel, setAiModel] = useState('');
  const [draftAiModel, setDraftAiModel] = useState('');
  const [aiStage, setAiStage] = useState<'all' | 'planner' | 'renderer' | 'output_guard' | 'scene_director'>('all');
  const [aiErrorCode, setAiErrorCode] = useState('');
  const [draftAiErrorCode, setDraftAiErrorCode] = useState('');
  const [issueCategory, setIssueCategory] = useState('');
  const [creditSource, setCreditSource] = useState<'all' | 'signup' | 'portone_topup' | 'reading_reward' | 'admin_adjustment'>('all');
  const [reservationState, setReservationState] = useState<'all' | 'reserved' | 'settled' | 'released'>('all');
  const [allocationMismatchOnly, setAllocationMismatchOnly] = useState(false);
  const [receiptStatus, setReceiptStatus] = useState<'all' | 'pending' | 'verified' | 'rejected' | 'revoked'>('all');
  const [providerEventStatus, setProviderEventStatus] = useState('all');
  const [receiptId, setReceiptId] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [attemptReadingId, setAttemptReadingId] = useState('');
  const [draftReservationId, setDraftReservationId] = useState('');
  const [draftDetailId, setDraftDetailId] = useState('');
  const [draftIssueCategory, setDraftIssueCategory] = useState('');
  const [pendingSubject, setPendingSubject] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('subjectId') ?? '';
    return isSubjectId(value) ? value.toLowerCase() : '';
  });
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
      : buildListPath(section, subject, cursor, tab, from, to, issueStatus, subjectKind, subjectStatus, readingStatus, issueCategory, creditSource, reservationState, reservationId, attemptReadingId, aiStage, aiErrorCode, deletionStatus, deletionScope, releaseStatus, characterAvailability, receiptStatus, auditOutcome, allocationMismatchOnly, receiptId, aiFeature, aiModel, providerEventStatus);
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
  }, [section, token, cursor, subject, detail, tab, from, to, issueStatus, subjectKind, subjectStatus, readingStatus, issueCategory, creditSource, reservationState, reservationId, attemptReadingId, aiStage, aiErrorCode, deletionStatus, deletionScope, releaseStatus, characterAvailability, receiptStatus, auditOutcome, allocationMismatchOnly, receiptId, aiFeature, aiModel, providerEventStatus]);

  return <section className="surface admin-data">
    <div className="surface__head">
      <div><span className="section-kicker">VERIFIED READ ONLY</span>
        <h2>{detail !== null ? section === 'users' ? '사용자 상세' : section === 'readings' ? 'Reading 실행 상세' : '결제 검증 상세' : '관리자 실데이터 조회'}</h2></div>
      <span className="neutral-tag">서버 검증 필수</span>
    </div>
    <div className="admin-tabs" aria-label="조회 종류">
      {(section === 'commerce' ? [['commerce','결제 내역'],['commerce-alerts','검증·지급 점검'],['provider-events','결제사 이벤트'],['entitlements','보유 권한'],['entitlement-events','권한 지급·철회 이력'],['credits','크레딧 지급'],['credit-reservations','크레딧 사용·정산'],['credit-allocations','차감·복원 재원']] : section === 'readings' ? [['readings','Reading'],...(attemptReadingId ? [['reading-attempts','실행 시도']] : []),['ai-costs','AI 호출'],['ai-errors','AI 실패·차단'],['ai-estimates','AI 추정 원가']] : section === 'issues' ? [['issues','운영 이슈'],['audit','관리자 접근 기록'],['deletion-jobs','삭제 작업'],['catalog','상품 카탈로그'],['characters','캐릭터'],['content-releases','콘텐츠 릴리스']] : [])
        .map(([name,label]) => <button key={name} type="button" className={tab===name ? 'active' : ''} onClick={() => { setTab(name as ReadTab); setCursor(null); setDetail(null); setReservationId(''); setDraftReservationId(''); setReceiptId(''); setAiFeature('all'); if (name !== 'reading-attempts') setAttemptReadingId(''); }}>{label}</button>)}
    </div>
    <div className="admin-toolbar">
      {((section === 'commerce' && tab === 'commerce') || (section === 'readings' && tab === 'readings')) && detail === null &&
        <form className="admin-issue-category" onSubmit={e => {
          e.preventDefault();
          if (!isSubjectId(draftDetailId)) {
            setError('조회할 영수증 또는 Reading의 정확한 UUID를 입력해 주세요.');
            return;
          }
          setError('');
          setDetail(draftDetailId.toLowerCase());
          setCursor(null);
        }}>
          <input aria-label={section === "commerce" ? "영수증 UUID 직접 조회" : "Reading UUID 직접 조회"}
            placeholder={section === "commerce" ? "영수증 UUID" : "Reading UUID"}
            value={draftDetailId} onChange={e => setDraftDetailId(e.target.value.trim())} maxLength={36}/>
          <button type="submit">상세 바로 조회</button>
        </form>}
      {tab === 'provider-events' && detail === null && <label>결제사 이벤트 처리 상태
        <select value={providerEventStatus} onChange={e => { setProviderEventStatus(e.target.value); setCursor(null); }}>
          <option value="all">전체</option>
          {['received','verified','unresolved','processed','rejected','failed'].map(status => <option value={status} key={status}>{status}</option>)}
        </select>
      </label>}
      {['ai-costs','ai-errors','ai-estimates'].includes(tab) && detail === null && <form onSubmit={e => {
        e.preventDefault();
        if (draftAiModel !== '' && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(draftAiModel)) { setError('모델 식별자 형식을 확인해 주세요.'); return; }
        setError(''); setAiModel(draftAiModel); setCursor(null);
      }}><input aria-label="AI 모델 식별자" placeholder="정확한 모델 식별자 (선택)" value={draftAiModel} maxLength={128} onChange={e => setDraftAiModel(e.target.value.trim())}/><button type="submit">모델 조회</button></form>}
      {(tab === 'ai-costs' || tab === 'ai-estimates') && detail === null && <label>AI 기능
        <select value={aiFeature} onChange={e => { setAiFeature(e.target.value); setCursor(null); }}>
          <option value="all">전체 기능</option>
          {(tab === 'ai-costs' ? ['planner','renderer','output_guard','scene_director'] : ['chat','post_turn']).map(feature => <option key={feature} value={feature}>{feature}</option>)}
        </select>
      </label>}
      {section === 'commerce' && tab === 'commerce' && detail === null &&
        <label className="admin-issue-filter">결제 검증 상태
          <select value={receiptStatus} onChange={e => {
            setReceiptStatus(e.target.value as typeof receiptStatus);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="pending">검증 대기</option>
            <option value="verified">검증 완료</option>
            <option value="rejected">검증 거부</option>
            <option value="revoked">검증 철회</option>
          </select>
        </label>}
      {section === 'commerce' && tab === 'credit-allocations' && detail === null &&
        <form className="admin-issue-category" onSubmit={e => {
          e.preventDefault();
          if (draftReservationId !== '' && !isSubjectId(draftReservationId)) {
            setError('크레딧 예약 참조는 UUID 형식이어야 합니다.');
            return;
          }
          setError('');
          setReservationId(draftReservationId.toLowerCase());
          setCursor(null);
        }}>
          <input aria-label="크레딧 예약 참조" placeholder="예약 ID로 재원 검색 (선택)"
            value={draftReservationId} onChange={e => setDraftReservationId(e.target.value.trim())} maxLength={36}/>
          <button type="submit">재원 조회</button>
        </form>}
      {section === 'commerce' && tab === 'credits' && detail === null &&
        <label className="admin-issue-filter">지급 출처
          <select value={creditSource} onChange={e => {
            setCreditSource(e.target.value as typeof creditSource);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="signup">회원 가입</option>
            <option value="portone_topup">결제 충전</option>
            <option value="reading_reward">첫 유료 Reading</option><option value="admin_adjustment">관리자 보정</option>
          </select>
        </label>}
      {section === 'commerce' && tab === 'credit-reservations' && detail === null &&
        <label className="admin-issue-filter">
          <input type="checkbox" checked={allocationMismatchOnly} onChange={e => {
            setAllocationMismatchOnly(e.target.checked);
            setCursor(null);
          }} />
          배분 수량 불일치만
        </label>}
      {section === 'commerce' && tab === 'credit-reservations' && detail === null &&
        <label className="admin-issue-filter">정산 상태
          <select value={reservationState} onChange={e => {
            setReservationState(e.target.value as typeof reservationState);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="reserved">예약 중</option>
            <option value="settled">정산됨</option>
            <option value="released">해제됨</option>
          </select>
        </label>}
      {section === 'readings' && tab === 'ai-errors' && detail === null &&
        <label className="admin-reading-filter">AI 실행 단계
          <select value={aiStage} onChange={e => {
            setAiStage(e.target.value as typeof aiStage);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="planner">계획</option>
            <option value="renderer">렌더러</option>
            <option value="output_guard">출력 검증</option>
            <option value="scene_director">장면 진행</option>
          </select>
        </label>}
      {section === 'readings' && tab === 'ai-errors' && detail === null &&
        <form className="admin-issue-category" onSubmit={e => {
          e.preventDefault();
          if (draftAiErrorCode !== '' && !/^[A-Za-z0-9_.:-]{1,80}$/u.test(draftAiErrorCode)) {
            setError('AI 오류 코드는 영숫자·점·밑줄·하이픈·콜론만 입력할 수 있습니다.');
            return;
          }
          setError('');
          setAiErrorCode(draftAiErrorCode);
          setCursor(null);
        }}>
          <input aria-label="AI 오류 코드" placeholder="정확한 오류 코드 (선택)" maxLength={80}
            value={draftAiErrorCode} onChange={e => setDraftAiErrorCode(e.target.value.trim())} />
          <button type="submit">오류 검색</button>
        </form>}
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
      {section === 'issues' && tab === 'audit' && detail === null &&
        <label className="admin-issue-filter">감사 처리 결과
          <select value={auditOutcome} onChange={e => {
            setAuditOutcome(e.target.value as typeof auditOutcome);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="allowed">허용됨</option>
            <option value="denied">거부됨</option>
            <option value="failed">실패</option>
          </select>
        </label>}
      {section === 'issues' && tab === 'content-releases' && detail === null &&
        <label className="admin-issue-filter">릴리스 상태
          <select value={releaseStatus} onChange={e => {
            setReleaseStatus(e.target.value as typeof releaseStatus);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="draft">초안</option>
            <option value="active">활성</option>
            <option value="retired">종료</option>
          </select>
        </label>}
      {section === 'issues' && tab === 'characters' && detail === null &&
        <label className="admin-issue-filter">캐릭터 공개 가능 상태
          <select value={characterAvailability} onChange={e => {
            setCharacterAvailability(e.target.value as typeof characterAvailability);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="available">이용 가능</option>
            <option value="unlockable">잠금 해제 가능</option>
            <option value="locked">잠김</option>
            <option value="coming_soon">공개 예정</option>
          </select>
        </label>}
      {section === 'issues' && tab === 'deletion-jobs' && detail === null &&
        <label className="admin-issue-filter">삭제 처리 상태
          <select value={deletionStatus} onChange={e => {
            setDeletionStatus(e.target.value as typeof deletionStatus);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="requested">요청됨</option>
            <option value="running">진행 중</option>
            <option value="completed">완료</option>
            <option value="failed">실패</option>
          </select>
        </label>}
      {section === 'issues' && tab === 'deletion-jobs' && detail === null &&
        <label className="admin-issue-filter">처리 범위
          <select value={deletionScope} onChange={e => {
            setDeletionScope(e.target.value as typeof deletionScope);
            setCursor(null);
          }}>
            <option value="all">전체</option>
            <option value="account">계정</option>
            <option value="conversation">대화</option>
            <option value="memory">기억</option>
            <option value="life_fact">사용자 기록</option>
            <option value="target_person">대상 인물</option>
          </select>
        </label>}
      {section === 'issues' && tab === 'issues' && detail === null &&
        <form className="admin-issue-category" onSubmit={e => {
          e.preventDefault();
          if (draftIssueCategory !== '' && !/^[A-Za-z0-9_.:-]{1,64}$/u.test(draftIssueCategory)) {
            setError('운영 이벤트 유형은 영숫자, 점, 밑줄, 하이픈, 콜론만 사용할 수 있습니다.');
            return;
          }
          setError('');
          setIssueCategory(draftIssueCategory);
          setCursor(null);
        }}>
          <input aria-label="이슈 이벤트 유형" placeholder="이벤트 유형 (선택)" value={draftIssueCategory}
            onChange={e => setDraftIssueCategory(e.target.value.trim())} maxLength={64} />
          <button type="submit">유형 검색</button>
        </form>}
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
      {['entitlement-events','provider-events'].includes(tab) && receiptId !== '' && detail === null && <p>영수증 {receiptId}에 직접 연결된 이력만 조회합니다.</p>}
      {['reading-attempts','reading-ai-usage'].includes(tab) && attemptReadingId !== '' && detail === null &&
        <button type="button" onClick={() => {
          setTab('readings');
          setDetail(attemptReadingId);
          setAttemptReadingId('');
          setCursor(null);
        }}>Reading 상세로</button>}
      {detail !== null
        ? <><button type="button" onClick={() => setDetail(null)}>목록으로</button>
             {section === 'commerce' && <button type="button" onClick={() => {
               setReceiptId(detail); setTab('provider-events'); setDetail(null); setCursor(null);
             }}>이 영수증의 결제사 이벤트</button>}
             {section === 'commerce' && <button type="button" onClick={() => {
               setReceiptId(detail); setTab('entitlement-events'); setDetail(null); setCursor(null);
             }}>이 영수증의 권한 이력</button>}
             {section === 'readings' && <button type="button" onClick={() => {
               setAttemptReadingId(detail);
               setTab('reading-attempts');
               setDetail(null);
               setCursor(null);
             }}>전체 실행 시도</button>}
            {section === 'readings' && <button type="button" onClick={() => { setAttemptReadingId(detail); setTab('reading-ai-usage'); setDetail(null); setCursor(null); }}>Reading-linked AI usage</button>}
            {section === 'users' && onNavigate && <><button type="button" onClick={() => onNavigate('/admin/readings?subjectId=' + detail)}>Reading 조회</button><button type="button" onClick={() => onNavigate('/admin/commerce?subjectId=' + detail)}>결제 조회</button></>}</>
        : <>
          {section !== 'issues' && section !== 'analytics' && !['reading-attempts','reading-ai-usage'].includes(tab) && <form onSubmit={e => {
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
          if (issueCategory !== '') query.set('category', issueCategory);
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
      {detail === null && !['reading-attempts','reading-ai-usage','catalog','characters','content-releases'].includes(tab) && <form className="date-range-form" onSubmit={e => {
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
    {(tab === 'credit-reservations' || tab === 'credit-allocations') && <p className="readiness-explainer">reserved는 선예약, settled는 전달 참조가 있는 정산, released는 미전달 해제·Lot 복원 상태입니다. 복원 후 Lot의 만료 여부는 별도로 적용됩니다. 요청 멱등성 참조는 같은 사용자·대화 내 client_turn_id이며 원문 대화나 비밀 키가 아닙니다.</p>}
    {tab === 'entitlements' && <p className="readiness-explainer">저장된 권한 투영입니다. 실제 접근 허용은 도메인 Access Gate가 현재 유효성·범위를 다시 검사합니다.</p>}
    {['ai-costs','ai-errors','ai-estimates'].includes(tab) && <p className="readiness-explainer">일별 기준은 UTC입니다. 대화 참조가 있는 호출과 용도 미분류 호출을 구분하며, 미분류 호출을 사주 비용으로 합산하지 않습니다. 사주 Reading 전용 비용은 적재 근거가 없어 미측정입니다. Se-yeon 비용은 별도 추정 USD 원장이고 공급사 확정 청구액·원화 원가가 아닙니다. 응답당 3~5원·상한 10원은 미확정 연구 가정입니다.</p>}
    {tab === 'reading-ai-usage' && <p className="readiness-explainer">Reading-linked character AI usage is not the cost of generating a Reading. KRW cost remains unmeasured; only recorded calls within 90 days are shown.</p>}
    {tab === 'catalog' && <p className="readiness-explainer">상품·제안 활성 플래그와 폐기 시각의 읽기 전용 관측입니다. 실제 판매·가격·PSP 출시 허가는 별도 게이트입니다.</p>}
    {tab === 'issues' && <p className="readiness-explainer">저장된 실패·시도·임대 상태입니다. 재시도 가능 여부, 최종 실패 분류 또는 재실행 권한으로 해석하지 않습니다.</p>}
    {tab === 'provider-events' && <p className="readiness-explainer">수신·검증·처리 상태와 정확히 결속된 영수증만 표시합니다. 결제사 이벤트 유형 또는 revoked 상태만으로 실제 환불 완료를 선언하지 않습니다. 외부 거래 ID·원본 영수증·결제사 payload는 조회하지 않습니다.</p>}
    {loading ? <StatusPanel kind="loading" /> : error
      ? <StatusPanel kind={error.includes('권한') ? 'forbidden' : 'error'} detail={error} />
      : result ? <>
        <DataTable result={result} section={section} onDetail={setDetail} onAllocation={id => {
          setTab('credit-allocations');
          setReservationId(id);
          setDraftReservationId(id);
          setCursor(null);
          setDetail(null);
        }} />
        {(cursor !== null || result.nextCursor !== null) && <div className="admin-pagination" aria-label="조회 페이지 이동">
          {cursor !== null && <button type="button" onClick={() => {
            const prior = Number(cursor) - 20;
            setCursor(prior > 0 ? String(prior) : null);
          }}>이전 페이지</button>}
          <span aria-current="page">{Math.floor(Number(cursor ?? '0') / 20) + 1}페이지</span>
          {result.nextCursor !== null && <button type="button" onClick={() => setCursor(result.nextCursor)}>다음 페이지</button>}
        </div>}
      </> : <StatusPanel kind="empty" />}
  </section>;
}
