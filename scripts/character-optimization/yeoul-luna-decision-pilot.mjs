import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

// Offline, single-character decision pilot. No network calls or model credentials.
const here=dirname(fileURLToPath(import.meta.url));
const runtime=readFileSync(resolve(here,'../../docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md'),'utf8');
const bible=readFileSync(resolve(here,'../../docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md'),'utf8');
const required=['R1.1 Always-On Core Anchor','R2.4 User-Claim / False-Premise Handling','R5.1 Preferred Actions','R6.7 angry'];
for(const section of required) if(!runtime.includes(section)) throw Error('YEOUL_SOURCE_MISSING: '+section);
if(!bible.includes('말보다 행동')) throw Error('YEOUL_BIBLE_MISSING');
const input=JSON.parse(process.argv[2]||'{}');
if(typeof input.message!=='string'||!input.message.trim()) throw Error('message required');
const relationship=input.relationship||'unknown';
if(!['unknown','acquaintance','close','deep_trust'].includes(relationship))throw Error('invalid relationship');
const memory=Array.isArray(input.verifiedEvents)?input.verifiedEvents:[];
const message=input.message;
const pattern=(s)=>s.test(message);
const accused=pattern(/(너|여울).{0,12}(좋아하잖|사랑한다고 했|질투하잖)/);
const boundary=pattern(/(싫다는데|하지 마|그만해|무례|기분 나빠)/);
const practical=pattern(/(면접|퇴사|회사 그만|약속|준비|일정|늦)/);
const care=pattern(/(아프|굶|못 먹|다쳤|힘들|피곤)/);
const detected=accused?'unverified_relationship_claim':boundary?'boundary_conflict':care?'care_needed':practical?'practical_problem':'ordinary';
const intent=boundary?'state_boundary':accused?'reject_unverified_premise':care?'care_before_label':practical?'practical_response':'react_quickly';
const affect=boundary?'angry':accused?'caught':care?'concerned':'baseline';
const stance=accused?'do_not_confirm_claim_without_specific_evidence':boundary?'assert_boundary':practical?'evaluate_facts':'respond_to_message';
const decision={
 character:'yeoul',sourceStatus:'DRAFT_NOT_PRODUCTION_AUTHORITY',mode:'offline_decision_only',
 input:{message,relationship,verifiedEventCount:memory.length},
 appraisal:{detected,affect,stance,intent},
 constraints:{
  doNotInvent:['past_interactions','romance','user_facts','character_history','saju_results'],
  doNotAssumeRomance:relationship==='unknown'||relationship==='acquaintance',
  preserveKoreanPoliteSpeech:true,avoidAutomaticQuestions:true,avoidCounselorTemplate:true,
  neverOverrideSajuAuthority:true
 },
 rendererContract:{
  modelAlias:'GPT Luna',modelId:'CHATGPT_SESSION_ONLY_NO_API_CALL',
  instruction:'여울의 실제 Bible/Runtime에 근거해 결정된 intent와 stance를 지키면서 자연스러운 한국어 존댓말로 답한다. 실제 기억이나 감정을 만들어내지 않는다. 단순한 츤데레 고정 대사, 상담사형 감정 요약, 매번 질문으로 끝내기를 피한다.',
  decision:{detected,affect,stance,intent},
  message,relationship,verifiedEvents:memory.filter(x=>x&&typeof x==='object'&&x.verified===true&&typeof x.description==='string').map(x=>x.description),
  sourcePaths:['docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md','docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md']
 }
};
process.stdout.write(JSON.stringify(decision,null,2)+'\n');
