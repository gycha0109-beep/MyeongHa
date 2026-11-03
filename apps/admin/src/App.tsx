import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { adminRoutes, getAdminRoute } from './routes.js';
import type { AdminRoute, AdminSection } from './routes.js';
import { StatusPanel } from './StatusPanel.js';
import { AdminLogin, AdminWorkbench } from './AdminWorkbench.js';
import { fetchAdminReadV1, verifyAdminOwnerSessionV1, adminTokenExpiresAtV1, AdminAccessDeniedErrorV1 } from './admin-client.js';
import type { AdminReadResponse } from './admin-client.js';
import { BetaAnalyticsReadiness } from './AdminOperationalReadiness.js';
import { AdminOperatorConsole } from './AdminOperatorConsole.js';
import { AdminAnalyticsDashboard } from './AdminAnalyticsDashboard.js';
import { AdminAiFinance } from './AdminAiFinance.js';
import {AdminAiBudget} from './AdminAiBudget.js';

const sectionDetails: Record<Exclude<AdminSection, 'overview'>, readonly string[]> = {
  users: ['사용자 검색 및 가입 상태', 'Reading · 권한 메타데이터', '게스트 · 회원 병합 및 삭제 상태'],
  commerce: ['결제 검증 및 환불 상태', '크레딧 잔액과 원장', '지급 불일치 탐지'],
  readings: ['Reading 상태와 버전', 'AI 호출 비용 및 실패', '모델별 지연과 재시도'],
  analytics: ['가입 · 구매 전환 퍼널', '캠페인별 유입', '만족도 및 환불 비율'],
  issues: ['서비스 운영 장애', '데이터 삭제 작업', '관리자 조치 감사 기록'],
};

const metrics = [
  { key: 'members_active', title: '현재 활성 회원', note: '현재 활성 회원 계정 기준' },
  { key: 'verified_receipts_7d', title: '최근 7일 운영 검증 영수증', note: '운영(production) 결제·서버 검증 상태 verified 기준 · 샌드박스 제외' },
  { key: 'verified_krw_minor_7d', title: '최근 7일 운영 검증 KRW 금액', note: '운영 결제 영수증의 기록 합계 · 샌드박스 제외 · 정산/순매출이 아님' },
  { key: 'verified_money_missing_7d', title: '최근 7일 운영 결제 금액 근거 결측', note: '운영 검증 영수증 중 금액 또는 통화 기록이 없는 건수' },
  { key: 'completed_readings_7d', title: '최근 7일 완료 Reading', note: '완료 처리 시각 기준' },
  { key: 'ai_calls_7d', title: '최근 7일 AI 호출', note: '실행 로그 기준 · 원가가 아님' },
  { key: 'reading_failures_7d', title: '최근 7일 Reading 실패', note: '실패 완료된 Reading 수' },
  { key: 'ai_failures_blocked_7d', title: '최근 7일 AI 실패·차단', note: '실패 또는 차단된 호출 수' },
  { key: 'outbox_failures_7d', title: '최근 7일 운영 이벤트 실패', note: '실패·처리 중단 상태의 이벤트 수' },
] as const;
const attentionMetrics = new Set<string>(['verified_money_missing_7d','reading_failures_7d','ai_failures_blocked_7d','outbox_failures_7d']);

