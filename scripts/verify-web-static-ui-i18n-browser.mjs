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
  const pages=[['index.html','.landing-header'],['hall.html','.mhx-hero'],['reading.html','#saju-birth-form'],['face-reading.html','[data-face-camera]'],['chat-hub.html','.chat-hub-shell'],['chat.html','.conversation-chat-panel'],['auth.html','.auth-layout'],['birth.html','#birth-status'],['my.html','.my-page-shell'],['contact.html','.contact-shell'],['records.html','.records-shell'],['reading-detail.html','.reading-route-state']];
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

  // The same full-page Korean-leak scan must run for the English and Simplified
  // Chinese surfaces, not just Japanese and Traditional Chinese.
  for (const locale of ['en-US', 'zh-CN']) {
    await change(locale);
    for (const [file, selector] of pages) {
      await navigate(file, selector);
      const localized = await evaluate('(' + audit + ')()');
      if (localized.locale !== locale || localized.stored !== locale || localized.total || localized.attrTotal) {
        failures.push({ page: file, lang: locale, ...localized });
      }
    }
  }
  // A product-authored greeting is UI copy, not an AI reply. It must switch
  // languages on the existing chat page without altering any stored messages.
  for (const locale of ['ja-JP', 'zh-TW', 'en-US', 'zh-CN']) {
    await navigate('chat.html?character=seyeon', '.conversation-chat-panel');
    await change(locale);
    const greeting = await evaluate('(() => ({ text: document.querySelector("[data-dialogue-line]")?.textContent ?? "", lang: document.documentElement.lang }))()');
    if (greeting.lang !== locale || !greeting.text.trim() || /[가-힣]/u.test(greeting.text)) {
      failures.push({ page: 'chat.html', scenario: 'localized-fixed-character-greeting', locale, greeting });
    }
    await navigate('chat-hub.html', '.chat-hub-shell');
    const discovery = await evaluate('(() => ({ text: document.querySelector(".chat-person-card[data-character=seyeon] .chat-person-line")?.textContent ?? "", lang: document.documentElement.lang }))()');
    if (discovery.lang !== locale || !discovery.text.trim() || /[가-힣]/u.test(discovery.text)) {
      failures.push({ page: 'chat-hub.html', scenario: 'localized-fixed-character-discovery', locale, discovery });
    }
  }
  await change('zh-TW');
  await navigate('reading.html','#saju-birth-form');
  const chineseFields=await evaluate('(()=>({lang:document.documentElement.lang,male:document.querySelector("#saju-birth-sex option[value=male]")?.textContent}))()');
  if(chineseFields.lang!=='zh-TW'||chineseFields.male!=='男性')failures.push({page:'reading.html',chineseFields});
  await change('ko-KR');
  const ko=await evaluate('(()=>({lang:document.documentElement.lang,male:document.querySelector("#saju-birth-sex option[value=male]")?.textContent}))()');
  if(ko.lang!=='ko-KR'||ko.male!=='남성')failures.push({page:'reading.html',ko});
  await change('ja-JP');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const [file,selector] of pages.filter(([file])=>['index.html','hall.html','reading.html','face-reading.html','chat-hub.html','auth.html','my.html','contact.html'].includes(file))){
    await navigate(file,selector);
    const measure=await evaluate('(()=>({overflow:document.documentElement.scrollWidth-innerWidth,lang:document.documentElement.lang}))()');
    if(measure.overflow>3||measure.lang!=='ja-JP')failures.push({page:file,viewport:'390px',...measure});
  }
  await navigate('chat.html','.conversation-chat-panel');
  await evaluate('(()=>{const m=document.createElement("article");m.className="conversation-message";m.dataset.sender="user";m.textContent="사주";document.querySelector("[data-chat-stream]").append(m);const r=document.createElement("div");r.dataset.officialReading="";r.textContent="사주";document.body.append(r);})()');
  await sleep(150);
  const safe=await evaluate('(()=>({user:document.querySelector(".conversation-message[data-sender=user]")?.textContent,reading:document.querySelector("[data-official-reading]")?.textContent}))()');
  if(safe.user!=='사주'||safe.reading!=='사주')failures.push({page:'chat.html',safe});
  // I18N-07: the newly selectable UI locales must survive navigation without
  // reinterpreting recorded messages or official Reading content.
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const [locale,heading] of [['en-US','Saju'],['zh-CN','八字']]){
    await navigate('reading.html','#saju-birth-form');
    await change(locale);
    const selected=await evaluate('(()=>({lang:document.documentElement.lang,stored:localStorage.getItem("myeongha.ui.locale.v1"),picker:document.querySelector(".ui-locale-select")?.value,heading:document.querySelector(".gm-page-title")?.textContent.trim()}))()');
    if(selected.lang!==locale||selected.stored!==locale||selected.picker!==locale||selected.heading!==heading){
      failures.push({page:'reading.html',lang:locale,selected});
    }
    await navigate('hall.html','.mhx-hero');
    const restored=await evaluate('(()=>({lang:document.documentElement.lang,stored:localStorage.getItem("myeongha.ui.locale.v1"),picker:document.querySelector(".ui-locale-select")?.value}))()');
    if(restored.lang!==locale||restored.stored!==locale||restored.picker!==locale){
      failures.push({page:'hall.html',lang:locale,restored});
    }
    await navigate('chat.html','.conversation-chat-panel');
    await evaluate('(()=>{const m=document.createElement("article");m.className="conversation-message";m.dataset.sender="user";m.textContent="사주";document.querySelector("[data-chat-stream]").append(m);const r=document.createElement("div");r.dataset.officialReading="";r.textContent="사주";document.body.append(r);})()');
    await sleep(150);
    const source=await evaluate('(()=>({lang:document.documentElement.lang,user:document.querySelector(".conversation-message[data-sender=user]")?.textContent,reading:document.querySelector("[data-official-reading]")?.textContent}))()');
    if(source.lang!==locale||source.user!=='사주'||source.reading!=='사주'){
      failures.push({page:'chat.html',lang:locale,source});
    }
  }

  // React-owned My dashboard: changing the global locale must re-render all
  // card labels and asynchronous account state without reloading the page.
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('my.html','.my-page-shell');
  const expectedMy={
    'ko-KR':['마이페이지','계정 정보','캐릭터 메모리','구매 내역 · 내 이용권','설정 및 지원'],
    'ja-JP':['マイページ','アカウント情報','キャラクターのメモリー','購入履歴・利用券','設定・サポート'],
    'zh-TW':['我的頁面','帳號資訊','角色記憶','購買紀錄・我的使用券','設定與支援'],
    'en-US':['My Page','Account information','Character memory','Purchases and passes','Settings and support'],
    'zh-CN':['我的页面','账号信息','角色记忆','购买记录与我的使用券','设置与支持'],
  };
  const captureMy=()=>evaluate('(()=>({lang:document.documentElement.lang,stored:localStorage.getItem("myeongha.ui.locale.v1"),pending:document.documentElement.dataset.uiPending??null,headings:[document.querySelector(".my-title")?.textContent.trim(),document.querySelector(".my-account-copy strong")?.textContent.trim(),document.querySelector(".my-memory-copy h2")?.textContent.trim(),document.querySelector(".my-commerce-section h2")?.textContent.trim(),document.querySelector(".my-settings-section h2")?.textContent.trim()],account:document.querySelector(".my-account-meta")?.textContent.trim(),choices:[...document.querySelectorAll(".my-choice-copy strong")].map(x=>x.textContent.trim()),overflow:document.documentElement.scrollWidth-innerWidth,reactOwned:document.getElementById("my-react-root")?.hasAttribute("data-ui-react-owned")}))()');
  for(const locale of ['ja-JP','zh-TW','en-US','zh-CN','ko-KR','en-US']){
    await change(locale);
    const my=await captureMy();
    if(my.lang!==locale||my.stored!==locale||my.pending!==null||!my.reactOwned||
      JSON.stringify(my.headings)!==JSON.stringify(expectedMy[locale])||
      my.choices.length!==5||my.overflow>3||
      (locale!=='ko-KR'&&/[가-힣]/u.test(my.account??''))){
      failures.push({page:'my.html',scenario:'live-locale-toggle',locale,my});
    }
    // Opening a React-owned panel must never resurrect prior-locale text.
    await evaluate('document.querySelector(".my-account-card").click()');
    await sleep(90);
    const detail=await evaluate('(()=>({content:document.querySelector(".my-account-section .my-detail-panel")?.innerText??"",overflow:document.documentElement.scrollWidth-innerWidth}))()');
    if(!detail.content||detail.overflow>3||(locale!=='ko-KR'&&/[가-힣]/u.test(detail.content)))
      failures.push({page:'my.html',scenario:'account-detail',locale,detail});
    await evaluate('document.querySelector(".my-account-card").click()');
  }
  // Home discovery cards use the same canonical character name resolver as chat.
  // Verify live locale changes (no reload), image alt labels and card-only portrait zoom.
  await navigate('hall.html','.mhx-character-list');
  const expectedHomeNames={
    'ko-KR':['세연','백헌','여울'],
    'ja-JP':['セヨン','ベクホン','ヨウル'],
    'zh-TW':['Seyeon','Baekheon','Yeoul'],
    'en-US':['Seyeon','Baekheon','Yeoul'],
    'zh-CN':['Seyeon','Baekheon','Yeoul'],
  };
  for(const locale of ['en-US','zh-CN','ja-JP','zh-TW','ko-KR','en-US']){
    await change(locale);
    const home=await evaluate('(()=>({lang:document.documentElement.lang,names:[...document.querySelectorAll(".mhx-character-caption h3")].map(n=>n.textContent.trim()),alts:[...document.querySelectorAll(".mhx-character-art img")].map(n=>n.alt),keys:[...document.querySelectorAll(".mhx-character-art")].map(n=>n.dataset.character),frame:Object.fromEntries(["seyeon","yeoul"].map(id=>{const art=document.querySelector(".mhx-character-art[data-character="+id+"]");const img=art?.querySelector("img");return [id,img&&art?img.getBoundingClientRect().width/art.getBoundingClientRect().width:null]})),overflow:document.documentElement.scrollWidth-innerWidth}))()');
    if(home.lang!==locale ||
      JSON.stringify(home.names)!==JSON.stringify(expectedHomeNames[locale]) ||
      JSON.stringify(home.alts)!==JSON.stringify(expectedHomeNames[locale]) ||
      home.keys.join(',')!=='seyeon,baekheon,yeoul' ||
      Math.abs(home.frame.seyeon-.93)>.015 || Math.abs(home.frame.yeoul-.75)>.015 ||
      home.overflow>3){
      failures.push({page:'hall.html',scenario:'live-character-names-and-portrait-framing',locale,home});
    }
  }
  console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',pages:pages.length,failures},null,2));
  assert(!failures.length,'Untranslated or invalid static UI across locales');
}finally{
  socket?.close();
  if(chrome.exitCode===null)chrome.kill('SIGTERM');
  await sleep(300);
  await new Promise(done=>server.close(done));
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
