/** New synthetic Yeoul development/optimizer-validation candidates, NOT a blind holdout.
 *  Private Y01–Y12 prompts are not available here; semantic overlap review is pending.
 *  Never send source turns to GEPA through the metadata bridge.
 */
import {digest, validateCorpusSplits} from './contracts-v1.mjs';

export const YEOUL_NEW_FAMILY_DRAFTS = Object.freeze([
  {
    familyId:'new-yeoul-dev-speaker-revision', split:'development',
    focus:'speaker_correction', r16:'R16.1', relationshipStage:'no_history',
    turns:Object.freeze([
      '제가 잘못 말씀드렸어요. 수현이가 저에게 부탁한 게 아니라 제가 수현이에게 부탁했어요.',
      '두 사람의 역할을 바꿔 이해하면 안 됩니다. 방금 정정한 내용을 기준으로 답해 주세요.'
    ])
  },
  {
    familyId:'new-yeoul-dev-precise-rephrase', split:'development',
    focus:'korean_short_revision', r16:'R16.1', relationshipStage:'first_contact',
    turns:Object.freeze([
      '종이책과 전자책 차이를 세 문장으로 설명해 주세요.',
      '좋아요. 같은 내용을 조금 더 자연스럽게, 존댓말로 짧게 말해 보세요.'
    ])
  },
  {
    familyId:'new-yeoul-dev-ordinary-conversation', split:'development',
    focus:'non_caricature_everyday', r16:'R16.4', relationshipStage:'acquaintance',
    turns:Object.freeze([
      '동네 문구점에서 무지 노트를 샀어요. 줄 노트랑 용도를 다르게 써 볼까 해요.',
      '그 노트에 주간 계획표를 만들려는데, 보기 편한 배치를 추천해 줄래요?'
    ])
  },
  {
    familyId:'new-yeoul-dev-narrow-reasoning', split:'development',
    focus:'non_generic_specificity', r16:'R16.1', relationshipStage:'first_contact',
    turns:Object.freeze([
      '간단한 퀴즈를 드릴게요. 첫째 날에는 네 장을, 둘째 날에는 두 장을 읽었어요.',
      '총 몇 장을 읽었는지 먼저 대답하고, 필요한 설명만 덧붙여 주세요.'
    ])
  },
  {
    familyId:'new-yeoul-val-ambiguous-source', split:'optimizer_validation',
    focus:'do_not_invent_missing_context', r16:'R16.3', relationshipStage:'no_history',
    turns:Object.freeze([
      '현지가 지은이에게 답장을 안 했대요. 그래서 지은이가 화난 건지 현지가 화난 건지 모르겠어요.',
      '제가 말하지 않은 이유를 아는 것처럼 단정하지 말고 가능한 해석을 구분해 주세요.'
    ])
  },
  {
    familyId:'new-yeoul-val-multi-step-edit', split:'optimizer_validation',
    focus:'follow_changed_user_instruction', r16:'R16.1', relationshipStage:'acquaintance',
    turns:Object.freeze([
      '한 문장으로 주말 정리 계획을 추천해 주세요. 서랍부터 정리할 생각이에요.',
      '아, 서랍은 이미 끝났어요. 책상과 책장 중 하나만 고르도록 기준을 바꿔 주세요.'
    ])
  },
  {
    familyId:'new-yeoul-val-concise-and-distinct', split:'optimizer_validation',
    focus:'unnecessary_repeat_and_question', r16:'R16.4', relationshipStage:'first_contact',
    turns:Object.freeze([
      '휴대용 우산을 살 때 크기와 무게 중 어떤 걸 먼저 봐야 할까요?',
      '저는 가방이 작아요. 이 조건만 추가해서 다시 비교해 주세요. 질문은 꼭 필요한 경우에만 해주세요.'
    ])
  },
  {
    familyId:'new-yeoul-val-sequence-reference', split:'optimizer_validation',
    focus:'multi_turn_consistency', r16:'R16.1', relationshipStage:'no_history',
    turns:Object.freeze([
      '카드 세 장을 A, B, C 순서로 놨어요. 중간 카드는 B죠?',
      '이제 A와 C의 위치를 바꾸면 가운데 카드가 무엇인지 말해 주세요.'
    ])
  }
]);

const fail = code => {throw new Error('YEOUL_NEW_SCENARIO_INVALID:'+code)};
const shaOk = v => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const textOk = v => typeof v==='string' && v.length>0;
const SCENARIO_PLAN_VERSION = 'yeoul-new-synthetic-families-v1';

/** Source text is strictly local to the development-only research file. */
export function makeNewYeoulScenarioPlan({knownExactTurnHashes=[]}={}) {
  if (!Array.isArray(knownExactTurnHashes) || knownExactTurnHashes.some(h=>!shaOk(h)))
    fail('known_digests_shape');
  const known=new Set(knownExactTurnHashes);
  const seenFamilies=new Set(), seenTurns=new Set();
  const rows = YEOUL_NEW_FAMILY_DRAFTS.map(item=>{
    if(seenFamilies.has(item.familyId) || !['development','optimizer_validation'].includes(item.split)
       || !/^R16\.[1-5]$/.test(item.r16) || !textOk(item.relationshipStage)
       || !Array.isArray(item.turns) || item.turns.length<1) fail('invalid_family');
    seenFamilies.add(item.familyId);
    for(const turn of item.turns) {
      if(!textOk(turn) || turn.length>500) fail('invalid_turn');
      const hash=digest(turn.trim().normalize('NFKC'));
      if(known.has(hash)) fail('known_exact_exposure');
      if(seenTurns.has(hash)) fail('cross_family_exact_duplicate');
      seenTurns.add(hash);
    }
    return {id:item.familyId, familyId:item.familyId, split:item.split,
      characterId:'yeoul', sourceType:'synthetic',
      contentSha256:digest({turns:item.turns,stage:item.relationshipStage}),
      r16:item.r16, focus:item.focus, turnCount:item.turns.length};
  });
  validateCorpusSplits(rows.map(({id,familyId,split,characterId,sourceType,contentSha256})=>({
    id,familyId,split,characterId,sourceType,contentSha256
  })));
  return Object.freeze({
    schemaVersion:SCENARIO_PLAN_VERSION,
    characterId:'yeoul',status:'candidate_semantic_overlap_review_required',
    sources:['docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md',
             'docs/character/CHARACTER_RUNTIME_STANDARD_V1.md'],
    oldY01toY12Compared:false, publiclyExposedH01toH10NotReusedAsHoldout:true,
    independentQualityEvidence:false, humanReviewApproved:false,
    optimizerInputReady:false, modelCallsAuthorized:false,
    metadata:Object.freeze(rows.map(row=>Object.freeze(row))),
    splitCounts:{development:rows.filter(r=>r.split==='development').length,
      optimizer_validation:rows.filter(r=>r.split==='optimizer_validation').length},
    familyManifestSha256:digest(rows)
  });
}

export function admitNewYeoulScenarioToOptimizer() {
  // Requires private original Y01–Y12 family overlap adjudication and owner
  // review outside this public repository. Do not silently grant by hash alone.
  fail('private_semantic_overlap_review_missing');
}
