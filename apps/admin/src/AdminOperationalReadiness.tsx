import { useEffect, useState } from 'react';
import { fetchAdminReadV1, AdminAccessDeniedErrorV1 } from './admin-client.js';
import type { AdminReadResponse } from './admin-client.js';
import { StatusPanel } from './StatusPanel.js';

export const BETA_TARGETS_V1 = Object.freeze([
  { title: '1차 유효 방문', target: '100명', value: null },
  { title: '구매 전환율', target: '5% 이상', value: null },
  { title: '구매 만족도', target: '4.0 / 5 이상', value: null },
  { title: '환불·중대 불만 비율', target: '10% 이하', value: null },
  { title: '2차 유료 구매자', target: '30명 이상', value: null },
] as const);

export const DISABLED_OPERATOR_ACTIONS_V1 = Object.freeze([
  {
    action: '크레딧 보정·수동 지급',
    reason: '관리자용 승인 원장 명령, 행위 확인, 감사·복구 경로 미연결',
  },
  {
    action: '환불·결제 철회',
    reason: '결제사 환불 완료와 Entitlement 철회 정본의 관리자 실행 권한 미검증',
  },
  {
    action: '사용자 제한·삭제·복구',
    reason: '기존 회원 삭제 작업은 일반 사용자 도메인 소유. 관리자 임의 실행 미승인',
  },
  {
    action: '가격·상품 판매 활성화',
    reason: '판매·PSP 출시 게이트와 상품 카탈로그 편집 정본은 별도 승인 대상',
  },
  {
    action: '공지·홈 배너 변경',
    reason: '표현 정보 전용 승인 설정 경로가 없어 게시·숨김·노출 기간 변경은 비활성',
  },
] as const);

export function BetaAnalyticsReadiness({ token, onSessionExpired }: {
  readonly token: string;
  readonly onSessionExpired: () => void;
}) {
  const [period, setPeriod] = useState<{ from: string; to: string }>(() => ({
    from: new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  const [draftFrom, setDraftFrom] = useState(period.from);
  const [draftTo, setDraftTo] = useState(period.to);
  const [rows, setRows] = useState<AdminReadResponse['rows'] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setRows(null); setError('');
    const query = new URLSearchParams({ limit: '20', from: period.from, to: period.to });
    void fetchAdminReadV1('/api/admin/analytics?' + query.toString(), token).then(result => {
      if (active) setRows(result.rows);
    }).catch(error => {
      if (!active) return;
      if (error instanceof AdminAccessDeniedErrorV1) { onSessionExpired(); return; }
      setError('분석 근거 계약을 조회할 수 없습니다. 다시 기간을 적용해 주세요.');
    });
    return () => { active = false; };
  }, [token, period]);
  return <div className="analytics-readiness">
    <section className="surface">
      <div className="surface__head">
        <div><span className="section-kicker">BETA VALIDATION</span><h2>베타 성과 기준과 실제 측정 가능 여부</h2></div>
        <span className="neutral-tag">계측 원본 미연결</span>
      </div>
      <p className="readiness-explainer">아래 수치는 목표선이며 측정 결과가 아닙니다. 유효 방문·고유 방문자·전환·만족도 이벤트의 수집 및 보존 근거가 확인되기 전에는 성과율을 계산하지 않습니다.</p>
      <form className="date-range-form" onSubmit={event => {
        event.preventDefault();
        const days = (Date.parse(draftTo + 'T00:00:00Z') - Date.parse(draftFrom + 'T00:00:00Z')) / 86_400_000;
        if (!draftFrom || !draftTo || !Number.isFinite(days) || days < 0 || days > 90) {
          setError('시작일·종료일을 함께 선택하고 90일 이내로 지정해 주세요.'); return;
        }
        setPeriod({ from: draftFrom, to: draftTo });
      }}>
        <label>UTC 시작일<input type="date" required value={draftFrom} onChange={event => setDraftFrom(event.target.value)} /></label>
        <label>UTC 종료일<input type="date" required value={draftTo} onChange={event => setDraftTo(event.target.value)} /></label>
        <button type="submit">동일 기간 적용</button>
      </form>
      <div className="beta-targets">
        {BETA_TARGETS_V1.map(target => <div className="beta-target" key={target.title}>
          <span className="beta-target__title">{target.title}</span>
          <strong>—</strong>
          <span className="beta-target__goal">목표 {target.target}</span>
        </div>)}
      </div>
    </section>
    <section className="surface">
      <div className="surface__head"><div><span className="section-kicker">EVIDENCE GAPS</span><h2>퍼널 단계별 수집 근거</h2></div></div>
      {error ? <StatusPanel kind="error" detail={error} /> : rows === null ? <StatusPanel kind="loading" /> :
        <div className="pending-list">{rows.map((item, index) => <div className="analytics-evidence" key={String(item.metricKey)}>
          <span className="pending-list__index">{String(index + 1).padStart(2, '0')}</span>
          <div><strong>{String(item.label)}</strong>
            <p>{item.registryStatus === 'registered' ? '등록됨: ' + String(item.eventName) : '이벤트·데이터 계약 미확정'}</p>
            <p>{String(item.definition)}</p>
            <small>분자: {String(item.numeratorDefinition)} / 분모: {String(item.denominatorDefinition)}</small>
            <p>기간 {String(item.periodFrom)} ~ {String(item.periodTo)} (UTC) · 유입 unknown · 표본 미확인</p>
          </div><span className="readiness-wait">— · 미측정</span>
        </div>)}</div>}
      <p className="surface__foot">승인된 분석 적재 원본·분석 전용 비식별 참조·동의/거부·분석 연결 보존/삭제 근거가 미확인입니다. 일반 개인정보·Commerce 보존 결정만으로 분석 수집을 승인하지 않습니다. 추적은 비활성이며 데이터 없음은 0명이나 0%가 아닙니다. 표본 수·누락률·유료/체험단 구분과 채널 귀속은 미측정입니다. 출생 원문·대화·영수증·인증 ID는 분석 이벤트에 적재하지 않습니다.</p>
    </section>
  </div>;
}

export function OperatorActionsReadiness() {
  return <section className="surface operator-actions">
    <div className="surface__head"><div><span className="section-kicker">OPERATOR ACTIONS</span><h2>관리자 변경 작업</h2></div><span className="neutral-tag">현재 읽기 전용</span></div>
    <p className="readiness-explainer">실행 가능한 명령은 아직 연결하지 않았습니다. 기존 데이터나 원장을 직접 수정하는 버튼은 제공하지 않습니다.</p>
    <div className="pending-list">
      {DISABLED_OPERATOR_ACTIONS_V1.map(item => <div className="operator-action" key={item.action}>
        <div><strong>{item.action}</strong><p>{item.reason}</p></div>
        <span className="neutral-tag">실행 불가</span>
      </div>)}
    </div>
  </section>;
}
