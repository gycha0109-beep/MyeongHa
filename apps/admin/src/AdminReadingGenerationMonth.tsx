import { useEffect,useState } from 'react';
import type {AdminReadingGenerationMonthV1} from '../../api/src/admin-reading-generation-month-v1.js';
import {AdminAccessDeniedErrorV1} from './admin-client.js';

const AMOUNT=/^(?:0|[1-9][0-9]{0,15})$/u;
function valid(value:unknown,month:string):value is AdminReadingGenerationMonthV1{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const r=value as Partial<AdminReadingGenerationMonthV1>;
  if(r.version!=='admin-reading-generation-month-v1'||
    r.coverage!=='provider_events_only_unverified'||
    r.window?.month!==month||r.totalEstimateMicroUsd!==null||
    r.confirmedCostMicroUsd!==null||r.estimatedMicroKrw!==null)return false;
  const fields=[r.observedCalls,r.observedReadings,r.unknownCostCalls,
    r.missingUsageCalls,r.knownEstimateMicroUsd];
  if(fields.some(x=>typeof x!=='string'||!AMOUNT.test(x)))return false;
  const calls=BigInt(r.observedCalls!);
  return BigInt(r.observedReadings!)<=calls&&BigInt(r.unknownCostCalls!)<=calls&&
    BigInt(r.missingUsageCalls!)<=calls&&
    (calls!==0n||r.knownEstimateMicroUsd==='0');
}

/** Distinct from Character chat financial metrics and from a full AI budget. */
export function AdminReadingGenerationMonth({token,month,onSessionExpired}:{
  readonly token:string;readonly month:string;readonly onSessionExpired:()=>void;
}){
  const[data,setData]=useState<AdminReadingGenerationMonthV1|null>(null);
  const[unavailable,setUnavailable]=useState(false);
  useEffect(()=>{
    let alive=true;setData(null);setUnavailable(false);
    const url='/api/admin/reading-generation-cost/monthly?'+new URLSearchParams({month});
    void fetch(url,{headers:{Authorization:'Bearer '+token},credentials:'same-origin',cache:'no-store'})
      .then(async r=>{
        if(!alive)return;
        if(r.status===403||r.status===401)throw new AdminAccessDeniedErrorV1();
        if(!r.ok)throw Error('Reading AI cost source unavailable');
        const payload:unknown=await r.json();
        if(!valid(payload,month))throw Error('Unbound Reading AI cost monthly receipt');
        if(alive)setData(payload);
      }).catch(e=>{
        if(!alive)return;
        if(e instanceof AdminAccessDeniedErrorV1){onSessionExpired();return;}
        setUnavailable(true);
      });
    return()=>{alive=false;};
  },[token,month,onSessionExpired]);
  return <section aria-label="Reading 생성 AI 별도 관측">
    <h3>Reading 생성 AI 비용 · 별도 관측</h3>
    {unavailable?<p role="status">생성 비용 원장 미연결 또는 조회 실패 · 비용은 미측정입니다.</p>:
      data===null?<p role="status">Reading 호출 비용 원장 확인 중…</p>:
      <>
        <p>기록된 공급사 호출 {data.observedCalls}건 · Reading {data.observedReadings}건 · 비용 결측 {data.unknownCostCalls}건 · 사용량 결측 {data.missingUsageCalls}건</p>
        <p>관측된 부분 추정 원가: {data.observedCalls==='0'?'미측정 (기록된 호출 없음)':data.knownEstimateMicroUsd+' micro-USD'} · 월 전체 원가/확정 청구액/원화 원가: 미측정</p>
      </>
    }
    <p>이 통계는 Reading을 생성한 AI 호출만 대상으로 합니다. 캐릭터 대화에서 Reading을 참고한 비용과 합산하지 않습니다. 실제 공급사 호출 전체가 기록됐다는 근거가 없어 0건도 0원으로 해석하지 않습니다.</p>
  </section>;
}
