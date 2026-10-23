// Real Chrome browser smoke against deployed Cloudflare Preview, using DevTools.
// No logins, account changes, Cloudflare credentials, or production URLs.
// Watchtower-Track: ops
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.MYEONGHA_CLOUDFLARE_PREVIEW_URL ||
  'https://feat-ops-cloudflare-static-preview-20261020-myeongha.gycha0109.workers.dev';
const base = new URL(origin);
if (base.protocol !== 'https:' || !base.hostname.endsWith('.workers.dev') ||
  base.pathname !== '/' || base.search || base.hash) throw Error('Unsafe preview origin');

const pages = [
  ['index.html','.landing-header'],
  ['hall.html','.gm-home-hero'],
  ['auth.html','.auth-layout'],
  ['birth.html','#birth-status'],
  ['chat-hub.html','.chat-hub-shell'],
  ['chat.html','.conversation-chat-panel'],
  ['my.html','.my-page-shell'],
  ['reading.html','#saju-birth-form'],
  ['face-reading.html','[data-face-camera]'],
  ['reading-detail.html','.reading-route-state'],
  ['records.html','.records-shell'],
];
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const assert = (v,msg) => { if(!v) throw Error(msg); };
const profile = await mkdtemp(join(tmpdir(),'myeongha-cloudflare-remote-'));
const chrome = spawn(
  process.env.CHROME_BIN || process.env.CHROME_PATH || 'chromium',
  ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
   '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
  {stdio:['ignore','ignore','pipe']},
);
let errors = '';
chrome.stderr.on('data',part=>{errors = (errors + String(part)).slice(-3000);});
let socket;
try {
  let port;
  for (let i=0;i<160;i++) {
    if (chrome.exitCode !== null) throw Error('Chrome exited: '+errors);
    try { port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/u)[0]); }
    catch {}
    if(port) break;
    await sleep(80);
  }
  assert(port,'Chrome DevTools port unavailable');
  const tabResponse = await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'});
  assert(tabResponse.ok,'Cannot open Chrome DevTools tab');
  const tab = await tabResponse.json();
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  let serial=0;
  const pending=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    const work=pending.get(message.id);
    if(!work) return;
    pending.delete(message.id);
    if(message.error) work.reject(Error(message.error.message));
    else work.resolve(message.result||{});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++serial;
    pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result?.value;
  };
  await Promise.all([send('Runtime.enable'),send('Page.enable')]);
  await send('Emulation.setDeviceMetricsOverride',{
    width:1280,height:850,deviceScaleFactor:1,mobile:false,
  });
  const failures=[];
  for(const [file,selector] of pages) {
    const url=new URL('/'+file,base).href;
    try {
      const navigation=await send('Page.navigate',{url});
      assert(!navigation.errorText,'Navigation error '+navigation.errorText);
      let found=false;
      for(let i=0;i<110;i++){
        const state=await evaluate('(()=>({ready:document.readyState,selector:!!document.querySelector('+JSON.stringify(selector)+'),url:location.href,text:document.body?.innerText?.trim().length||0}))()');
        if(state.ready==='complete' && state.selector && state.url===url && state.text>10) {found=true;break;}
        await sleep(125);
      }
      assert(found,'Document or expected semantic shell not ready after 13.75s');
    } catch(error) {
      failures.push({file,reason:String(error)});
    }
  }
  console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',browser:'Chrome DevTools',
    origin:base.origin,checked:pages.length,failures},null,2));
  assert(!failures.length,'Cloudflare preview live browser rendering failed');
} finally {
  socket?.close();
  if (chrome.exitCode === null) {
    // Windows keeps Chrome's profile dictionaries locked until the browser
    // process exits. Wait for that exit before attempting a recursive delete.
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(3_000)]);
  }
  await sleep(350);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:250});
      break;
    } catch (error) {
      if (!['EBUSY','EPERM','ENOTEMPTY'].includes(error?.code) || attempt === 5) throw error;
      await sleep((attempt + 1) * 400);
    }
  }
}
