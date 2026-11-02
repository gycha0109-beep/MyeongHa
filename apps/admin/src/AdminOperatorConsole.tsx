import { useEffect,useState } from 'react';
import type { FormEvent } from 'react';
import { AdminAccessDeniedErrorV1 } from './admin-client.js';
import {adminLocalDatetimeToUtcV1,adminUtcToLocalDatetimeV1} from './admin-local-datetime-v1.js';
import { ADMIN_CREDIT_FIXED_LIMIT_V1,ADMIN_CREDIT_CONFIRMATION_REQUIRED_V1 } from '../../api/src/admin-operating-policy-v1.js';

type State = Readonly<Record<string,string|number|boolean|null>>;
type Capability = {operation:string;enabled:boolean;authority:string|null;blocker:string|null;refundModes?:{full:boolean;partial:boolean}};
const LABELS:Record<string,string>={'credit-adjust':'크레딧 지급·회수','refund':'전액·부분 환불','account-restrict':'계정 제한','account-release':'계정 제한 해제','account-delete-request':'계정 삭제 요청','account-restore':'계정 복구','presentation-save':'공지·배너 저장'};
const FORM_EMPTY={kind:'notice',title:'',body:'',linkPath:'',status:'draft',startsAt:'',endsAt:'',reason:''};

async function api(token:string,path:string,body?:unknown):Promise<Record<string,unknown>> {
 const res=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json',Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(res.status===401||res.status===403)throw new AdminAccessDeniedErrorV1();
 const data=await res.json() as Record<string,unknown>;
 if(!res.ok){const error=new Error(typeof data.error==='string'?data.error:'관리자 명령을 완료할 수 없습니다.');throw error;}
 return data;
}
function safeRows(value:unknown):State[] {
 if(!Array.isArray(value)||value.length>50)throw new Error('유효하지 않은 조회 결과입니다.');
 return value.map(row=>{if(row===null||typeof row!=='object'||Array.isArray(row)||Object.values(row).some(item=>!(item===null||typeof item==='string'||typeof item==='boolean'||(typeof item==='number'&&Number.isSafeInteger(item)))))throw new Error('유효하지 않은 표시 정보입니다.');return row as State;});
}

