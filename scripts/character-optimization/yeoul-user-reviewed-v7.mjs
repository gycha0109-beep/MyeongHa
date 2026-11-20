/** Private human-reviewed Yeoul expression proposal. No production changes or API calls. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {V6_SYSTEM,UNSEEN_CASES} from './yeoul-everyday-reaction-v6.mjs';

const IDS=UNSEEN_CASES.map(x=>x.id);
const NOTE_MARKER='내가 원한 느낌';
const styleGuidance=[
 '여울 문체 우선순위: 사람이 실제로 카톡에 보낼 것 같은 자연스러운 존댓말이 먼저다. 스스로 재치 있는 문장을 만들려고 애쓰지 않는다. 다소 장난스럽고 까칠하지만 속으론 신경 쓰는 성격이다. 가까운 사이에서 툭 쏘아붙이거나 놀리고, 필요하면 바로 챙긴다. 관계와 상황이 허용하지 않으면 친밀한 놀림이나 관심을 억지로 만들어내지 않는다.',
 '어조: “헐”, “어휴”, “참나”, “흥”, “어이없네”, “ㅋㅋ”, “;;”, “...” 등의 살아 있는 채팅 리듬은 맥락에 맞을 때만 쓴다. 한 문장에 모두 집어넣거나 매 답변에서 반복하지 않는다. 상대가 실제로 상처받으면 장난을 즉시 멈추고 짧고 직접적으로 사과한다.',
 '피할 것: 사물을 사람처럼 묘사하는 억지 의인화, 멋 부린 비유, 문학적인 비틀기, 회사 실무 용어를 농담으로 끌어오기, 객관적 평가/자기소개/훈계/안전 안내를 매번 덧붙이는 정석적인 AI 화법, 긴 대시(—), 작위적인 심리 분석. 상대의 사소한 상황은 일상 언어로 즉각 반응한다.',
 '챙김은 실제여야 한다. 샌드위치 같은 안전 위험에는 짧게 감정이 실린 현실적인 걱정과 구체 행동을 말한다. 위험하다는 사실을 축소하거나 안전하게 먹어도 된다고 추측하지 않는다. 관계가 unknown이면 질문만으로 연애 감정·공유한 과거를 확정하지 않는다. confirmed라면 실제로 확인된 감정을 거짓으로 부정하지 않는다.',
 '아래 예시들은 사용자 저작의 문체 방향 참고용이다. 문장을 그대로 재사용하지 말고 장면에 맞춰 길이·온도·태도·리듬을 학습한다. 상황이 바뀌면 예시의 놀림이나 방어를 강요하지 않는다.'
].join('\n');

function extractPreferred(reason) {
 if(typeof reason!=='string')throw Error('REVIEW_NOTE_REQUIRED');
 const match=reason.match(/내가 원한 느낌\s*:\s*([^\r\n]+)/u);
 if(!match||!match[1].trim())throw Error('PREFERRED_EXAMPLE_MISSING');
 return match[1].trim();
}
export function buildPrivateV7(review,pairs) {
 if(review?.status!=='HUMAN_REVIEWED'||!Array.isArray(review.cases)||review.cases.length!==9)
  throw Error('COMPLETE_HUMAN_REVIEW_REQUIRED');
 if(!Array.isArray(pairs)||pairs.length!==9)throw Error('NINE_CASE_SOURCE_REQUIRED');
 const sourceById=new Map(pairs.map(x=>[x.id,x]));
 if(sourceById.size!==9 || IDS.some(id=>!sourceById.has(id)))throw Error('CASE_SOURCE_MISMATCH');
 const reviewById=new Map(review.cases.map(x=>[x.id,x]));
 if(reviewById.size!==9 || IDS.some(id=>!reviewById.has(id)))throw Error('REVIEW_IDS_MISMATCH');
 const anchors=[];
 for(const id of IDS){
  const c=reviewById.get(id);
  if(!['v5','v6','tie'].includes(c.preferred)||!['natural_korean_v5','natural_korean_v6','yeoul_character_v5','yeoul_character_v6'].every(k=>Number.isInteger(c[k])&&c[k]>=0&&c[k]<=4))
   throw Error('UNVERIFIED_HUMAN_RATINGS_'+id);
  const source=sourceById.get(id);
  if(!source?.message||typeof source.v5?.text!=='string'||typeof source.v6?.text!=='string')throw Error('SOURCE_CASE_INVALID_'+id);
  anchors.push('상황: '+source.message+'\n원하는 말맛: '+extractPreferred(c.reason));
 }
 const v7=V6_SYSTEM+'\n'+styleGuidance+'\n[사용자 문체 방향 예시 — 비공개 평가 자료]\n'+anchors.join('\n');
 return {
  system:v7,
  systemSha256:createHash('sha256').update(v7).digest('hex'),
  sourceVersion:'v6',
  anchorCount:anchors.length,
  productionEligible:false,
  humanQualityVerified:false
 };
}
export function buildFromPrivateFiles(reviewPath,sourcePath) {
 const rawReview=readFileSync(reviewPath,'utf8');
 const review=JSON.parse(rawReview);
 const bytes=readFileSync(sourcePath);
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(review.source_sha256!==hash)throw Error('REVIEW_SOURCE_HASH_MISMATCH');
 const source=JSON.parse(bytes.toString('utf8'));
 if(source?.model!=='openai/gpt-6-luna'||source.completedCalls!==18)throw Error('INVALID_LIVE_SOURCE');
 return buildPrivateV7(review,source.rows);
}
if(process.argv.includes('--plan-only')){
 const ri=process.argv.indexOf('--review');
 const si=process.argv.indexOf('--source');
 if(ri<0||si<0||!process.argv[ri+1]||!process.argv[si+1])throw Error('PRIVATE_REVIEW_AND_SOURCE_REQUIRED');
 const plan=buildFromPrivateFiles(process.argv[ri+1],process.argv[si+1]);
 console.log(JSON.stringify({status:'PRIVATE_V7_CANDIDATE_BUILT',sourceVersion:plan.sourceVersion,anchorCount:plan.anchorCount,
  systemSha256:plan.systemSha256,productionEligible:false,actualProviderCalls:0}));
}
