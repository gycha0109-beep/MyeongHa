import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const root=resolve(process.cwd(),process.env.MYEONGHA_WEB_OUTPUT_DIR??'public');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const assert=(value,message)=>{if(!value)throw Error(message);};
const mime=new Map([['.html','text/html'],['.js','text/javascript'],['.css','text/css'],['.svg','image/svg+xml'],['.json','application/json'],['.png','image/png'],['.webp','image/webp'],['.jpg','image/jpeg']]);
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url??'/','http://127.0.0.1').pathname);
    const file=resolve(root,pathname.slice(1));
    if(!file.startsWith(root+sep)||!(await stat(file)).isFile())throw Error('not found');
    res.setHeader('Content-Type',(mime.get(extname(file))??'application/octet-stream')+'; charset=utf-8');
    createReadStream(file).pipe(res);
  }catch{res.statusCode=404;res.end('Not Found');}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin='http://127.0.0.1:'+server.address().port;
const profile=await mkdtemp(join(tmpdir(),'myeongha-ui-locale-'));
const chrome=spawn(process.env.CHROME_BIN??process.env.CHROME_PATH??'chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';
chrome.stderr.on('data',x=>{stderr+=String(x).slice(-1000);});
let socket=null;
try{
  let port=0;
  for(let i=0;i<160;i++){if(chrome.exitCode!==null)throw Error('Chrome stopped: '+stderr);try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/u)[0]);}catch{}if(port)break;await sleep(50);}
  assert(port,'Chrome DevTools unavailable');
  const response=await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'});
  assert(response.ok,'DevTools tab creation failed');
  const target=await response.json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done,reject)=>{socket.addEventListener('open',done,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(!pending.has(msg.id))return;const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(Error(msg.error.message));else p.resolve(msg.result??{});});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.text);return value.result?.value;};
  await Promise.all([send('Runtime.enable'),send('Page.enable')]);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const pages=[['index.html','.landing-header'],['hall.html','.mhx-hero'],['reading.html','#saju-birth-form'],['face-reading.html','[data-face-camera]'],['chat-hub.html','.chat-hub-shell'],['chat.html','.conversation-chat-panel'],['auth.html','.auth-layout'],['birth.html','#birth-status'],['my.html','.my-page-shell'],['records.html','.records-shell'],['reading-detail.html','.reading-route-state']];
  async function navigate(page,selector){
    const r=await send('Page.navigate',{url:origin+'/'+page});assert(!r.errorText,'Navigation failed '+page);
    let ready=false;
    for(let i=0;i<100;i++){
      ready=await evaluate('document.readyState==="complete" && !!document.querySelector('+JSON.stringify(selector)+') && !!document.querySelector("[data-ui-locale-picker]")');
      if(ready)break;
      await sleep(100);
    }
    assert(ready,'Page not ready '+page);
    await sleep(600);
  }
  async function change(locale){
    const ok=await evaluate('(()=>{const s=document.querySelector(".ui-locale-select");s.value='+JSON.stringify(locale)+';s.dispatchEvent(new Event("change",{bubbles:true}));return s.value==='+JSON.stringify(locale)+';})()');
    assert(ok,'Cannot choose locale '+locale);
    await sleep(200);
  }
  const audit=(()=>{
    const remaining=[];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      const el=node.parentElement;
      if(!el||el.closest('script,style,textarea,pre,code,svg,[contenteditable],[data-official-reading],[data-reading-content],.conversation-message-stream .conversation-message:not([data-chat-intro]),[data-reader-comment],[data-reading-step-body],[data-reading-structure-body]'))continue;
      const value=(node.nodeValue??'').trim();
      if(!/[가-힣]/u.test(value)||value.length===1)continue;
      if(el.closest('.landing-agent-initial'))continue;
      const box=el.getBoundingClientRect();
      if(!box.width||!box.height)continue;
      const style=getComputedStyle(el);
      if(style.display==='none'||style.visibility==='hidden')continue;
      remaining.push({tag:el.tagName,cls:typeof el.className==='string'?el.className.slice(0,70):'',value:value.slice(0,140)});
    }
    const attrs=[];
    for(const el of document.querySelectorAll('[placeholder],[aria-label],[title],option')){
      if(el.matches('.ui-locale-picker option')) continue;
      const label=el.getAttribute('placeholder')||el.getAttribute('aria-label')||el.getAttribute('title')||(el.tagName==='OPTION'?el.textContent:'')||'';
      if(/[가-힣]/u.test(label)&&label.length>1)attrs.push({tag:el.tagName,value:label.slice(0,140)});
    }
    return {locale:document.documentElement.lang,stored:localStorage.getItem('myeongha.ui.locale.v1'),remaining:remaining.slice(0,55),attrs:attrs.slice(0,45),total:remaining.length,attrTotal:attrs.length};
  }).toString();
  const failures=[];
  for(const [page,selector] of pages){
    await navigate(page,selector);
    if(page==='index.html')await change('ja-JP');
    const result=await evaluate('('+audit+')()');
    if(result.locale!=='ja-JP'||result.stored!=='ja-JP'||result.total||result.attrTotal)failures.push({page,lang:'ja-JP',...result});
    if(page==='reading.html'){
      const fields=await evaluate('(()=>({type:document.querySelector("#saju-birth-time")?.type,male:document.querySelector("#saju-birth-sex option[value=male]")?.textContent}))()');
      if(fields.type!=='text'||fields.male!=='男性')failures.push({page,fields});
    }
    if(page==='birth.html'){
      const fields=await evaluate('(()=>({type:document.querySelector("#birth-time")?.type,male:document.querySelector("#birth-sex option[value=male]")?.textContent}))()');
      if(fields.type!=='text'||fields.male!=='男性')failures.push({page,fields});
    }
  }
  await navigate('auth.html','.auth-layout');
  await change('zh-TW');
  const zh=await evaluate('('+audit+')()');
  if(zh.locale!=='zh-TW'||zh.total||zh.attrTotal)failures.push({page:'auth.html',lang:'zh-TW',...zh});
  for(const [file,selector] of pages){
    await navigate(file,selector);
    const result=await evaluate('('+audit+')()');
    if(result.locale!=='zh-TW'||result.stored!=='zh-TW'||result.total||result.attrTotal)failures.push({page:file,lang:'zh-TW',...result});
  }
  await navigate('reading.html','#saju-birth-form');
  const chineseFields=await evaluate('(()=>({lang:document.documentElement.lang,male:document.querySelector("#saju-birth-sex option[value=male]")?.textContent}))()');
  if(chineseFields.lang!=='zh-TW'||chineseFields.male!=='男性')failures.push({page:'reading.html',chineseFields});
  await change('ko-KR');
  const ko=await evaluate('(()=>({lang:document.documentElement.lang,male:document.querySelector("#saju-birth-sex option[value=male]")?.textContent}))()');
  if(ko.lang!=='ko-KR'||ko.male!=='남성')failures.push({page:'reading.html',ko});
  await change('ja-JP');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const [file,selector] of pages.filter(([file])=>['index.html','hall.html','reading.html','face-reading.html','chat-hub.html','auth.html','my.html'].includes(file))){
    await navigate(file,selector);
    const measure=await evaluate('(()=>({overflow:document.documentElement.scrollWidth-innerWidth,lang:document.documentElement.lang}))()');
    if(measure.overflow>3||measure.lang!=='ja-JP')failures.push({page:file,viewport:'390px',...measure});
  }
  await navigate('chat.html','.conversation-chat-panel');
  await evaluate('(()=>{const m=document.createElement("article");m.className="conversation-message";m.dataset.sender="user";m.textContent="사주";document.querySelector("[data-chat-stream]").append(m);const r=document.createElement("div");r.dataset.officialReading="";r.textContent="사주";document.body.append(r);})()');
  await sleep(150);
  const safe=await evaluate('(()=>({user:document.querySelector(".conversation-message[data-sender=user]")?.textContent,reading:document.querySelector("[data-official-reading]")?.textContent}))()');
  if(safe.user!=='사주'||safe.reading!=='사주')failures.push({page:'chat.html',safe});
  console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',pages:pages.length,failures},null,2));
  assert(!failures.length,'Untranslated or invalid static UI across locales');
}finally{
  socket?.close();
  if(chrome.exitCode===null)chrome.kill('SIGTERM');
  await sleep(300);
  await new Promise(done=>server.close(done));
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