function DomainActionForm({token,capabilities,onFailure}:{token:string;capabilities:Capability[];onFailure:(error:unknown)=>void}) {
 const [operation,setOperation]=useState('credit-adjust');const [target,setTarget]=useState('');const [reason,setReason]=useState('');
 const [delta,setDelta]=useState('');const [amount,setAmount]=useState('');const [mode,setMode]=useState('full');
 const [expiryMode,setExpiryMode]=useState('');const [grantExpiry,setGrantExpiry]=useState('');const [creditHistory,setCreditHistory]=useState<State[]>([]);
 const [busy,setBusy]=useState(false);const [confirmed,setConfirmed]=useState(false);
 const [uncertain,setUncertain]=useState(false);
 const [preview,setPreview]=useState<{input:Record<string,unknown>;confirmationToken:string;before:State}|null>(null);
 const [last,setLast]=useState<{operation:string;operationId:string}|null>(null);const [result,setResult]=useState<Record<string,unknown>|null>(null);
 const capability=capabilities.find(item=>item.operation===operation);
 useEffect(()=>{setPreview(null);setConfirmed(false);},[operation,target,reason,delta,amount,mode,expiryMode,grantExpiry]);
 useEffect(()=>{setCreditHistory([]);},[target,operation]);
 async function loadHistory(){const response=await api(token,'/api/admin/credits/history?'+new URLSearchParams({subjectId:target}));setCreditHistory(safeRows(response.rows));}
 async function prepare(event:FormEvent){event.preventDefault();if(!capability?.enabled||busy||uncertain)return;setBusy(true);setResult(null);
  try{if(operation==='credit-adjust'&&Number(delta)>0&&(expiryMode===''||(expiryMode==='at'&&grantExpiry==='')))throw Error('지급 Lot 만료 정책을 직접 선택해 주세요.');
   const parameters=operation==='credit-adjust'?{delta:Number(delta),expiresAt:Number(delta)>0&&expiryMode==='at'?adminLocalDatetimeToUtcV1(grantExpiry):null}:operation==='refund'?{amountMinor:Number(amount),mode}:{};
   const input={operation,operationId:crypto.randomUUID(),targetRef:target,reason,parameters};const response=await api(token,'/api/admin/commands/preview',input);
   if(typeof response.confirmationToken!=='string'||response.preview===null||typeof response.preview!=='object')throw new Error('명령 확인 정보를 받지 못했습니다.');
   setPreview({input,confirmationToken:response.confirmationToken,before:safeRows([(response.preview as {before:unknown}).before])[0]!});setConfirmed(false);
  }catch(error){onFailure(error);}finally{setBusy(false);}
 }
 async function lookup(value:{operation:string;operationId:string}){const response=await api(token,'/api/admin/commands/result?'+new URLSearchParams(value).toString());setResult(response);setUncertain(!['succeeded','replayed','failed'].includes(String(response.status)));return response;}
 async function execute(){if(!preview||!confirmed||busy)return;setBusy(true);const value={operation,operationId:String(preview.input.operationId)};setLast(value);
  let receiptConfirmed=false;
  try{await api(token,'/api/admin/commands/execute',{input:preview.input,confirmationToken:preview.confirmationToken});const found=await lookup(value);receiptConfirmed=['succeeded','replayed','failed'].includes(String(found.status));setPreview(null);setConfirmed(false);if(operation==='credit-adjust')await loadHistory();}catch(error){if(!receiptConfirmed)setUncertain(true);onFailure(error);}finally{setBusy(false);}
 }
 return <section aria-label="크레딧 환불 계정 명령"><h3>크레딧·결제·계정 조치</h3>
  <label>조치 종류<select disabled={busy||uncertain} value={operation} onChange={e=>setOperation(e.target.value)}>{Object.entries(LABELS).filter(([key])=>key!=='presentation-save').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  {!capability?.enabled&&<p role="note">실행 차단: {capability?.blocker??'명령 권한 확인 중'}</p>}
  <form className="admin-login" onSubmit={prepare}><fieldset disabled={busy||uncertain||!capability?.enabled}>
   <label>{operation==='refund'?'영수증 UUID':'사용자 UUID'}<input required maxLength={36} value={target} onChange={e=>setTarget(e.target.value.trim())}/></label>
   {operation==='credit-adjust'&&<><label>보정 수량 (지급 + / 회수 -)<input type="number" required step={1} value={delta} onChange={e=>setDelta(e.target.value)}/></label><p>고정 수량 한도 {ADMIN_CREDIT_FIXED_LIMIT_V1===null?'없음':String(ADMIN_CREDIT_FIXED_LIMIT_V1)} · 매회 직접 확인 {ADMIN_CREDIT_CONFIRMATION_REQUIRED_V1?'필수':'정책 확인 필요'}. 기존 원장 integer 범위와 음수 잔액 금지는 유지합니다. 회수는 예약 중 수량을 제외한 현재 가용 Lot에서 처리합니다.</p>
    {Number(delta)>0&&<><label>지급 Lot 만료 정책<select required value={expiryMode} onChange={e=>setExpiryMode(e.target.value)}><option value="">직접 선택</option><option value="at">현지 시각 만료일 지정</option><option value="never">무기한</option></select></label>{expiryMode==='at'&&<label>지급 Lot 현지 시각 만료일<input type="datetime-local" required value={grantExpiry} onChange={e=>setGrantExpiry(e.target.value)}/></label>}</>}
   </>}
   {operation==='refund'&&<><label>환불 구분<select value={mode} onChange={e=>setMode(e.target.value)}><option value="full" disabled={!capability?.refundModes?.full}>전액{!capability?.refundModes?.full?' · 지원 미확인':''}</option><option value="partial" disabled={!capability?.refundModes?.partial}>부분{!capability?.refundModes?.partial?' · 지원 미확인':''}</option></select></label><label>환불 금액 (영수증 통화의 최소 단위)<input type="number" required min={1} step={1} value={amount} onChange={e=>setAmount(e.target.value)}/></label></>}
   <label>조치 사유<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><button type="submit">가능 여부·조치 전 상태 확인</button>
  </fieldset></form>
  {preview&&<div className="surface"><h4>실행 전 확인</h4><p>{LABELS[operation]} · 대상 {target} · 사유 {reason}</p>{operation==='credit-adjust'&&<p>수량 {delta} · {Number(delta)>0?'지급':'회수'}{Number(delta)>0?' · 만료 '+(expiryMode==='never'?'무기한':grantExpiry+' (브라우저 현지 시각)'):''}</p>}<dl>{Object.entries(preview.before).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value===null?'—':String(value)}</dd></div>)}</dl>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>대상·금액·사유와 조치 전 상태를 확인했습니다.</label><button type="button" disabled={busy||!confirmed||!capability?.enabled} onClick={()=>{void execute();}}>{uncertain?'같은 작업 재시도':'확인한 조치 실행'}</button></div>}
  {uncertain&&<p role="alert">실행 결과가 아직 확정되지 않았습니다. 새 작업 ID를 만들지 말고 아래의 같은 작업 결과를 재조회하거나, 확인된 동일 작업을 재시도해 주세요.</p>}
  {last&&<button type="button" disabled={busy} onClick={()=>{setBusy(true);void lookup(last).catch(onFailure).finally(()=>setBusy(false));}}>작업 {last.operationId} 결과 재조회</button>}
  {operation==='credit-adjust'&&<button type="button" disabled={busy||!capability?.enabled||!target} onClick={()=>{setBusy(true);void loadHistory().catch(onFailure).finally(()=>setBusy(false));}}>대상 사용자 크레딧 보정 이력 조회</button>}
  {result&&<div role="status"><p>실행 상태: {String(result.status)} · 결과 원장 재조회 완료</p>{result.state!==null&&typeof result.state==='object'&&<dl>{Object.entries(result.state).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value===null?'—':String(value)}</dd></div>)}</dl>}</div>}
  {creditHistory.length>0&&<div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>작업</th><th>수량</th><th>보정 전 가용</th><th>보정 후 가용</th><th>사유</th><th>시각</th></tr></thead><tbody>{creditHistory.map(row=><tr key={String(row.operationId)}><td>{String(row.operationId)}</td><td>{String(row.delta)}</td><td>{String(row.beforeAvailableCredits)}</td><td>{String(row.afterAvailableCredits)}</td><td>{String(row.reason)}</td><td>{String(row.changedAt)}</td></tr>)}</tbody></table></div>}
 </section>;
}

