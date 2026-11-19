import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const bible=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),'utf8');
const runtime=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
const cases=[
 {id:'care',message:'오늘 점심을 못 먹었어요.',relationship:'unknown',verifiedEvents:[]},
 {id:'false-memory',message:'전에 저 좋아한다고 했잖아요.',relationship:'unknown',verifiedEvents:[]},
 {id:'disagreement',message:'약속에 10분 늦는 건 별문제 아니라고 봐요.',relationship:'acquaintance',verifiedEvents:[]},
 {id:'boundary',message:'방금 말은 좀 무례하게 들렸어요.',relationship:'unknown',verifiedEvents:[]},
 {id:'daily',message:'오늘 김치찌개 먹었어요.',relationship:'unknown',verifiedEvents:[]},
 {id:'initiative',message:'아무 얘기나 해봐요.',relationship:'unknown',verifiedEvents:[]}
];
function extract(text,headings){
 const lines=text.split(/\r?\n/),out=[];
 for(const h of headings){
  const start=lines.findIndex(x=>x.trim().startsWith(h));
  if(start<0)throw Error('missing source heading '+h);
  const level=(lines[start].match(/^#+/)||[''])[0].length;
  let end=start+1;
  while(end<lines.length){const m=lines[end].match(/^(#+)\s/);if(m&&m[1].length<=level)break;end++;}
  out.push(lines.slice(start,Math.min(end,start+90)).join('\n'));
 }
 return out.join('\n\n');
}
const source=extract(runtime,['## R1.1 Always-On Core Anchor','## R2.4 User-Claim / False-Premise Handling','## R5.1 Preferred Actions','## R6.7 angry']);
const prompt=(c)=>({
 experiment:'GPT Luna Yeoul decision-first offline prompt package',
 mode:'gpt6_luna_api_request_preview',
 messages:[
 {role:'system',content:'아래는 명하 여울의 DRAFT 캐릭터 실험입니다. 제공된 캐릭터 원문을 근거로 사용자 입력을 먼저 해석하고, 여울의 입장/반응 목적을 내부적으로 결정한 뒤 여울의 실제 대사만 출력하세요. 판단 과정은 노출하지 마세요. 무조건 맞장구치거나 상담사처럼 위로하지 마세요. 없는 기억, 관계, 사주 사실을 발명하지 마세요. 감정과 호감은 관계 근거가 없으면 확정하지 마세요. 기본 존댓말을 지키고 츤데레 상투어를 반복하지 마세요. 이 문서는 운영 권한이 없는 DRAFT입니다.\n\n[여울 Runtime 발췌]\n'+source+'\n\n[원본 Bible 존재 확인]\n'+(bible.includes('말보다 행동')?'확인':'미확인')},
 {role:'user',content:JSON.stringify({userMessage:c.message,relationship:c.relationship,verifiedEvents:c.verifiedEvents,task:'여울로서 자연스럽게 대답. 대사만 출력.'})}
 ]
});
const output={model:'gpt-6-luna',sourceStatus:'DRAFT',cases:cases.map(c=>({id:c.id,...prompt(c)})),qualityStatus:'UNTESTED',paidCalls:0,apiTransport:'OpenAI Responses API',apiExecution:'DISABLED_NO_BUDGET_OR_APPROVAL'};
const target=process.argv[2];
if(target){writeFileSync(resolve(target),JSON.stringify(output,null,2)+'\n',{flag:'wx'});console.log('WROTE_OFFLINE_PROMPT_PACKAGE');}
else process.stdout.write(JSON.stringify(output,null,2)+'\n');