function navigateTo(path: string, setPath: (path: string) => void) {
  const destination = new URL(path, window.location.origin);
  if (destination.origin !== window.location.origin || !destination.pathname.startsWith('/admin')) return;
  if (window.location.pathname + window.location.search !== destination.pathname + destination.search) {
    window.history.pushState(null, '', destination.pathname + destination.search);
  }
  setPath(destination.pathname + destination.search);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function NavLink({
  route,
  current,
  onNavigate,
}: {
  readonly route: AdminRoute;
  readonly current: boolean;
  readonly onNavigate: (path: string) => void;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(route.path);
  };

  return (
    <a className={'nav-link' + (current ? ' nav-link--active' : '')}
      href={route.path} aria-current={current ? 'page' : undefined} onClick={onClick}>
      <span className="nav-link__number" aria-hidden="true">{route.shortLabel}</span>
      <span className="nav-link__label">{route.label}</span>
      {route.section !== 'overview' && <span className="nav-link__pending">보호됨</span>}
    </a>
  );
}

function SectionIntro({ route }: { readonly route: AdminRoute }) {
  return (
    <div className="section-heading">
      <div className="eyebrow"><span className="eyebrow__line" /> MYEONGHA / OPERATIONS</div>
      <h1>{route.heading}</h1>
      <p>{route.description}</p>
    </div>
  );
}

function LockNotice() {
  return (
    <div className="lock-notice" role="note">
      <span className="lock-notice__icon" aria-hidden="true">◇</span>
      <div>
        <strong>Owner 인증 전 · 운영 데이터 접근 제한</strong>
        <p>서버의 Owner 허용 목록과 전용 읽기·감사 권한이 모두 확인돼야 실제 운영 데이터를 조회할 수 있습니다.</p>
      </div>
      <span className="lock-notice__step">OWNER ONLY</span>
    </div>
  );
}

function Overview({ token, onSessionExpired }: { readonly token: string | null; readonly onSessionExpired: () => void }) {
  const [summary, setSummary] = useState<Readonly<Record<string, string>> | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [activity, setActivity] = useState<AdminReadResponse['rows'] | null>(null);
  const [activityError, setActivityError] = useState(false);
  useEffect(() => {
    if (token === null) { setSummary(null); setUnavailable(false); setActivity(null); setActivityError(false); return; }
    let active = true;
    setSummary(null);
    setUnavailable(false);
    setActivity(null);
    setActivityError(false);
    void fetchAdminReadV1('/api/admin/audit?limit=5', token)
      .then(result => { if (active) setActivity(result.rows); })
      .catch(error => { if (active) { setActivityError(true); if (error instanceof AdminAccessDeniedErrorV1) onSessionExpired(); } });
    void fetchAdminReadV1('/api/admin/overview', token).then(payload => {
      if (!active) return;
      const accepted = new Set(metrics.map(metric => metric.key));
      const next: Record<string, string> = {};
      for (const row of payload.rows) {
        if (typeof row.metricKey !== 'string' || !accepted.has(row.metricKey as typeof metrics[number]['key']) ||
            typeof row.metricValue !== 'string' || !/^\d{1,16}$/u.test(row.metricValue)) {
          throw new Error('Invalid administrator metric result');
        }
        next[row.metricKey] = row.metricValue;
      }
      if (Object.keys(next).length !== metrics.length) throw new Error('Administrator metrics incomplete');
      setSummary(next);
    }).catch(error => { if (active) { setSummary(null); setUnavailable(true); if (error instanceof AdminAccessDeniedErrorV1) onSessionExpired(); } });
    return () => { active = false; };
  }, [token]);
  return (
    <>
      <div className="overview-heading">
        <div>
          <h2>서비스 현황</h2>
          <p>실제 조회 가능한 정본 메타데이터만 사용하며, 권한·연결 문제가 있으면 —로 표시합니다.</p>
        </div>
        <span className="neutral-tag">{summary !== null ? '권한 확인 · 실제 집계' : unavailable ? '조회 불가' : '데이터 연결 대기'}</span>
      </div>
      <div className="metrics">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.title}>
            <div className="metric-card__top">
              <span>{metric.title}</span>
              <span className="metric-card__dot" aria-hidden="true" />
            </div>
            <p className="metric-card__value" aria-label={metric.title + (summary ? ' 집계값' : ' 측정 불가')}>{summary?.[metric.key] ?? '—'}</p>
            <p className="metric-card__note">{metric.note}</p>
            {summary !== null && attentionMetrics.has(metric.key) && Number(summary[metric.key]) > 0 &&
              <p className="readiness-wait" role="status">기록된 실패·결측 있음 · 수동 점검 필요</p>}
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="surface">
          <div className="surface__head">
            <div>
              <span className="section-kicker">ACTIVITY</span>
              <h2>최근 운영 활동</h2>
            </div>
            <span className="neutral-tag">{activity !== null ? "감사 기록 조회 완료" : activityError ? "조회 불가" : "조회 대기"}</span>
          </div>
          {activity === null ? <StatusPanel kind={activityError ? "error" : "loading"} detail="감사 기록 조회 권한과 저장 상태를 확인합니다." />
            : activity.length === 0 ? <StatusPanel kind="empty" detail="현재 조회 범위에 저장된 관리자 감사 기록이 없습니다." />
            : <div className="admin-table-scroll"><table className="admin-table">
              <thead><tr><th scope="col">작업</th><th scope="col">결과</th><th scope="col">시각</th></tr></thead>
              <tbody>{activity.map((item, index) => <tr key={String(item.requestId ?? index)}>
                <td>{String(item.action ?? "—")}</td><td>{String(item.outcome ?? "—")}</td>
                <td>{String(item.occurredAt ?? "—")}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>
        <section className="surface">
          <div className="surface__head">
            <div>
              <span className="section-kicker">READINESS</span>
              <h2>운영 기능 연결 상태</h2>
            </div>
          </div>
          <div className="readiness-list">
            <div><span>관리자 웹 화면</span><span className="readiness-ready">골격 구축</span></div>
            <div><span>운영자 인증</span><span className={token ? 'readiness-ready' : 'readiness-wait'}>{token ? '서버 확인' : '미확인'}</span></div>
            <div><span>관리자 읽기 API</span><span className={summary ? 'readiness-ready' : 'readiness-wait'}>{summary ? '응답 확인' : '미연결'}</span></div>
            <div><span>실제 운영 데이터</span><span className={summary ? 'readiness-ready' : 'readiness-wait'}>{summary ? '집계 확인' : '미연결'}</span></div>
          </div>
          <div className="surface__foot">실제 운영 데이터는 Owner 인증, 전용 조회 권한, 감사 저장이 모두 확인된 경우에만 표시합니다.</div>
        </section>
      </div>
    </>
  );
}

function PendingSection({ section }: { readonly section: Exclude<AdminSection, 'overview'> }) {
  return (
    <section className="surface pending-section">
      <div className="surface__head">
        <div>
          <span className="section-kicker">PLANNED MODULE</span>
          <h2>조회 기능 준비 중</h2>
        </div>
        <span className="neutral-tag">읽기 전용 예정</span>
      </div>
      <div className="pending-list" aria-label="구현 예정 조회 항목">
        {sectionDetails[section].map((item, index) => (
          <div className="pending-list__item" key={item}>
            <span className="pending-list__index">0{index + 1}</span>
            <span>{item}</span>
            <span className="pending-list__status">미연결</span>
          </div>
        ))}
      </div>
      <StatusPanel kind="empty" title="조회 가능한 데이터가 없습니다"
        detail="이 화면에는 모의 데이터가 없습니다. 권한 검증이 완료된 실제 운영 조회 API만 연결할 예정입니다." />
    </section>
  );
}

export function App() {
  const [path, setPath] = useState(() => window.location.pathname + window.location.search);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const route = getAdminRoute(path.split('?')[0] ?? path);

  useEffect(() => {
    if (ownerToken === null) return;
    const expiresAt = adminTokenExpiresAtV1(ownerToken);
    if (expiresAt === null || expiresAt <= Date.now()) { setOwnerToken(null); return; }
    let active = true;
    let checking = false;
    const expire = () => { if (active) setOwnerToken(null); };
    const check = async () => {
      if (expiresAt <= Date.now()) { expire(); return; }
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      try { await verifyAdminOwnerSessionV1(ownerToken); }
      catch { expire(); }
      finally { checking = false; }
    };
    const timer = window.setTimeout(expire, Math.min(expiresAt - Date.now(), 2_147_483_647));
    const interval = window.setInterval(() => { void check(); }, 60_000);
    const onVisible = () => { void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [ownerToken]);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const onNavigate = (target: string) => navigateTo(target, setPath);

  return (
    <div className="admin-layout">
      <a href="#main-content" className="skip-link">본문으로 이동</a>
      <aside className="sidebar" aria-label="관리자 메뉴">
        <a className="brand" href="/admin" onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onNavigate('/admin');
        }}>
          <span className="brand__symbol" aria-hidden="true">明</span>
          <span><strong>명하</strong><small>ADMIN CONSOLE</small></span>
        </a>
        <div className="sidebar__group-title">WORKSPACE</div>
        <nav className="sidebar__nav" aria-label="운영 메뉴">
          {adminRoutes.map((item) => (
            <NavLink key={item.path} route={item}
              current={route?.section === item.section} onNavigate={onNavigate} />
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="sidebar__bottom-indicator"><span /> {ownerToken ? "Owner 인증 확인" : "Owner 인증 필요"}</div>
          <p>운영 기능은 서버 측 관리자 권한이 검증된 이후에만 활성화됩니다.</p>
          <span className="sidebar__version">CONSOLE / OWNER ACCESS</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="topbar__title">명하 운영 콘솔 <span>/ 내부 운영 도구</span></span>
          <span className="topbar__security"><span aria-hidden="true" /> {ownerToken ? "Owner 세션 · 서버 검증" : "Owner 인증 전 · 접근 잠금"}</span>
          {ownerToken !== null && <button type="button" onClick={() => setOwnerToken(null)}>로그아웃</button>}
        </header>
        <main id="main-content" className="main">
          {route ? (
            <>
              <SectionIntro route={route} />
              {ownerToken === null ? <LockNotice /> : null}
              {route.section === 'overview' ? <><Overview token={ownerToken} onSessionExpired={() => setOwnerToken(null)} />{ownerToken === null && <AdminLogin onSession={setOwnerToken} />}</> : ownerToken === null
                ? <><PendingSection section={route.section} /><AdminLogin onSession={setOwnerToken} /></>
                : <>{route.section === 'analytics'
                  ? <><AdminAnalyticsDashboard token={ownerToken} onSessionExpired={() => setOwnerToken(null)} />
                      <details className="surface"><summary>이벤트 등록·분모·분자 근거 보기</summary><BetaAnalyticsReadiness token={ownerToken} onSessionExpired={() => setOwnerToken(null)} /></details></>
                  : <AdminWorkbench key={route.section + ':' + path} section={route.section} token={ownerToken}
                      onSessionExpired={() => setOwnerToken(null)} onNavigate={onNavigate} />}
                    {route.section === 'readings' && <><AdminAiBudget token={ownerToken} onSessionExpired={() => setOwnerToken(null)}/><AdminAiFinance token={ownerToken} onSessionExpired={() => setOwnerToken(null)} /></>}
                    {['users', 'commerce', 'issues'].includes(route.section) &&
                      <AdminOperatorConsole token={ownerToken} onSessionExpired={() => setOwnerToken(null)} />}</>}
            </>
          ) : (
            <>
              <div className="section-heading">
                <div className="eyebrow"><span className="eyebrow__line" /> MYEONGHA / OPERATIONS</div>
                <h1>접근할 수 없는 페이지</h1>
                <p>요청하신 관리자 화면을 찾을 수 없습니다.</p>
              </div>
              <StatusPanel kind={path === '/admin/access-denied' ? 'forbidden' : 'error'}
                title={path === '/admin/access-denied' ? '접근 권한이 없습니다' : '등록되지 않은 경로입니다'}
                detail={path === '/admin/access-denied'
                  ? '관리자 권한이 확인되지 않았으므로 요청한 작업을 수행할 수 없습니다.'
                  : '등록되지 않은 관리자 경로입니다. 운영 개요 화면으로 이동해 주세요.'}
                action={<button className="return-button" type="button"
                  onClick={() => onNavigate('/admin')}>운영 개요로 돌아가기</button>} />
            </>
          )}
        </main>
        <footer className="footer">
          <span>© MYEONGHA · ADMIN CONSOLE</span>
          <span>사용자 웹과 별도 빌드 · 운영 DB 연결은 별도 승인 필요</span>
        </footer>
      </div>
    </div>
  );
}
