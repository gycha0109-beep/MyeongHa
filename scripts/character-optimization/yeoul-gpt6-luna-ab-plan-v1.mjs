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
const requiredRuntimeSections=['# R1. CORE RUNTIME ANCHOR','# R2. CHARACTER-SPECIFIC BOUNDARIES',
 '# R3. ATTENTION & INTERPRETATION','# R4. IMMEDIATE WANT & TENSION',
 '# R5. ACTION REPERTOIRE','# R6. EXPRESSION STATES','# R7. QUESTION STRATEGY',
 '# R8. CARE STRATEGY','# R9. CONFLICT & REPAIR','# R10. AFFECTION & INTIMACY',
 '# R11. RELATIONSHIP REVEAL MAPPING','# R12. CHARACTER MEMORY BEHAVIOR',
 '# R13. REPETITION & DRIFT RISKS','# R14. CHARACTER-SPECIFIC GUARDS',
 '# R15. CHARACTER EVENT CANDIDATES','# R16. CHARACTER EVALUATION PROBES',
 '# R17. RUNTIME PACKET EXAMPLES'];
for(const heading of requiredRuntimeSections){
 if(!runtime.includes(heading))throw Error('MISSING_RUNTIME_SECTION_'+heading);
}
if(!bible.includes('말보다 행동'))throw Error('BIBLE_IDENTITY_MISSING');
const base='아래 원본 Bible과 Character Runtime을 실제 행동 규칙으로 적용해 여울 본인으로 반응한다. '+
 'Runtime의 주의→욕구→행동→표현 상태→관계 근거→대사 순서를 적용한다. '+
 '말투만 흉내 내거나 무조건 돌봄/질문/부정으로 응답하지 않는다. '+
 '확인되지 않은 사용자별 관계 사실은 만들지 않는다. '+
 '상황에 해당하지 않는 감정 상태를 강제하지 않는다. '+
 '현재 자료는 DRAFT이며 별도 권한 없는 사실을 확정하지 않는다.\n\n'+
 '[여울 Bible 원문]\n'+bible+'\n\n[여울 Character Runtime 원문]\n'+runtime;
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
const cases=examples.map(c=>({id:c.id,message:c.message,decision:decide(c),baseline:request(c,'baseline'),decisionFirst:request(c,'decision')}));
const out={schemaVersion:'yeoul-gpt6-luna-ab-offline-v1',model:'gpt-6-luna',provider:'openai',api:'responses',status:'NO_MODEL_CALLS',cases};
if(new Set(cases.map(c=>c.id)).size!==6||cases.some(c=>c.baseline.model!==c.decisionFirst.model))throw Error('PLAN_INVALID');
process.stdout.write(JSON.stringify(out,null,2)+'\n');
