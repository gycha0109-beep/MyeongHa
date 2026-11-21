/** Render a private, research-only six-chapter DeepSeek draft. Does not call a model. */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [draftPath,templatePath,htmlPath,markdownPath]=process.argv.slice(2);
if(![draftPath,templatePath,htmlPath,markdownPath].every(Boolean))throw Error('USAGE: node render-yeoul-one-shot-reading.mjs DRAFT_JSON TEMPLATE_HTML OUTPUT_HTML OUTPUT_MD');
const input=JSON.parse(readFileSync(resolve(draftPath),'utf8'));
if(input.structurallyValid!==true||input.sourceKind!=='saju_engine_derived_research_only'||input.productionIssuance!==false||input.draft?.chapters?.length!==6||input.status!=='REVIEW_REQUIRED')throw Error('RESEARCH_DRAFT_NOT_VALIDATED');
const htmlEscape=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const canonical=s=>s.replace(/\s+/gu,' ').trim();
function paragraphs(body){
  const blocks=body.split(/\n\s*\n/u).map(x=>x.trim()).filter(Boolean);
  const result=[];
  for(const block of blocks){
    if(block.length<350){result.push(block);continue;}
    const sentences=block.split(/(?<=[.!?。])\s+/u).filter(Boolean);
    let current='';
    for(const sentence of sentences){
      if(current.length>=190){result.push(current);current='';}
      current+=(current?' ':'')+sentence;
    }
    if(current)result.push(current);
  }
  if(canonical(result.join(' '))!==canonical(body))throw Error('RENDER_REWRITES_SOURCE_TEXT');
  return result;
}
function quoteFor(body){
 const candidates=body.split(/(?<=[.!?。])\s+/u).map(s=>s.trim());
 return candidates.find(s=>s.length>=33&&s.length<=116&&/그런데|다만|오히려|그러니까|그래서|하지만|그러면|문제는|아깝|중요/.test(s))
 ?? candidates.find(s=>s.length>=30&&s.length<=116)??body.slice(0,110);
}
let html=readFileSync(resolve(templatePath),'utf8');
let replaced=0;
html=html.replace(/<section class="chapter" id="chapter-(\d)"[\s\S]*?<\/section>/g,(section,indexText)=>{
 const index=Number(indexText),c=input.draft.chapters[index-1];
 if(!c||c.index!==index||!section.includes(htmlEscape(c.title)))throw Error('CHAPTER_TEMPLATE_MISMATCH_'+index);
 const ps=paragraphs(c.body),content=ps.map((txt,n)=>'<p class="'+(n===0?'chapter-lead':'')+'">'+htmlEscape(txt).replaceAll('\n','<br>')+'</p>').join('\n');
 if(!section.includes('<div class="chapter-content">'))throw Error('CHAPTER_CONTENT_NOT_FOUND_'+index);
 let updated=section.replace(/(<div class="chapter-content">)[\s\S]*?(<\/div>)/,(_,a,b)=>a+content+b);
 updated=updated.replace(/(<aside class="pullquote">[\s\S]*?<p>)[\s\S]*?(<\/p>)/,(_,a,b)=>a+htmlEscape(quoteFor(c.body))+b);
 if(!updated.includes(htmlEscape(ps[0])))throw Error('RENDER_CONTENT_MISSING_'+index);
 replaced++;return updated;
});
if(replaced!==6)throw Error('NOT_SIX_CHAPTERS_REPLACED');
html=html.replace(/<title>[^<]*<\/title>/,'<title>여울 커리어 해설서 — DeepSeek 단일 생성 실험</title>');
html=html.replace(/<meta name="description" content="[^"]*">/,'<meta name="description" content="여울이 읽어주는 직업과 커리어 — DeepSeek 단독 연구용 해설서">');
html=html.replaceAll('실제 DeepSeek 생성 원문','이번 DeepSeek 단일 호출 원문');
html=html.replaceAll('이 자료는 연구용으로, 실제 개인의 미래를 확정하지 않습니다.','이 자료는 합성 명식 연구용으로, 실제 개인의 미래를 확정하지 않습니다.');
const chapters=input.draft.chapters;
const md='# 여울의 커리어 — DeepSeek 단일 생성 연구용\n\n> 합성 명식 32개 연구 근거 · 공식 발급/판매 대상 아님\n\n'
 +chapters.map(c=>'## '+c.index+'장. '+c.title+'\n\n'+c.body+'\n\n<!-- Evidence: '+c.evidenceIds.join(', ')+' -->').join('\n\n');
writeFileSync(resolve(htmlPath),html,{encoding:'utf8',flag:'wx'});
writeFileSync(resolve(markdownPath),md,{encoding:'utf8',flag:'wx'});
console.log(JSON.stringify({status:'HTML_RENDERED',chapters:replaced,characters:input.draft.bodyCharacters,cost:input.usage?.cost,html:resolve(htmlPath),markdown:resolve(markdownPath)}));
