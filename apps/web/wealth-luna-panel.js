const LUNA_VERSION='myeongha-official-wealth-luna-reader-v1';
const MODEL='gpt-6-luna';
const HASH=/^[0-9a-f]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseVerifiedWealthLunaNarrationV1(candidate,readingId) {
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate)||
      candidate.version!==LUNA_VERSION||
      candidate.readingId!==readingId||!UUID.test(readingId)||
      candidate.model!==MODEL||candidate.renderer!=='source_bound_model_supplement'||
      candidate.originalReadingUnchanged!==true||!HASH.test(candidate.sourceHash)||
      !Array.isArray(candidate.chapters)||candidate.chapters.length<2||candidate.chapters.length>7) {
    throw new TypeError('Luna official Wealth supplementary response is invalid');
  }
  const chapters=candidate.chapters.map((chapter,index)=>{
    if(!chapter||typeof chapter!=='object'||Array.isArray(chapter)||
        chapter.index!==index||typeof chapter.title!=='string'||!chapter.title.trim()||
        typeof chapter.sourceAnchor!=='string'||chapter.sourceAnchor.length<12||
        !Array.isArray(chapter.paragraphs)||chapter.paragraphs.length<2||chapter.paragraphs.length>4||
        !chapter.paragraphs.every(p=>typeof p==='string'&&p.trim().length>=80&&p.length<=1300)||
        !chapter.paragraphs.some(p=>p.includes(chapter.sourceAnchor))) {
      throw new TypeError('Luna Wealth chapter is malformed');
    }
    return Object.freeze({index,title:chapter.title,
      paragraphs:Object.freeze([...chapter.paragraphs])});
  });
  return Object.freeze({readingId,sourceHash:candidate.sourceHash,chapters:Object.freeze(chapters)});
}
function create(tag,cls,text){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
}
/** Only mount on an owner-verified, purchased immutable Wealth Reading.
 * This panel never changes the report or claims to be its signed source. */
export function mountVerifiedWealthLunaPanelV1(panel,record,resolveBearer,isCurrent,fetchImpl=fetch){
  if(!panel||record?.approvedComponent!=='wealth'||
     record?.sajuDomain!=='wealth'||record?.productResponseState!=='delivered'||
     record?.wealthLunaAvailable!==true||
     record?.readerCharacterIds?.length!==1||record.readerCharacterIds[0]!=='taegyeom') return ()=>{};
  const load=panel.querySelector('[data-wealth-luna-load]');
  const status=panel.querySelector('[data-wealth-luna-status]');
  const chapters=panel.querySelector('[data-wealth-luna-chapters]');
  if(!load||!status||!chapters)return ()=>{};
  const controller=new AbortController();
  let disposed=false, inFlight=false, completed=false;
  panel.hidden=false;
  const handler=async()=>{
    if(disposed||inFlight||completed||!isCurrent())return;
    inFlight=true;
    load.disabled=true;
    status.textContent='저장된 공식 보고서의 근거를 확인하고 있습니다.';
    try{
      const bearer=await resolveBearer();
      if(!bearer||bearer.kind!=='member'||!isCurrent())throw new Error('session');
      const endpoint=new URL('/api/readings',window.location.origin);
      endpoint.searchParams.set('readingId',record.readingId);
      const response=await fetchImpl(endpoint,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        signal:controller.signal,
        headers:{
          Accept:'application/json',
          'Content-Type':'application/json',
          Authorization:'Bearer '+bearer.token,
        },
        body:'{}',
      });
      if(!response.ok)throw new Error('unavailable');
      const payload=await response.json();
      if(disposed||!isCurrent())return;
      if(payload?.ok!==true)throw new Error('invalid');
      const narrative=parseVerifiedWealthLunaNarrationV1(payload.data,record.readingId);
      const fragment=document.createDocumentFragment();
      narrative.chapters.forEach(chapter=>{
        const section=create('section','official-report-luna-chapter');
        section.append(
          create('span','official-report-luna-chapter-index',String(chapter.index+1).padStart(2,'0')),
          create('h3','',chapter.title),
        );
        for(const paragraph of chapter.paragraphs){
          const node=create('p','official-report-luna-paragraph',paragraph);
          node.dataset.officialReading='';
          section.append(node);
        }
        fragment.append(section);
      });
      chapters.replaceChildren(fragment);
      status.textContent='태겸의 보충 해설입니다. 위 공식 원문과 별도로 표시됩니다.';
      completed=true;
      load.hidden=true;
    }catch{
      if(!disposed&&isCurrent()&&!controller.signal.aborted){
        status.textContent='심층 해설을 열지 못했습니다. 기존 공식 보고서는 그대로 보관됩니다.';
        load.disabled=false;
      }
    }finally{
      inFlight=false;
      if(!completed&&!disposed)load.disabled=false;
    }
  };
  load.addEventListener('click',handler);
  return ()=>{
    disposed=true;
    controller.abort();
    load.removeEventListener('click',handler);
    chapters.replaceChildren();
    status.textContent='';
    load.hidden=false;
    load.disabled=false;
    panel.hidden=true;
  };
}
