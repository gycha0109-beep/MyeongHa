import {useState} from 'react';
import {getActiveBearer} from '../../product-auth.js';

const REASONS=[
  ['change_of_mind','단순 변심'],
  ['not_provided','콘텐츠 미제공'],
  ['delivery_failed','콘텐츠 전달 실패'],
  ['not_as_described','상품 설명과 다른 내용'],
  ['defect','서비스 하자'],
  ['duplicate_charge','중복 결제'],
  ['unprovided_separable_part','일부 구성 미제공'],
  ['other','기타'],
] as const;
type Submitted=Readonly<{claimId:string;receivedAt:string}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * The My-page consumer interface is compiled in only behind the explicit
 * paid product release flag. API/DB independently default to disabled.
 * No free-text, birth details or raw payment payload are ever submitted.
 */
export function WithdrawalRequestPanel(){
  const [reason,setReason]=useState<(typeof REASONS)[number][0]>('not_provided');
  const [purchase,setPurchase]=useState('');
  const [unit,setUnit]=useState('');
  const [pending,setPending]=useState(false);
  const [failure,setFailure]=useState<string|null>(null);
  const [receipt,setReceipt]=useState<Submitted|null>(null);
  const [nonce,setNonce]=useState<string|null>(null);
  const [latestStatus,setLatestStatus]=useState<string|null>(null);

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(pending||receipt)return;
    setFailure(null);
    const specified=purchase.trim().length>0||unit.trim().length>0;
    if(specified&&(!UUID.test(purchase.trim())||!UUID.test(unit.trim()))){
      setFailure('주문 정보는 구매 ID와 구매 단위 ID를 함께 입력하거나 둘 다 비워 주세요.');
      return;
    }
    const key=nonce??crypto.randomUUID();
    setNonce(key);
    setPending(true);
    try{
      const bearer=await getActiveBearer();
      if(!bearer||bearer.kind!=='member'){
        throw Error('회원 로그인이 필요합니다.');
      }
      const response=await fetch('/api/me?__myeongha_withdrawal_claim=1',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{
          authorization:'Bearer '+bearer.token,
          'content-type':'application/json',
          accept:'application/json',
        },
        body:JSON.stringify({
          reason,idempotencyKey:key,
          ...(specified?{
            purchaseIntentId:purchase.trim(),unitId:unit.trim(),
          }:{}),
        }),
      });
      const value:unknown=await response.json();
      if(!response.ok||!value||typeof value!=='object'||!('ok'in value)
        ||value.ok!==true||!('data'in value)||!value.data
        ||typeof value.data!=='object'){
        throw Error('현재 청약철회 접수 서비스를 사용할 수 없습니다.');
      }
      const data=value.data as Record<string,unknown>;
      if(typeof data.claimId!=='string'||!UUID.test(data.claimId)
        ||typeof data.receivedAt!=='string'
        ||!Number.isFinite(Date.parse(data.receivedAt))
        ||data.status!=='received'||data.refundApproved!==false
        ||data.providerRefundCompleted!==false){
        throw Error('접수 결과를 검증하지 못했습니다. 같은 내용으로 다시 확인해 주세요.');
      }
      setReceipt({claimId:data.claimId,receivedAt:data.receivedAt});
    }catch(error){
      setFailure(error instanceof Error?error.message:'접수 처리 결과를 확인하지 못했습니다.');
    }finally{
      setPending(false);
    }
  }
  async function checkStatus(){
    if(!receipt||pending)return;
    setPending(true);
    setFailure(null);
    try{
      const bearer=await getActiveBearer();
      if(!bearer||bearer.kind!=='member')throw Error('회원 로그인이 필요합니다.');
      const params=new URLSearchParams({__myeongha_withdrawal_claim:'1',claimId:receipt.claimId});
      const response=await fetch('/api/me?'+params.toString(),{
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{authorization:'Bearer '+bearer.token,accept:'application/json'},
      });
      const payload:unknown=await response.json();
      if(!response.ok||!payload||typeof payload!=='object'
        ||!('ok'in payload)||payload.ok!==true
        ||!('data'in payload)||!payload.data||typeof payload.data!=='object')
        throw Error('접수 상태를 확인할 수 없습니다.');
      const data=payload.data as Record<string,unknown>;
      if(data.claimId!==receipt.claimId||typeof data.status!=='string'
        ||!['received','refund_decision_recorded','refund_processing','refund_confirmed'].includes(data.status))
        throw Error('접수 상태 확인 결과가 올바르지 않습니다.');
      setLatestStatus(data.status);
    }catch(e){
      setFailure(e instanceof Error?e.message:'접수 상태를 확인할 수 없습니다.');
    }finally{setPending(false);}
  }
  const statusCopy:Record<string,string>={
    received:'접수 완료 · 검토 대기',
    refund_decision_recorded:'환불 결정 기록됨 · 결제사 처리 전',
    refund_processing:'결제사 환불 처리 확인 중',
    refund_confirmed:'결제사 환불 확인 완료',
  };
  return (
    <section className="my-withdrawal-request" aria-label="청약철회 및 환불 요청">
      <h4>청약철회 및 환불 요청</h4>
      <p>주문 정보를 알고 계시면 입력해 주세요. 찾을 수 없다면 빈칸으로 접수할 수 있습니다.</p>
      <p>접수는 환불 승인이 아니며, 법정 청약철회 가능 여부와 공급 사실을 별도로 확인합니다.</p>
      {receipt?(
        <div role="status">
          <p>접수 완료</p>
          <p>접수번호: <code>{receipt.claimId}</code></p>
          <p>접수시각: {new Date(receipt.receivedAt).toLocaleString('ko-KR')}</p>
          <p>접수 기록은 보존 정책에 따라 처리되며 실제 환불은 검토 후 진행됩니다.</p>
          <p>{statusCopy[latestStatus??'received']}</p>
          <button type="button" disabled={pending} onClick={()=>void checkStatus()}>
            {pending?'상태 확인 중…':'처리 상태 새로고침'}
          </button>
        </div>
      ):(
        <form onSubmit={event=>void submit(event)}>
          <label htmlFor="withdrawal-reason">접수 사유</label>
          <select id="withdrawal-reason" value={reason}
            onChange={event=>{setReason(event.target.value as typeof reason);setNonce(null);setFailure(null);}}
            disabled={pending}>
            {REASONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="withdrawal-purchase-id">구매 ID (선택)</label>
          <input id="withdrawal-purchase-id" autoComplete="off" value={purchase}
            maxLength={36} disabled={pending}
            onChange={e=>{setPurchase(e.target.value);setNonce(null);setFailure(null);}}
            placeholder="확인 가능한 경우 입력" />
          <label htmlFor="withdrawal-unit-id">구매 단위 ID (선택)</label>
          <input id="withdrawal-unit-id" autoComplete="off" value={unit}
            maxLength={36} disabled={pending}
            onChange={e=>{setUnit(e.target.value);setNonce(null);setFailure(null);}}
            placeholder="구매 ID 입력 시 함께 입력" />
          <button type="submit" disabled={pending}>
            {pending?'접수 중…':'청약철회 요청 접수'}
          </button>
        </form>
      )}
      {failure?<p role="alert">{failure}</p>:null}
      <p>구매 ID를 확인할 수 없거나 추가 설명이 필요하시면
        {' '}<a href="contact.html">고객 문의</a>도 이용하실 수 있습니다.
      </p>
    </section>
  );
}