/** All real effects require the Owner's preview + explicit confirmation click.
 * No credit/refund/account command is activated without its domain binding. */
export function AdminOperatorConsole({token,onSessionExpired}:{readonly token:string;readonly onSessionExpired:()=>void}) {
 const [capabilities,setCapabilities]=useState<Capability[]>([]);
 const [entries,setEntries]=useState<State[]>([]);
 const [history,setHistory]=useState<State[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [revision,setRevision]=useState(0);
 const [form,setForm]=useState(FORM_EMPTY);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState<Record<string,unknown>|null>(null);
 const [preview,setPreview]=useState<{input:Record<string,unknown>;confirmationToken:string;before:State;expiresAt:string}|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [pendingOperationId,setPendingOperationId]=useState<string|null>(null);
 const enabled=capabilities.some(row=>row.operation==='presentation-save'&&row.enabled);
 function failed(error:unknown){if(error instanceof AdminAccessDeniedErrorV1){onSessionExpired();return;}setError(error instanceof Error?error.message:'관리자 작업을 완료할 수 없습니다.');}
 async function reload(){const data=await api(token,'/api/admin/presentations');setEntries(safeRows(data.rows));}
 useEffect(()=>{let active=true;void api(token,'/api/admin/commands/capabilities').then(data=>{
   if(!Array.isArray(data.capabilities))throw new Error('명령 권한 응답을 확인할 수 없습니다.');
   const rows=data.capabilities as Capability[];if(active)setCapabilities(rows);
   if(rows.some(row=>row.operation==='presentation-save'&&row.enabled))return api(token,'/api/admin/presentations').then(entries=>{if(active)setEntries(safeRows(entries.rows));});
 }).catch(error=>{if(active)failed(error);});return()=>{active=false;};},[token]);
 useEffect(()=>{setPreview(null);setConfirmed(false);},[form,selected,revision]);
 async function select(entry:State){setSelected(String(entry.entryId));setRevision(Number(entry.revision));
   setForm({kind:String(entry.kind),title:String(entry.title),body:String(entry.body),linkPath:entry.linkPath===null?'':String(entry.linkPath),status:String(entry.publicationStatus),startsAt:entry.startsAt===null?'':adminUtcToLocalDatetimeV1(String(entry.startsAt)),endsAt:entry.endsAt===null?'':adminUtcToLocalDatetimeV1(String(entry.endsAt)),reason:''});
   const data=await api(token,'/api/admin/presentations/history?entryId='+String(entry.entryId));setHistory(safeRows(data.rows));
 }
 async function prepare(event:FormEvent){event.preventDefault();if(busy||!enabled)return;setBusy(true);setError('');setResult(null);
   try{const input={operation:'presentation-save',operationId:crypto.randomUUID(),targetRef:selected??crypto.randomUUID(),reason:form.reason,
     parameters:{expectedRevision:revision,kind:form.kind,title:form.title,body:form.body,linkPath:form.linkPath||null,status:form.status,
       startsAt:form.startsAt===''?null:adminLocalDatetimeToUtcV1(form.startsAt),endsAt:form.endsAt===''?null:adminLocalDatetimeToUtcV1(form.endsAt)}};
     const data=await api(token,'/api/admin/commands/preview',input);
     if(typeof data.confirmationToken!=='string'||typeof data.expiresAt!=='string'||data.preview===null||typeof data.preview!=='object')throw new Error('확인 정보를 받지 못했습니다.');
     const before=safeRows([(data.preview as {before:unknown}).before])[0]!;
     setPreview({input,confirmationToken:data.confirmationToken,before,expiresAt:data.expiresAt});setConfirmed(false);
   }catch(error){failed(error);}finally{setBusy(false);}
 }
 async function lookup(operationId:string){const data=await api(token,'/api/admin/commands/result?operation=presentation-save&operationId='+operationId);setResult(data);await reload();return data;}
 async function execute(){if(!preview||!confirmed||busy)return;setBusy(true);setError('');const operationId=String(preview.input.operationId);setPendingOperationId(operationId);
   try{await api(token,'/api/admin/commands/execute',{input:preview.input,confirmationToken:preview.confirmationToken});
     const data=await lookup(operationId);if(data.status==='succeeded'||data.status==='replayed'){setPreview(null);setConfirmed(false);setPendingOperationId(null);
       const rows=safeRows([data.state]);if(rows[0])await select(rows[0]);}
   }catch(error){failed(error);}finally{setBusy(false);}
 }
 const field=(key:keyof typeof FORM_EMPTY,value:string)=>setForm(current=>({...current,[key]:value}));
 return <section className="surface operator-actions" aria-label="관리자 운영 명령">
  <div className="surface__head"><div><span className="section-kicker">OWNER COMMANDS</span><h2>관리자 운영 작업</h2></div><span className="neutral-tag">조치 전 확인·사유·감사</span></div>
  <div className="pending-list">{capabilities.map(item=><div className="operator-action" key={item.operation}><div><strong>{LABELS[item.operation]??item.operation}</strong><p>{item.enabled?'전용 도메인 명령 연결됨':item.blocker}</p></div><span className="neutral-tag">{item.enabled?'실행 경로 준비':'실행 차단'}</span></div>)}</div>
  {error&&<p role="alert" className="login-error">{error}</p>}
  <DomainActionForm token={token} capabilities={capabilities} onFailure={failed}/>
  {enabled&&<>
    <h3>공지·배너 관리</h3><p>공개 표현 정보만 관리합니다. 상품 가격·판매·캐릭터 정본은 변경하지 않습니다. 날짜 입력은 브라우저 현지 시각이며, 저장 시 UTC로 변환됩니다.</p>
    <div className="admin-tabs"><button type="button" disabled={busy} onClick={()=>{setSelected(null);setRevision(0);setForm(FORM_EMPTY);setHistory([]);}}>새 항목</button>
      {entries.map(entry=><button key={String(entry.entryId)} type="button" disabled={busy} onClick={()=>{void select(entry).catch(failed);}}>{String(entry.title)} · {String(entry.publicationStatus)} · v{String(entry.revision)}</button>)}</div>
    <form className="admin-login" onSubmit={prepare}>
      <label>구분<select value={form.kind} onChange={e=>field('kind',e.target.value)}><option value="notice">공지</option><option value="banner">배너</option></select></label>
      <label>제목<input required maxLength={160} value={form.title} onChange={e=>field('title',e.target.value)}/></label>
      <label>내용<textarea required maxLength={form.kind==='banner'?1000:5000} rows={5} value={form.body} onChange={e=>field('body',e.target.value)}/></label>
      <label>서비스 내부 이동 경로<input placeholder="/hall.html" maxLength={200} value={form.linkPath} onChange={e=>field('linkPath',e.target.value)}/></label>
      <label>게시 상태<select value={form.status} onChange={e=>field('status',e.target.value)}><option value="draft">비게시</option><option value="published">게시·예약</option></select></label>
      <label>현지 시각 노출 시작<input type="datetime-local" value={form.startsAt} onChange={e=>field('startsAt',e.target.value)}/></label>
      <label>현지 시각 노출 종료<input type="datetime-local" value={form.endsAt} onChange={e=>field('endsAt',e.target.value)}/></label>
      <label>변경 사유<input required maxLength={500} value={form.reason} onChange={e=>field('reason',e.target.value)}/></label>
      <button type="submit" disabled={busy}>{busy?'확인 중':'변경 전 상태 확인'}</button>
    </form>
    <article className="surface" aria-label="표현 정보 미리보기"><small>미리보기 · {form.status==='draft'?'비게시':'기간에 따라 게시'}</small><h3>{form.title||'제목'}</h3><p style={{whiteSpace:'pre-wrap'}}>{form.body||'내용'}</p>{form.linkPath&&<p>이동: {form.linkPath}</p>}</article>
    {preview&&<div className="surface" aria-label="운영 명령 확인"><h3>변경 확인</h3><p>현재 v{String(preview.before.revision??0)} → 저장 후 v{revision+1} · {form.status==='draft'?'비게시':'게시·예약'}</p><p>이전 제목: {String(preview.before.title??'신규')}</p><p>확인 유효 시각: {preview.expiresAt}</p>
      <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>변경 내용·노출 기간·사유를 확인했습니다.</label><button type="button" disabled={busy||!confirmed} onClick={()=>{void execute();}}>확인한 내용 저장</button></div>}
    {pendingOperationId&&<div role="status"><p>결과가 불확실하면 새 작업을 만들지 말고 같은 작업을 재조회하세요: {pendingOperationId}</p><button type="button" disabled={busy} onClick={()=>{setBusy(true);void lookup(pendingOperationId).catch(failed).finally(()=>setBusy(false));}}>실행 결과 재조회</button></div>}
    {result&&<p role="status">작업 {String(result.operationId)} · {String(result.status)} · 저장 결과 재조회 완료</p>}
    {history.length>0&&<div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>버전</th><th>제목</th><th>상태</th><th>사유</th><th>변경 시각</th></tr></thead><tbody>{history.map(row=><tr key={String(row.revision)}><td>{String(row.revision)}</td><td>{String(row.title)}</td><td>{String(row.publicationStatus)}</td><td>{String(row.reason)}</td><td>{String(row.changedAt)}</td></tr>)}</tbody></table></div>}
  </>}
 </section>;
}
