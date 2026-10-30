import { useEffect, useState } from 'react';
import { AdminAccessDeniedErrorV1, fetchAdminReadV1, type AdminReadResponse } from './admin-client.js';
import { StatusPanel } from './StatusPanel.js';

const COLUMNS: Record<string,string> = {
  callId:'호출 참조',subjectId:'사용자 참조',attemptId:'실행 시도 참조',turnId:'대화 참조',createdAt:'호출 기록 시각',period:'UTC 집계 기간',
  workload:'비용 영역',feature:'실행 기능',provider:'제공사',model:'모델',outcome:'호출 결과',inputTokens:'입력 토큰',outputTokens:'출력 토큰',
  cachedInputTokens:'캐시 입력 토큰',reasoningTokens:'출력 중 추론 토큰',priceVersion:'적용 단가 버전',policyVersion:'정책 버전',
  inputMicroUsdPerMillion:'입력 단가(마이크로 USD/백만 토큰)',cachedInputMicroUsdPerMillion:'캐시 입력 단가',outputMicroUsdPerMillion:'출력 단가',
  isActive:'저장된 정책 활성',effectiveFrom:'단가 시작 근거',effectiveTo:'단가 종료 근거',sourceStatus:'단가 이력 근거',
  costClass:'비용 분류',estimateSource:'추정 근거',priceAppliedAt:'단가 적용 호출 시각',estimatedMicroUsd:'추정 비용(마이크로 USD)',
  confirmedMicroUsd:'확정 비용(마이크로 USD)',estimateDeltaMicroUsd:'확정-추정 차이',billingStatus:'청구 대조 상태',confirmedMicroKrw:'확정 비용(마이크로 KRW)',
  estimatedMicroKrw:'추정 비용(마이크로 KRW)',fxEvidenceStatus:'환율 근거',otherChargesStatus:'기타 과금 범위',calls:'호출 수',failedCalls:'실패 호출 수',
  observedAttempts:'관측 실행 시도 수',unknownUsageCalls:'토큰 결측 호출 수',unknownCostCalls:'원가 결측 호출 수',knownEstimateMicroUsd:'관측된 추정 비용 합',
  verifiedRevenueMicroKrw:'검증 매출(마이크로 KRW)',revenueCostBasisPoints:'확정 원가/매출(bp)',billingEvidenceSha256:'청구 근거 지문',
};
const VALUES: Record<string,string> = {
  character_chat:'캐릭터 대화',reading:'Reading',provider_confirmed:'제공사 청구 확인',usage_price_estimate:'사용량·단가 추정',unknown:'계산 불가',
  billing_source_unconnected_or_unmatched:'청구 원본 미연결 또는 호출 대조 없음',provider_confirmed_exact_call:'제공사 청구·호출 정확 대조',
  provider_invoice_cohort_unconnected:'기간 전체 청구 대조 미연결',pinned_usage_and_rates:'기록된 호출 단가·사용량',recorded_versioned_estimate:'기록 당시 버전의 추정값',
  missing_usage_or_price:'사용량 또는 적용 단가 없음',unmeasured:'미측정',not_in_token_estimate:'토큰 추정 외 과금 미확인',included_in_provider_amount:'제공사 금액에 포함',
  out_of_scope_or_invalid:'환율 적용 기간·근거 불일치',verified_rate_supplied:'검증 환율 근거 있음',
  stored_policy_version_effective_dates_unrecorded:'버전은 기록됨 · 유효 시작/종료 시각은 미기록',
};

