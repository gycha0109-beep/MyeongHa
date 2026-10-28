import{useEffect,useState}from'react';
import{StatusPanel}from'./StatusPanel.js';
import type{createAdminAiBudgetReadV1}from'../../api/src/admin-ai-budget-read-v1.js';
type Budget=Awaited<ReturnType<ReturnType<typeof createAdminAiBudgetReadV1>>>;
const krw=(micro:string|null)=>micro===null?'미측정':(BigInt(micro)/1_000_000n).toLocaleString('ko-KR')+'원';
export function AdminAiBudget({token,onSessionExpired}:{readonly token:string;readonly onSessionExpired:()=>void}){
 const[month,setMonth]=useState(()=>new Date(Date.now()+9*3600_000).toISOString().slice(0,7));
 const[data,setData]=useState<Budget|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let active=true;setData(null);setError(false);
  void fetch('/api/admin/ai-budget?'+new URLSearchParams({month}),{headers:{Authorization:'Bearer '+token},credentials:'same-origin',cache:'no-store'}).then(async r=>{
   if(!active)return;if(r.status===401||r.status===403){onSessionExpired();return;}if(!r.ok)throw Error('Budget unavailable');const v=await r.json() as Budget;
   if(v?.version!=='admin-ai-monthly-budget-v1'||!Array.isArray(v.warnings)||v.warnings.length>4||v.budgetKrw!==100_000)throw Error('Invalid budget contract');if(active)setData(v);
  }).catch(()=>{if(active)setError(true);});return()=>{active=false;};
 },[token,month]);
 return <section className="surface" aria-label="AI 월간 예산"><div className="surface__head"><h2>AI 월간 예산 경고</h2><span className="neutral-tag">한국 시간 · 알림 전용</span></div>
  <p>월 100,000원 · 80,000원과 100,000원에서 표시합니다. AI 서비스를 자동 중단하지 않습니다.</p>
  <label>한국 시간 기준 월<input type="month" required value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label>
  {error?<StatusPanel kind="error" detail="예산 원장 연결을 확인해 주세요. 비용을 0원으로 대체하지 않습니다."/>:data===null?<StatusPanel kind="loading"/>:<>
   <p>기간: {data.window.from} 이상 → {data.window.toExclusive} 미만 (Asia/Seoul 월 경계)</p>
   <dl><div><dt>공급사 확인 비용 (월 전체)</dt><dd>{krw(data.confirmedMicroKrw)}</dd></div>
    <div><dt>공급사 확인 비용 (일부 포함)</dt><dd>{krw(data.knownConfirmedMicroKrw)} · {data.billingStatus==='complete'?'전체 청구 확인':data.billingStatus==='partial'?'일부 청구만 확인':'청구 미연결'}</dd></div><div><dt>관측된 추정 비용 합</dt><dd>{krw(data.knownEstimateMicroKrw)} · {data.estimateCoverage==='complete'?'전체 관측':'부분 관측'}</dd></div>
    <div><dt>USD 원본</dt><dd>관측 추정 {data.knownEstimateMicroUsd} micro-USD · 확인 청구 일부 포함 {data.knownConfirmedMicroUsd??'미측정'} micro-USD · 월 전체 확정 {data.confirmedMicroUsd??'미측정'} micro-USD</dd></div>
    <div><dt>OpenAI API 프로젝트 비용 관측</dt><dd>{data.openAiCosts===null?'미연결':
      data.openAiCosts.observedMicroUsd+' micro-USD · '+data.openAiCosts.queriedToExclusive+'까지의 공급사 API 보고값 (전체 비용 항목, 최종 청구서 아님)'}</dd></div>
    <div><dt>누락 근거</dt><dd>원가 결측 {data.unknownCostCalls}건 · 미연결 영역 {data.missingWorkloads.join(', ')||'없음'} · 환율 {data.fxStatus==='verified_evidence_supplied'?'검증 근거 연결':'미측정'}</dd></div></dl>
   {data.warnings.length===0?<p role="status">{data.confirmedMicroKrw===null?'확정 비용 또는 환율 근거가 없어 예산 도달 여부는 미측정입니다.':'현재 확인된 경고가 없습니다.'}</p>:
    <ul aria-label="월간 예산 경고">{data.warnings.map(w=><li key={w.id}><strong>{w.thresholdPercent}% 경고</strong> · {w.thresholdKrw.toLocaleString('ko-KR')}원 · {w.basis==='provider_confirmed'?'청구 확인':'사용량·단가 추정'} · {w.coverage==='complete'?'전체 관측':'부분 관측'}</li>)}</ul>}
   <p>같은 월·비용 근거·임계값의 경고는 하나의 카드로 표시합니다. 일부 청구 확인액은 월 전체 확정액이 아니며, 일부만으로 임계값을 넘은 경고는 하한 관측입니다. 추정 비용은 확정 청구액을 대체하지 않습니다.</p>
  </>}
 </section>;
}
