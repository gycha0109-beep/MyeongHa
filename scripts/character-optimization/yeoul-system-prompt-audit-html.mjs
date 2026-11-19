/** Generate a source-exact, offline HTML audit of the old and revised Yeoul system prompts. */
import {writeFileSync} from 'node:fs';
import {buildFull as buildV2,cases} from './yeoul-identity-full-prompt-v2.mjs';
import {buildFull as buildV3} from './yeoul-identity-core-prompt-v3.mjs';

const buildAudit=(build,label,status)=>{
 const without=build('daily'), withRole=build('daily',{roleFrame:true});
 if(!withRole.system.endsWith(without.system))throw Error('ROLE_PREFIX_INTEGRITY');
 const role=withRole.system.slice(0,withRole.system.length-without.system.length);
 const coreMarker='[여울 핵심 성격·말투 / Bible·Runtime 원문 최우선 상시 앵커]';
 const basicMarker='[여울 B1 기본 정체성 / 최초 제시 / 원문]';
 const preamble=without.system.split(without.system.includes(coreMarker)?coreMarker:basicMarker)[0].trim();
 const start=without.system.indexOf(coreMarker);
 const end=without.system.indexOf(basicMarker);
 const core=start>=0&&end>start?without.system.slice(start+coreMarker.length,end).trim():null;
 return {label,status,withoutRole:without.system,withRole:withRole.system,
   role,preamble,core,identity:without.identity,
   sourceHashes:without.sourceHashes,shaNoRole:without.promptSha256,
   shaWithRole:withRole.promptSha256,
   lengthNoRole:without.system.length,lengthWithRole:withRole.system.length};
};
const versions={
 actual:buildAudit(buildV2,'실제 2026-11-19 GPT-6 Luna 호출 당시 지침','실제 전송됨 · GitHub Actions #44475277497'),
 revised:buildAudit(buildV3,'여울 핵심 성격을 최상단에 명시한 수정 지침','개발 검토용 · 실측 미실행')
};
if(!versions.revised.withRole.includes('신경 쓰는 건 다 티 나면서 본인만 아니라고 우기는 여자'))
 throw Error('CORE_NOT_IN_REVISED_SYSTEM');
if(versions.actual.core!==null||versions.revised.core===null)
 throw Error('OLD_VS_NEW_CORE_VISIBILITY');
if(versions.revised.identity!==versions.actual.identity)
 throw Error('IDENTITY_DRIFT');
const payload={versions,scenarios:cases.map(c=>({id:c.id,
 message:c.message,withoutRole:buildV2(c.id).user,
 roleFramed:buildV2(c.id,{roleFrame:true}).user})),
 reference:{run:'https://github.com/gycha0109-beep/MyeongHa/actions/runs/44475277497',
 originalCode:'https://github.com/gycha0109-beep/MyeongHa/blob/main/scripts/character-optimization/yeoul-identity-full-prompt-v2.mjs',
 bible:'https://github.com/gycha0109-beep/MyeongHa/blob/main/docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md',
 runtime:'https://github.com/gycha0109-beep/MyeongHa/blob/main/docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
 standard:'https://github.com/gycha0109-beep/MyeongHa/blob/main/docs/character/CHARACTER_RUNTIME_STANDARD_V1.md'}};