export function AdminAiFinance({ token,onSessionExpired }: { readonly token:string; readonly onSessionExpired:()=>void }) {
  const [mode,setMode]=useState<'calls'|'summary'|'prices'>('summary');
  const [draft,setDraft]=useState(()=>({from:new Date(Date.now()-29*86_400_000).toISOString().slice(0,10),to:new Date().toISOString().slice(0,10),subjectId:'',model:'',feature:'',granularity:'day',groupBy:'feature'}));
  const [filters,setFilters]=useState(draft);
  const [cursor,setCursor]=useState<string|null>(null);
  const [result,setResult]=useState<AdminReadResponse|null>(null);
  const [error,setError]=useState('');
  const [comparisonCall,setComparisonCall]=useState('');
  const [comparisonAmount,setComparisonAmount]=useState('');
  const [comparison,setComparison]=useState('');
  useEffect(()=>{
    let active=true;setResult(null);setError('');setComparison('');
    const query=new URLSearchParams({limit:'20'});
    if (cursor!==null) query.set('cursor',cursor);
    if (filters.model) query.set('model',filters.model);
    if (mode!=='prices') {
      query.set('from',filters.from);query.set('to',filters.to);
      if(filters.subjectId) query.set('subjectId',filters.subjectId);
      if(filters.feature) query.set('feature',filters.feature);
    }
    if(mode==='summary'){query.set('granularity',filters.granularity);query.set('groupBy',filters.groupBy);}
    void fetchAdminReadV1('/api/admin/ai-finance/'+mode+'?'+query.toString(),token).then(value=>{if(active)setResult(value);}).catch(error=>{
      if(!active)return;if(error instanceof AdminAccessDeniedErrorV1){onSessionExpired();return;}
      setError('비용 원장 또는 최소 권한 조회 연결을 확인해 주세요. 확정 비용을 임의로 표시하지 않습니다.');
    });return()=>{active=false;};
  },[token,mode,filters,cursor]);
  const columns=Object.keys(COLUMNS).filter(key=>result?.rows.some(row=>key in row));
  return <section className="surface admin-data" aria-label="AI 비용 관리">
    <div className="surface__head"><div><span className="section-kicker">AI FINANCE</span><h2>AI 사용량·원가·청구 대조</h2></div><span className="neutral-tag">확정·추정·미측정 구분</span></div>
    <p className="readiness-explainer">제공사 청구로 정확히 대조된 금액만 확정 비용입니다. 캐시 입력은 전체 입력의 일부이고 추론 토큰은 출력의 일부이므로 중복 과금하지 않습니다. 실패·여러 실행 시도의 비용도 포함합니다. Reading 원가 저장 경로와 제공사 청구·검증 환율이 연결되지 않았다면 해당 값은 —입니다. 매출 대비 원가도 동일 기간·코호트·확정 원가·환율 근거가 모두 있어야 계산합니다.</p>
    <div className="admin-tabs" aria-label="AI 원가 조회 종류">
      {([['summary','기간·기능·사용자 집계'],['calls','호출별 사용량·대조'],['prices','저장 단가 버전']] as const).map(([value,label])=><button type="button" key={value} className={mode===value?'active':''} onClick={()=>{setMode(value);setCursor(null);}}>{label}</button>)}
    </div>
    <form className="admin-toolbar" onSubmit={event=>{event.preventDefault();setFilters({...draft});setCursor(null);}}>
      {mode!=='prices'&&<><label>UTC 시작일<input aria-label="원가 UTC 시작일" type="date" required value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
      <label>UTC 종료일<input aria-label="원가 UTC 종료일" type="date" required value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
      <input aria-label="원가 사용자 UUID" placeholder="사용자 UUID (선택)" value={draft.subjectId} maxLength={36} onChange={event=>setDraft({...draft,subjectId:event.target.value.trim()})}/>
      <label>기능<select value={draft.feature} onChange={event=>setDraft({...draft,feature:event.target.value})}><option value="">전체</option><option value="chat">대화 응답</option><option value="post_turn">대화 후처리</option></select></label></>}
      <input aria-label="원가 모델 식별자" placeholder="정확한 모델 (선택)" value={draft.model} maxLength={128} onChange={event=>setDraft({...draft,model:event.target.value.trim()})}/>
      {mode==='summary'&&<><label>집계 단위<select value={draft.granularity} onChange={event=>setDraft({...draft,granularity:event.target.value})}><option value="day">일별</option><option value="month">월별</option></select></label>
      <label>집계 기준<select value={draft.groupBy} onChange={event=>setDraft({...draft,groupBy:event.target.value})}><option value="feature">기능·모델</option><option value="subject">사용자·기능·모델</option></select></label></>}
      <button type="submit">조건 적용</button>
    </form>
    {error?<StatusPanel kind="error" detail={error}/>:result===null?<StatusPanel kind="loading"/>:result.rows.length===0?<StatusPanel kind="empty" detail="선택 기간에 관측된 비용 원장이 없습니다. Reading·제공사 청구 데이터 부재를 0원으로 간주하지 않습니다."/>:
      <div className="admin-table-scroll"><table className="admin-table"><thead><tr>{columns.map(key=><th scope="col" key={key}>{COLUMNS[key]}</th>)}</tr></thead><tbody>{result.rows.map((row,index)=><tr key={String(row.callId??row.period??index)+':'+index}>{columns.map(key=><td key={key}>{row[key]===null||row[key]===undefined?'—':VALUES[String(row[key])]??String(row[key])}</td>)}</tr>)}</tbody></table></div>}
    {result&&(cursor!==null||result.nextCursor!==null)&&<div className="admin-pagination"><button type="button" disabled={cursor===null} onClick={()=>setCursor(Number(cursor)>20?String(Number(cursor)-20):null)}>이전 페이지</button><button type="button" disabled={result.nextCursor===null} onClick={()=>setCursor(result.nextCursor)}>다음 페이지</button></div>}
    {mode==='calls'&&result&&result.rows.length>0&&<form className="admin-toolbar" aria-label="청구 대조 미리보기" onSubmit={event=>{
      event.preventDefault();const row=result.rows.find(item=>item.callId===comparisonCall);
      if(row===undefined||!/^\d{1,16}$/u.test(comparisonAmount)||!Number.isSafeInteger(Number(comparisonAmount))){setComparison('정확한 호출과 비음수 정수 금액을 입력해 주세요.');return;}
      if(typeof row.estimatedMicroUsd!=='string'){setComparison('선택 호출의 추정 비용 근거가 없어 차이를 계산할 수 없습니다.');return;}
      setComparison('미검증 입력 비교값 − 기록된 추정값 = '+(BigInt(comparisonAmount)-BigInt(row.estimatedMicroUsd)).toString()+' 마이크로 USD. 확정 비용·청구 대조 기록으로 저장하지 않았습니다.');
    }}>
      <label>대조 호출<select required value={comparisonCall} onChange={event=>setComparisonCall(event.target.value)}><option value="">호출 선택</option>{result.rows.map(row=><option key={String(row.callId)} value={String(row.callId)}>{String(row.callId)}</option>)}</select></label>
      <label>청구 비교값(마이크로 USD)<input inputMode="numeric" required value={comparisonAmount} maxLength={16} onChange={event=>setComparisonAmount(event.target.value.trim())}/></label>
      <button type="submit">입력값 대조 미리보기</button><p role="status">{comparison}</p>
    </form>}
    <p className="surface__foot">청구 대조 미리보기의 입력은 검증된 청구 원본이 아닙니다. 단가 버전만 기록되고 유효 시각이 없다면 과거 호출에 현재 단가를 소급 적용하지 않습니다. 확정 청구·환율 연결은 서버의 검증된 근거 어댑터로만 가능합니다.</p>
  </section>;
}
