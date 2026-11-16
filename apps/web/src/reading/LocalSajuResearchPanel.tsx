import { useEffect, useRef, useState } from 'react';
import { getActiveBearer, PRODUCT_AUTH_STORAGE_V1 } from '../../product-auth.js';
import { isBrowserSajuPreviewDeliveryV1 } from '../../saju-preview-response-admission.js';
import { SAJU_READING_COMPONENTS_V1, type ApprovedSajuOfferV1 } from '../../../../packages/contracts/src/approved-saju-catalog.js';

type Section = { title: string; text: string };
type Slice = { key: string; title: string; status: 'ready' | 'partial' | 'pending'; sections: Section[] };
const LIVE_PREVIEWS = new Set(['career', 'business', 'wealth', 'relationship']);
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function textBlocks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((b): string[] => {
    const v = record(b); if (!v) return [];
    if (v.type === 'paragraph' || v.type === 'source_hint') return typeof v.text === 'string' ? [v.text] : [];
    if (v.type === 'key_points' && Array.isArray(v.items)) return v.items.filter((x): x is string => typeof x === 'string');
    if (v.type === 'comparison' && Array.isArray(v.perspectives)) return v.perspectives.map(x => record(x)?.text).filter((x): x is string => typeof x === 'string');
    if (v.type === 'timeline' && Array.isArray(v.entries)) return v.entries.map(x => record(x)?.text).filter((x): x is string => typeof x === 'string');
    return [];
  });
}
function sourceSections(value: unknown): Section[] {
  return Array.isArray(value) ? value.flatMap((s): Section[] => {
    const section=record(s); if(!section) return [];
    const parts=textBlocks(section.blocks).filter(Boolean);
    return parts.length ? [{ title: typeof section.title === 'string' ? section.title : '풀이', text: parts.join('\n\n') }] : [];
  }) : [];
}
async function post(path: string, token: string, body: unknown): Promise<unknown> {
  const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token},
    body:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);
  if(!response.ok || record(data)?.ok!==true) throw new Error('로컬 풀이 서버의 응답을 확인하지 못했습니다.');
  return data;
}
async function readSlices(offer: ApprovedSajuOfferV1, token: string, targetBirth?: Record<string, unknown>): Promise<Slice[]> {
  const output: Slice[] = [];
  let temporal: Record<string, unknown> | null = null;
  for(const component of offer.components){
    const title=SAJU_READING_COMPONENTS_V1[component].text;
    if(LIVE_PREVIEWS.has(component)){
      try {
        const payload=await post('/api/me/saju/preview-reading',token,{readingText:title});
        if(!isBrowserSajuPreviewDeliveryV1(payload))throw new Error('검증되지 않은 풀이 응답');
        const reading=record(record(record(payload)?.data)?.reading);
        const sections=sourceSections(record(reading?.reading)?.sections);
        output.push({key:component,title,status:sections.length?'ready':'partial',sections:sections.length?sections:[{title:'풀이 제한',text:'현재 근거로 제공 가능한 본문이 없습니다.'}]});
      }catch {
        output.push({key:component,title,status:'pending',sections:[{title:'풀이 연결 대기',text:'현재 로컬 검증된 미리보기를 불러오지 못했습니다.'}]});
      }
      continue;
    }
    if(component==='year'||component==='month'){
      try{
        temporal ??= record(await post('/api/me/saju/local-research',token,{kind:'annual_monthly'}));
        const part=record(temporal?.[component==='year'?'annual':'monthly']);
        const sections=Array.isArray(part?.sections)?part.sections.flatMap((s):Section[]=>{
          const x=record(s);return x&&typeof x.text==='string'?[{title:String(x.title??title),text:x.text}]:[];
        }):[];
        output.push({key:component,title,status:'partial',sections:sections.length?sections:[{title:'연구 계산만 확인됨',text:String(part?.status??'정식 연·월 해석은 아직 승인되지 않았습니다.')}]});
      }catch{
        output.push({key:component,title,status:'pending',sections:[{title:'연·월 연구 계산 대기',text:'연·월 공식 풀이 발급은 아직 제공되지 않습니다.'}]});
      }
      continue;
    }
    if(component==='compatibility'){
      if(!targetBirth){output.push({key:component,title,status:'pending',sections:[{title:'상대방 정보 필요',text:'상대방의 동의를 받은 출생정보를 아래에 입력하면 두 사람의 명식 계산 사실을 나란히 확인합니다.'}]});continue;}
      try{
        const result=record(await post('/api/me/saju/local-research',token,{kind:'compatibility',targetBirth,consent:true}));
        const pillars=(key:'subject'|'counterpart')=>Array.isArray(result?.[key])?result[key].flatMap((v):string[]=>{
          const x=record(v);return x?.status==='resolved'?[String(x.label??'')+' '+String(x.stemHanja??'')+String(x.branchHanja??'')]:[];
        }).join(' · '):'';
        output.push({key:component,title,status:'partial',sections:[
          {title:'내 명식의 네 기둥',text:pillars('subject')},{title:'상대방 명식의 네 기둥',text:pillars('counterpart')},
          {title:'현재 해석 범위',text:'두 사람의 명식 계산 사실만 비교합니다. 궁합 점수·결혼 여부·공식 관계 해석은 생성하지 않습니다.'},
        ]});
      }catch{
        output.push({key:component,title,status:'pending',sections:[{title:'비교 계산 대기',text:'입력값을 확인해 주세요. 현재 정식 궁합 보고서는 발급되지 않습니다.'}]});
      }
    }
  }
  return output;
}
export function LocalSajuResearchPanel({offer,onClose}:{offer:ApprovedSajuOfferV1;onClose:()=>void}) {
  const [items,setItems]=useState<Slice[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [date,setDate]=useState('');
  const [time,setTime]=useState('');
  const [sex,setSex]=useState('unspecified');
  const [consent,setConsent]=useState(false);
  const job=useRef(0);
  const pairRequired=offer.components.includes('compatibility');
  async function run(target?:Record<string,unknown>){
    const id=++job.current;setBusy(true);setMessage('기존 사주 엔진에서 계산 중입니다…');setItems([]);
    try{
      const identity=await getActiveBearer();
      if(!identity)throw new Error('먼저 내 사주를 등록해 주세요.');
      const next=await readSlices(offer,identity.token,target);
      if(id!==job.current)return;
      setItems(next);setMessage(next.some(x=>x.status==='pending')?'일부 항목은 추가 정보 또는 공식 발급 승인이 필요합니다.':'로컬 결과를 확인했습니다.');
    }catch(e){if(id===job.current)setMessage(e instanceof Error?e.message:'결과를 불러오지 못했습니다.');}
    finally{if(id===job.current)setBusy(false);}
  }
  useEffect(()=>{
    setDate('');setTime('');setSex('unspecified');setConsent(false);
    void run();
    return ()=>{job.current++};
  },[offer.id]);
  useEffect(()=>{
    const clear=()=>{job.current++;setItems([]);setMessage('계정이 변경되었습니다. 다시 결과를 조회해 주세요.');setBusy(false);};
    window.addEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent,clear);
    return ()=>window.removeEventListener(PRODUCT_AUTH_STORAGE_V1.changedEvent,clear);
  },[]);
  function requestPair(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!consent||!date)return;
    const target={calendarType:'solar',birthDate:date,birthTime:time||null,timeKnown:!!time,isLeapMonth:false,sex};
    void run(target);
  }
  return <section className="saju-local-research" id="saju-local-research" aria-live="polite">
    <div className="saju-local-research-head">
      <div><small>LOCAL RESEARCH / 실제 사주 엔진 연결</small><h3>{offer.title}</h3></div>
      <button type="button" onClick={onClose} aria-label="로컬 연구 결과 닫기">닫기</button>
    </div>
    <p className="saju-local-research-warning">로컬 개발자 전용 시연입니다. 정식 상품 발급·결제·구매권·공식 궁합 해석이 아닙니다. 연구 결과는 저장되지 않습니다.</p>
    <p className="saju-local-research-status">{message}</p>
    <div className="saju-local-research-sections">
      {items.map((item)=><article key={item.key} className="saju-local-research-slice">
        <h4>{item.title}<small>{item.status==='ready'?' 실제 미리보기':item.status==='partial'?' 연구용 근거':' 미연결'}</small></h4>
        {item.sections.map((section,i)=><section key={item.key+'-'+i}><h5>{section.title}</h5><p>{section.text}</p></section>)}
      </article>)}
    </div>
    {pairRequired&&<form className="saju-local-research-pair" onSubmit={requestPair}>
      <h4>상대방 명식 계산 (연구용)</h4>
      <p>상대방에게 이 용도의 사용 동의를 받은 경우에만 입력해 주세요. 출생정보는 로컬 계산 후 저장하지 않습니다.</p>
      <div className="saju-local-research-pair-fields">
        <label>상대방 생년월일 (양력)<input type="date" min="1800-01-01" max="2300-12-31" value={date} onChange={e=>setDate(e.target.value)} required /></label>
        <label>출생시간 (선택)<input type="time" value={time} onChange={e=>setTime(e.target.value)} /></label>
        <label>성별 (선택)<select value={sex} onChange={e=>setSex(e.target.value)}>
          <option value="unspecified">선택하지 않음</option><option value="male">남성</option><option value="female">여성</option>
        </select></label>
      </div>
      <label className="saju-local-research-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /> 상대방에게 명식 계산에 대한 동의를 받았습니다.</label>
      <button type="submit" disabled={busy||!date||!consent}>두 사람 명식 계산</button>
    </form>}
    <div className="saju-local-research-actions">
      <button type="button" disabled={busy} onClick={()=>void run()}>현재 정보로 다시 조회</button>
      <button type="button" onClick={onClose}>결과 닫기</button>
    </div>
  </section>;
}
