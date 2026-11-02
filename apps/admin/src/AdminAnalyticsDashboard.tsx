import { useEffect, useState } from 'react';
import { AdminAccessDeniedErrorV1 } from './admin-client.js';
import { StatusPanel } from './StatusPanel.js';
import type { AdminAnalyticsDashboardResultV1 } from '../../api/src/admin-analytics-pipeline-postgres-v1.js';

function validResult(value: unknown): value is AdminAnalyticsDashboardResultV1 {
  if(value===null||typeof value!=='object')return false;
  const v=value as Record<string,unknown>;
  if(v.version!=='admin-analytics-dashboard-v1'||!Array.isArray(v.finance)||v.finance.length>500||
    v.analytics===null||typeof v.analytics!=='object')return false;
  const a=v.analytics as Record<string,unknown>;
  if(!Array.isArray(a.metrics)||a.metrics.length>30||!Array.isArray(a.funnel)||a.funnel.length>20||!Array.isArray(a.series)||a.series.length>5000)return false;
  return a.metrics.every((row:unknown)=>row!==null&&typeof row==='object'&&
    Object.values(row).every(field=>field===null||typeof field==='string'||(typeof field==='number'&&Number.isFinite(field))));
}

export async function fetchAdminAnalyticsDashboardV1(token:string,query:URLSearchParams,fetchImpl:typeof fetch=fetch):Promise<AdminAnalyticsDashboardResultV1> {
  for(const key of query.keys())if(!['from','to','grain','campaignKey'].includes(key))throw Error('허용되지 않은 분석 조건입니다.');
  if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))throw Error('관리자 세션이 유효하지 않습니다.');
  const response=await fetchImpl('/api/admin/analytics-dashboard?'+query.toString(),{method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+token},credentials:'same-origin',cache:'no-store'});
  if(response.status===401||response.status===403)throw new AdminAccessDeniedErrorV1();
  if(!response.ok)throw Error('실제 분석·결제 근거를 조회할 수 없습니다. 권한·DB·감사 연결을 확인해 주세요.');
  const payload:unknown=await response.json();if(!validResult(payload))throw Error('분석 응답 계약이 유효하지 않습니다.');return payload;
}

const number=(value:number|null,unit='')=>value===null?'—':value.toLocaleString('ko-KR',{maximumFractionDigits:2})+unit;
const sourceLabels={disabled:'추적 비활성 · 동의/삭제/원본 연결 미확인',configured_source_unverified:'수집 설정 존재 · 기간 완전성 미검증',source_partial:'최대 관측 범위 초과 · 전환율 미측정',source_covered:'선택 기간의 소스 관측 범위 확인'};