const data=JSON.stringify(payload).replace(/</gu,'\\u003c');
const css=':root{font-family:system-ui,-apple-system,Segoe UI,Noto Sans KR,sans-serif;color-scheme:dark;color:#e7edf7;background:#0e131e}*{box-sizing:border-box}body{margin:0}main{max-width:1240px;margin:auto;padding:32px 20px 90px}h1{font-size:clamp(26px,4vw,42px);line-height:1.25;margin:.4em 0}h2{font-size:19px;margin:0 0 14px}.sub{color:#aebbd0;line-height:1.7;max-width:950px}.eyebrow{color:#94baef;font-size:12px;font-weight:800;letter-spacing:.12em}.hero{padding-bottom:26px;border-bottom:1px solid #293446}.status{color:#f3c994;font-weight:650}.card{background:#161e2c;border:1px solid #2e3e54;border-radius:14px;padding:20px;margin:18px 0}.card.warn{background:#211c1c;border-color:#664d49}.meta{display:flex;gap:9px;flex-wrap:wrap;margin:15px 0}.tag{font-size:12px;border:1px solid #38516c;padding:5px 10px;border-radius:999px}.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0}button,select{background:#202d42;color:#e7f2ff;border:1px solid #426082;border-radius:8px;padding:10px 15px;font-size:14px;cursor:pointer}button.selected{background:#2d567d;border-color:#94bde8}button:hover{background:#365478}textarea,pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1220;color:#dce8f6;border:1px solid #304258;border-radius:10px;padding:18px;width:100%;font-size:13px;line-height:1.7;tab-size:2}textarea{resize:vertical;min-height:470px;font-family:ui-monospace,Consolas,monospace}pre{max-height:520px;overflow:auto}details{margin:14px 0;border:1px solid #304258;border-radius:10px;background:#121c2a;padding:14px}summary{cursor:pointer;font-weight:650}strong.accent{color:#ffc978}.diff{font-size:13px;color:#acc4e6}.refs a{color:#a3cafb;margin-right:12px}code{color:#b7dafa}.minititle{font-size:14px;color:#92aaca;text-transform:uppercase;letter-spacing:.07em}#diagnosis{font-weight:650;line-height:1.8}input[type=checkbox]{accent-color:#80b9f5}ul{line-height:1.8;color:#cfdaea}@media(max-width:600px){main{padding:17px 13px}.card{padding:14px}textarea,pre{font-size:12px;padding:12px}}';
const pieces=[
'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>여울 시스템 프롬프트 실물 감사 · 기존 vs 수정</title><style>',css,'</style></head><body><main>',
'<header class="hero"><div class="eyebrow">MYEONGHA · PROMPT AUDIT · SOURCE-EXACT</div><h1>여울 챗봇에 실제로 입력한<br>시스템 프롬프트 원문</h1>',
'<p class="sub">기존 GPT-6 Luna 실측에 실제로 사용한 지침과, 여울의 핵심 성격을 맨 앞에 명시한 수정 지침을 분리해 보여줍니다. <strong class="accent">원문 전체가 아래 HTML에 내장돼 있어 인터넷 연결 없이 확인할 수 있습니다.</strong></p>',
'<div class="meta"><span class="tag">기존: 실측 전송됨</span><span class="tag">수정: 아직 모델에 전송하지 않음</span><span class="tag">전체 Bible·Runtime·공통 Runtime Standard 포함</span><span class="tag">시나리오 8개 입력 확인</span></div></header>',
'<section class="card warn"><h2>무엇이 잘못됐나</h2><p id="diagnosis">기존 상위 역할 문장에는 여울의 핵심 성격이 직접 명시되지 않았습니다. Bible A1 등의 원문은 큰 참고 문서 안에 있었지만, 최상위 지시에서 성격·말투·유머를 직접 지정하는 지시가 빠졌습니다.</p>',
'<p class="sub">아래에서 <b>실제 전송본</b>과 <b>수정안</b>을 선택하십시오. 반드시 화면에 표시된 상태를 확인하십시오.</p></section>',
'<section class="card"><h2>지침 선택</h2><div class="bar"><button class="selected" data-version="actual">① 실제 전송한 기존 지침</button><button data-version="revised">② 핵심 성격을 맨 앞에 추가한 수정안</button></div>',
'<div class="bar"><label><input type="checkbox" id="withRole" checked> 명하 캐릭터 대화 API 역할 선언 포함</label></div>',
'<p class="status" id="status"></p><p class="diff" id="hashes"></p></section>',
'<section class="card"><h2>1. 최상단 직접 역할 선언 — 원문</h2><p class="sub">실제 시스템 프롬프트에서 가장 먼저 전달되는 지시 부분입니다.</p><pre id="role"></pre></section>',
'<section class="card"><h2>2. 공통 지시문 — 원문</h2><pre id="preamble"></pre></section>',
'<section class="card"><h2>3. 여울 핵심 성격·말투 상시 앵커</h2><p class="sub">수정본은 Bible A1·A4·B2·E1·E2, Runtime R1.1·R1.2·R6.1·R13.3의 문장을 원문으로 맨 앞에 재제시합니다. 기존 전송본은 이 별도의 상시 앵커가 없습니다.</p><pre id="core"></pre></section>',
'<section class="card"><h2>4. 기본 정체성 B1 — 원문</h2><pre id="identity"></pre></section>',
'<section class="card"><h2>5. <strong class="accent">전체 SYSTEM 메시지 — 글자 하나도 생략하지 않은 원문</strong></h2><p class="sub">여기에 전체 Bible·Runtime·공통 Runtime Standard 원문을 포함한 실제 SYSTEM 메시지 전부가 표시됩니다. 기존/수정안 전환이 가능합니다.</p>',
'<div class="bar"><button id="copy">현재 전체 SYSTEM 복사</button><button id="download">현재 SYSTEM .txt 저장</button><span id="length" class="diff"></span></div><textarea id="raw" readonly spellcheck="false"></textarea></section>',
'<section class="card"><h2>6. 실제 실험에서 USER 메시지에 전달한 입력 8개</h2><select id="case"></select><pre id="user"></pre><p class="sub">현재 버전에서 이 필드는 동일합니다. 운영의 실제 관계 이력과 사용자의 장기 메모리는 제공하지 않았습니다.</p></section>',
'<section class="card refs"><h2>근거 및 코드</h2>',
'<a href="https://github.com/gycha0109-beep/MyeongHa/actions/runs/44475277497" target="_blank">기존 실제 호출 로그</a>',
'<a href="https://github.com/gycha0109-beep/MyeongHa/blob/main/scripts/character-optimization/yeoul-identity-full-prompt-v2.mjs" target="_blank">기존 프롬프트 생성 코드</a>',
'<a href="https://github.com/gycha0109-beep/MyeongHa/blob/main/docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md" target="_blank">Character Bible 원본</a>',
'<a href="https://github.com/gycha0109-beep/MyeongHa/blob/main/docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md" target="_blank">Character Runtime 원본</a>',
'<a href="https://github.com/gycha0109-beep/MyeongHa/blob/main/docs/character/CHARACTER_RUNTIME_STANDARD_V1.md" target="_blank">Runtime 공통 규격</a></section>',
'<p class="sub">주의: 수정안은 프롬프트 조립 및 소스 무결성 검토용입니다. 수정 지침으로 새 대화를 생성하거나 응답 품질을 입증한 것은 아닙니다.</p>',
'<script type="application/json" id="prompt-data">',data,'</script>',
'<script>',
"const data=JSON.parse(document.getElementById('prompt-data').textContent); let version='actual'; const $=s=>document.querySelector(s);",
"function render(){const v=data.versions[version],role=$('#withRole').checked;document.querySelectorAll('[data-version]').forEach(b=>b.classList.toggle('selected',b.dataset.version===version));",
"$('#status').textContent=v.status;$('#hashes').textContent='SYSTEM SHA-256: '+(role?v.shaWithRole:v.shaNoRole)+' · 참조 문서 SHA-256: '+JSON.stringify(v.sourceHashes);",
"$('#role').textContent=role?v.role:'(역할 선언 제외 조건: 이 부분은 입력되지 않았습니다.)';$('#preamble').textContent=v.preamble;",
"$('#core').textContent=v.core||'(기존 실측 전송본에는 핵심 성격을 별도 최상단 원문 앵커로 지정하지 않았습니다. 다만 전체 Bible·Runtime 원문 안에는 해당 내용이 포함되어 있습니다.)';",
"$('#identity').textContent=v.identity;const sys=role?v.withRole:v.withoutRole;$('#raw').value=sys;$('#length').textContent=sys.length.toLocaleString()+'자 · 생략 없음';}",
"document.querySelectorAll('[data-version]').forEach(b=>b.addEventListener('click',()=>{version=b.dataset.version;render()}));$('#withRole').addEventListener('change',render);",
"$('#copy').addEventListener('click',async()=>{const t=$('#raw');try{await navigator.clipboard.writeText(t.value);$('#copy').textContent='복사 완료'}catch{t.select();document.execCommand('copy');$('#copy').textContent='선택/복사됨'}});",
"$('#download').addEventListener('click',()=>{const t=$('#raw').value;const u=URL.createObjectURL(new Blob([t],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='yeoul_'+version+'_SYSTEM_prompt.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)});",
"const selector=$('#case');for(const c of data.scenarios){const o=document.createElement('option');o.value=c.id;o.textContent=c.id+' · '+c.message;selector.appendChild(o)}",
"function renderCase(){const c=data.scenarios.find(x=>x.id===selector.value)||data.scenarios[0];$('#user').textContent=c.roleFramed}selector.addEventListener('change',renderCase);render();renderCase();",
'</script></main></body></html>'
];
const output='docs/character-optimization/YEOUL_SYSTEM_PROMPT_AUDIT_20261119.html';
writeFileSync(output,pieces.join('\n'),'utf8');
console.log(JSON.stringify({output,bytes:new TextEncoder().encode(pieces.join('\n')).length,
 rawActualChars:versions.actual.withRole.length,rawRevisedChars:versions.revised.withRole.length,
 revisedCoreChars:versions.revised.core.length}));
