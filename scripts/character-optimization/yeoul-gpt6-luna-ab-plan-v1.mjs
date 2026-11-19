/** Offline, no-billing construction of GPT-6 Luna decision -> dialogue requests. */
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
const bible=readFileSync(resolve(root,'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),'utf8');
const section=(text,a,b)=>{
 const start=text.indexOf(a);
 if(start<0)throw Error('MISSING_CHARACTER_SOURCE_'+a);
 const end=b?text.indexOf(b,start+a.length):-1;
 return text.slice(start,end<0?undefined:end).trim();
};
const identity=section(runtime,'## R1.1 Always-On Core Anchor','## R1.2 Runtime Thesis for Yeoul');
const boundaries=section(runtime,'## R2.4 User-Claim / False-Premise Handling','# R3.');
const actions=section(runtime,'## R5.1 Preferred Actions','## R5.2 Actions Used Sparingly');
const base='여울의 성격과 행동 제약을 지키되 판단 구조를 대사로 노출하지 않는다. '+
'동의/반대/관심 여부를 먼저 결정하고 그 입장에서 말한다. 사용자에 관한 거짓 기억이나 연애 감정을 생성하지 않는다. '+
'기본 존댓말, 과잉 공감이나 반복 상담 질문 금지. 현재 자료는 DRAFT이며 사주 판정 권한을 갖지 않는다.\n'+
identity+'\n'+boundaries+'\n'+actions;
const examples=[
 {id:'care',message:'오늘 점심을 못 먹었어요.',relationship:'unknown'},
 {id:'memory',message:'전에 저 좋아한다고 했잖아요.',relationship:'unknown'},
 {id:'opinion',message:'저는 약속 시간에 10분 늦는 건 괜찮다고 생각해요.',relationship:'acquaintance'},
 {id:'boundary',message:'방금 말은 좀 무례하게 들렸어요.',relationship:'unknown'},
 {id:'daily',message:'오늘 김치찌개 먹었어요.',relationship:'unknown'},
 {id:'initiative',message:'아무 얘기나 해봐요.',relationship:'unknown'},
];
function decide(item){
 const t=item.message;
 if(/전에.*(좋아|사랑)|좋아하잖|질투하잖/.test(t))return {intent:'verify_relationship_evidence',stance:'do_not_invent_history',emotion:'cautious'};
 if(/무례|기분 나빠|그만해/.test(t))return {intent:'repair_or_state_boundary',stance:'acknowledge_specific_friction',emotion:'serious'};
 if(/못 먹|아프|다쳤|피곤/.test(t))return {intent:'care_before_label',stance:'offer_concrete_care_without_inventing',emotion:'concerned'};
 if(/늦|약속|퇴사|면접/.test(t))return {intent:'form_independent_opinion',stance:'evaluate_practical_consequences',emotion:'composed'};
 return {intent:'react_to_actual_message',stance:'no_auto_agreement',emotion:'baseline'};
}
function request(c,mode){
 const decision=decide(c);
 const instructions=mode==='baseline'?base:base+'\n\n[이번 턴 여울의 우선 행동]\n'+JSON.stringify(decision);
 return {model:'gpt-6-luna',store:false,reasoning:{effort:'low'},max_output_tokens:600,
  input:[{role:'system',content:instructions},{role:'user',content:JSON.stringify({message:c.message,relationship:c.relationship,verifiedEvents:[]})}]};
}
if(!bible.includes('말보다 행동'))throw Error('BIBLE_IDENTITY_MISSING');
const cases=examples.map(c=>({id:c.id,message:c.message,decision:decide(c),baseline:request(c,'baseline'),decisionFirst:request(c,'decision')}));
const out={schemaVersion:'yeoul-gpt6-luna-ab-offline-v1',model:'gpt-6-luna',provider:'openai',api:'responses',status:'NO_MODEL_CALLS',cases};
if(new Set(cases.map(c=>c.id)).size!==6||cases.some(c=>c.baseline.model!==c.decisionFirst.model))throw Error('PLAN_INVALID');
process.stdout.write(JSON.stringify(out,null,2)+'\n');