export function AdminAnalyticsDashboard({token,onSessionExpired}:{readonly token:string;readonly onSessionExpired:()=>void}) {
  const [period,setPeriod]=useState(()=>({from:new Date(Date.now()-6*86_400_000).toISOString().slice(0,10),to:new Date().toISOString().slice(0,10),grain:'day',campaignKey:''}));
  const [draft,setDraft]=useState(period);
  const [result,setResult]=useState<AdminAnalyticsDashboardResultV1|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;setResult(null);setError('');const query=new URLSearchParams({from:period.from,to:period.to,grain:period.grain});if(period.campaignKey)query.set('campaignKey',period.campaignKey);
    void fetchAdminAnalyticsDashboardV1(token,query).then(value=>{if(active)setResult(value);}).catch(error=>{
      if(!active)return;if(error instanceof AdminAccessDeniedErrorV1){onSessionExpired();return;}setError(error instanceof Error?error.message:'분석을 조회할 수 없습니다.');
    });return()=>{active=false;};
  },[token,period]);
  return <div className="analytics-readiness">
    <section className="surface">
      <div className="surface__head"><div><span className="section-kicker">SOURCE-BOUND ANALYTICS</span><h2>방문·전환 및 검증 결제 근거</h2></div><span className="neutral-tag">UTC · Owner 감사</span></div>
      <form className="date-range-form" onSubmit={event=>{
        event.preventDefault();const days=(Date.parse(draft.to)-Date.parse(draft.from))/86_400_000;
        if(!Number.isFinite(days)||days<0||days>179||(draft.campaignKey&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/u.test(draft.campaignKey))){setError('시작·종료일을 포함해 180일 이내이며 캠페인은 등록 식별자로 지정해 주세요.');return;}setPeriod({...draft});
      }}>
        <label>UTC 시작일<input type="date" required value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
        <label>UTC 종료일<input type="date" required value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
        <label>집계 단위<select value={draft.grain} onChange={event=>setDraft({...draft,grain:event.target.value})}><option value="day">일별</option><option value="week">주별 · 월요일 시작</option><option value="month">월별</option></select></label>
        <label>캠페인 식별자<input value={draft.campaignKey} maxLength={96} placeholder="전체 캠페인" onChange={event=>setDraft({...draft,campaignKey:event.target.value.trim()})}/></label>
        <button type="submit">같은 기간 조회</button>
      </form>
      <p className="readiness-explainer">제품 분석 이벤트는 발생 시각부터 최대 180일 보관하며 동의 철회·사용자 삭제 시 먼저 삭제합니다. 결제 법정 증빙에는 이 기간을 적용하지 않습니다. 방문자·가입·구매 전환은 동일 기간과 고유 분석 참조를 사용합니다. 동의·삭제 연계·유효 방문 정의와 관측 완전성이 확인되지 않으면 0 대신 —를 표시합니다. 클라이언트 구매 성공은 매출 근거가 아닙니다.</p>
      {error?<StatusPanel kind="error" detail={error}/>:result===null?<StatusPanel kind="loading"/>:<>
        <p role="status">{sourceLabels[result.collectionStatus]}</p>
        <div className="beta-targets">{result.analytics.metrics.map(metric=><article className="beta-target" key={metric.key}>
          <span className="beta-target__title">{metric.label}</span><strong>{number(metric.value,metric.unit==='%'?'%':'')}</strong>
          <span className="beta-target__goal">분자 {number(metric.numerator)} / 분모 {number(metric.denominator)} · {metric.status==='unmeasured'?'미측정':metric.status==='empty_denominator'?'분모 없음':metric.status==='target_sample_not_met'?'목표 표본 100명 미달':'관측'}</span>
        </article>)}</div>
        <p className="surface__foot">목표: 유효 방문 100명, 구매 전환 ≥5%, 만족도 ≥4/5, 환불·중대 불만 ≤10%, 2차 유료 구매자 30명. 목표는 실적이 아닙니다. {result.analytics.cohortDefinition}</p>
      </>}
    </section>
    {result&&<>
      <section className="surface"><div className="surface__head"><h2>순차 퍼널·이탈</h2></div>
        <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th scope="col">단계 이벤트</th><th scope="col">고유 방문자</th><th scope="col">직전 단계</th><th scope="col">단계 이탈률</th><th scope="col">근거</th></tr></thead>
          <tbody>{result.analytics.funnel.map(step=><tr key={step.eventName}><td>{step.eventName}</td><td>{number(step.uniqueVisitors)}</td><td>{number(step.previousStepVisitors)}</td><td>{number(step.dropoutRate,'%')}</td><td>{step.status==='measured'?'관측':'미측정'}</td></tr>)}</tbody></table></div>
      </section>
      <section className="surface"><div className="surface__head"><h2>기간·상품·채널별 분석</h2></div>
        {result.analytics.series.length===0?<StatusPanel kind="empty" detail="승인된 분석 이벤트 원본이 없습니다. 방문 0명으로 간주하지 않습니다."/>:
          <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th scope="col">UTC 기간</th><th scope="col">상품</th><th scope="col">캠페인</th><th scope="col">채널</th><th scope="col">방문자</th><th scope="col">구매자</th><th scope="col">전환율</th></tr></thead><tbody>{result.analytics.series.map((row,index)=><tr key={index}><td>{row.period}</td><td>{row.productKey}</td><td>{row.campaignKey}</td><td>{row.channelKey}</td><td>{number(row.visitors)}</td><td>{number(row.buyers)}</td><td>{number(row.conversionRate,'%')}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="surface"><div className="surface__head"><h2>서버 검증 영수증 금액</h2><span className="neutral-tag">방문자 추적과 별도 원본</span></div>
        <p className="readiness-explainer">{result.financialDefinition}</p>
        {result.financialStatus==='partial_verified_receipt_facts'&&<p role="alert">최대 500개 묶음만 표시했습니다. 기간을 좁혀 전체 근거를 확인해 주세요.</p>}
        {result.finance.length===0?<StatusPanel kind="empty" detail="이 UTC 검증 기간에 현재 verified인 영수증이 없습니다. 이것은 방문자·환불·정산 또는 분석 원본의 부재를 뜻하지 않습니다."/>:
          <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th scope="col">검증 UTC 기간</th><th scope="col">상품</th><th scope="col">통화</th><th scope="col">검증 영수증</th><th scope="col">저장 소유자 수</th><th scope="col">기록 금액 · 최소통화단위</th><th scope="col">금액 근거 결측</th></tr></thead><tbody>{result.finance.map((row,index)=><tr key={index}><td>{row.period}</td><td>{row.productKey}</td><td>{row.currency??'—'}</td><td>{row.verifiedReceipts}</td><td>{row.receiptOwners}</td><td>{row.verifiedAmountMinor??'—'}</td><td>{row.moneyMissing}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </div>;
}
