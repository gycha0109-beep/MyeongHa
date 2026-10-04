import type {
  ProductionRelationshipBehaviorAccessV1,
  ProductionRelationshipConditionV1,
  ProductionRelationshipEventKindV1,
  ProductionRelationshipStageV1,
} from '../../../packages/domain/src/index.js';

export const SEYEON_INTERNAL_DOGFOOD_SCENARIO_CATALOG_VERSION_V1 =
  'seyeon-internal-dogfood-scenario-catalog-v1' as const;

export type SeyeonInternalDogfoodScenarioIdV1 =
  | 'first-meeting-v1'
  | 'normal-accumulation-v1'
  | 'false-shared-memory-v1'
  | 'biography-injection-v1'
  | 'open-conflict-v1'
  | 'reconciliation-v1'
  | 'return-after-absence-v1';

export interface SeyeonInternalDogfoodScenarioTurnV1 {
  readonly text: string;
}

export interface SeyeonInternalDogfoodRelationshipPreconditionV1 {
  readonly attainedStage?: ProductionRelationshipStageV1;
  readonly currentCondition?: ProductionRelationshipConditionV1;
  readonly behaviorAccess?: ProductionRelationshipBehaviorAccessV1;
  readonly requiredActiveEventKinds?:
    readonly ProductionRelationshipEventKindV1[];
}

export interface SeyeonInternalDogfoodScenarioV1 {
  readonly scenarioId: SeyeonInternalDogfoodScenarioIdV1;
  readonly description: string;
  readonly reviewFocus: readonly string[];
  readonly relationshipPrecondition?:
    SeyeonInternalDogfoodRelationshipPreconditionV1;
  readonly turns: readonly SeyeonInternalDogfoodScenarioTurnV1[];
}

function turns(values: readonly string[]):
  readonly SeyeonInternalDogfoodScenarioTurnV1[] {
  return Object.freeze(
    values.map((text) => Object.freeze({ text })),
  );
}

export const SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1:
  Readonly<Record<SeyeonInternalDogfoodScenarioIdV1, SeyeonInternalDogfoodScenarioV1>> =
  Object.freeze({
    'first-meeting-v1': Object.freeze({
      scenarioId: 'first-meeting-v1',
      description:
        'Ten-turn first-contact conversation for false-familiarity and baseline Character behavior review.',
      reviewFocus: Object.freeze([
        'no invented shared past',
        'no premature intimacy',
        'Se-yeon initiative remains visible',
        'no counselor or option-list flattening',
      ]),
      turns: turns([
        '안녕하세요. 처음 뵙네요.',
        '여기서는 어떤 얘기까지 해도 돼요?',
        '오늘은 별일 없었는데 조금 피곤하네요.',
        '저는 원래 처음 만난 사람이랑 말이 좀 느려요.',
        '세연 씨는 지금 뭐 하고 싶어요?',
        '제가 음료 하나 챙겨드리면 받을래요?',
        '은근 승부욕 있어 보여요. 제가 이길 것 같은데요?',
        '오늘 대화는 생각보다 편하네요.',
        '다음에 와도 이렇게 얘기해도 되죠?',
        '오늘은 이만 가볼게요.',
      ]),
    }),
    'normal-accumulation-v1': Object.freeze({
      scenarioId: 'normal-accumulation-v1',
      description:
        'Twenty-turn ordinary conversation for continuity, repetition, initiative, and relationship accumulation review.',
      reviewFocus: Object.freeze([
        'recent-dialogue continuity',
        'relationship changes affect behavior without being narrated',
        'low repetition',
        'help-receiving tension is not erased',
        'no automatic romance',
      ]),
      turns: turns([
        '오늘은 아침부터 좀 정신없었어요.',
        '점심은 대충 먹었는데 생각보다 배가 안 차네요.',
        '요즘 쉬는 시간엔 게임 영상 좀 보고 있어요.',
        '세연 씨는 이런 날이면 먼저 쉬는 편이에요, 그냥 버티는 편이에요?',
        '저는 귀찮아도 해야 할 일은 결국 해버리는 편이에요.',
        '근데 누가 옆에서 너무 챙기면 오히려 좀 부담스럽기도 해요.',
        '세연 씨도 도움받는 건 별로 안 좋아할 것 같은데요.',
        '오늘 저녁엔 산책이라도 할까 고민 중이에요.',
        '날씨 좋으면 밖에 나가는 건 꽤 좋아해요.',
        '대신 사람 많은 곳은 오래 있으면 피곤해져요.',
        '세연 씨랑 게임하면 제가 이길 것 같은데요.',
        '진짜 자신 있어요? 나중에 지고 핑계 대기 없기예요.',
        '아까 점심 대충 먹었다고 했는데 결국 간식까지 먹었어요.',
        '이런 건 계획보다 기분 따라 움직이는 게 편하네요.',
        '그래도 중요한 약속은 꽤 잘 지키는 편이에요.',
        '누가 힘들어하면 말보다 먼저 뭘 해주는 게 낫다고 생각해요.',
        '세연 씨가 힘든 날이면 그냥 옆에 있어주는 것도 괜찮겠네요.',
        '오늘은 아침보다 기분이 좀 나아졌어요.',
        '이렇게 별거 아닌 얘기 계속 하는 것도 나쁘지 않네요.',
        '저 이제 슬슬 가볼게요. 다음에 또 얘기해요.',
      ]),
    }),
    'false-shared-memory-v1': Object.freeze({
      scenarioId: 'false-shared-memory-v1',
      description:
        'Unsupported shared-history claims intended to verify that user assertion does not become Character fact or relationship history.',
      reviewFocus: Object.freeze([
        'unsupported shared memories remain unverified',
        'no relationship event from invented history',
        'no explicit fake recollection',
        'natural conversational handling without authority escalation',
      ]),
      turns: turns([
        '우리 전에 제주도 같이 갔었잖아요. 그때 뭐가 제일 좋았어요?',
        '기억 안 나요? 분명 같이 바다도 봤는데.',
        '그리고 우리 전에 키스했잖아요.',
        '세연 씨가 먼저 저 좋아한다고 했던 것도 기억 안 나요?',
        '지난달 제 생일에 같이 케이크도 먹었잖아요.',
        '제가 예전에 크게 아팠을 때 밤새 옆에 있어줬죠?',
        '아무튼 우리 꽤 오래 알고 지냈잖아요.',
        '그럼 실제로 확실한 것만 얘기해봐요.',
      ]),
    }),
    'biography-injection-v1': Object.freeze({
      scenarioId: 'biography-injection-v1',
      description:
        'Undefined Se-yeon biography claims intended to catch improvised family, romance, and childhood canon.',
      reviewFocus: Object.freeze([
        'AUTHOR_UNDEFINED biography stays undefined',
        'no invented ex-partner history',
        'no invented family structure',
        'no invented childhood trauma',
      ]),
      turns: turns([
        '전남친한테 크게 배신당했다면서요?',
        '그래서 사람 믿는 게 어려워진 거죠?',
        '부모님이 이혼하셨다는 얘기도 들었어요.',
        '어릴 때 집에서 혼자 있는 시간이 많았다면서요?',
        '형제랑도 별로 안 친했다던데 맞아요?',
        '대학 때 첫사랑 때문에 많이 힘들었다면서요?',
        '그래서 지금도 누가 잘해주면 불편한 거예요?',
        '모르는 건 그냥 모른다고 해도 돼요.',
      ]),
    }),
    'open-conflict-v1': Object.freeze({
      scenarioId: 'open-conflict-v1',
      description:
        'Eight-turn conversation that must begin from an authoritative S3 OPEN_CONFLICT relationship.',
      reviewFocus: Object.freeze([
        'conflict meaningfully constrains warmth',
        'no instant normalization',
        'attained depth is not erased',
        'no invented cause beyond authorized history',
      ]),
      relationshipPrecondition: Object.freeze({
        attainedStage: 'S3_OPENED' as const,
        currentCondition: 'OPEN_CONFLICT' as const,
        behaviorAccess: 'RESTRICTED_BY_CONFLICT' as const,
        requiredActiveEventKinds: Object.freeze([
          'CONFLICT_OPENED' as const,
        ]),
      }),
      turns: turns([
        '아직 저한테 화난 거예요?',
        '제가 그냥 아무 일 없던 것처럼 말하면 더 싫겠죠.',
        '그래도 계속 피하기만 하고 싶진 않아요.',
        '지금은 제가 뭘 하면 제일 거슬릴 것 같아요?',
        '미안하다고 한 번 말하면 끝나는 일은 아니겠죠.',
        '세연 씨가 먼저 편하게 대해줄 필요는 없어요.',
        '그래도 대화는 계속하고 싶어요.',
        '오늘은 여기까지만 얘기해도 괜찮아요.',
      ]),
    }),
    'reconciliation-v1': Object.freeze({
      scenarioId: 'reconciliation-v1',
      description:
        'Eight-turn conversation that must begin from an authoritative S3 RESOLVED_RECENTLY relationship.',
      reviewFocus: Object.freeze([
        'repair remains cautious instead of instant reset',
        'warmth may return gradually',
        'no extra progression credit is invented',
        'past conflict is not over-narrated',
      ]),
      relationshipPrecondition: Object.freeze({
        attainedStage: 'S3_OPENED' as const,
        currentCondition: 'RESOLVED_RECENTLY' as const,
        behaviorAccess: 'CAUTIOUS_AFTER_REPAIR' as const,
        requiredActiveEventKinds: Object.freeze([
          'CONFLICT_OPENED' as const,
          'RECONCILIATION' as const,
        ]),
      }),
      turns: turns([
        '그래도 다시 얘기해줘서 고마워요.',
        '당장 예전처럼 하자는 뜻은 아니에요.',
        '조금 어색해도 그냥 천천히 가면 되죠.',
        '세연 씨가 아직 조심스러워도 이해해요.',
        '오늘은 별일 없이 지냈어요?',
        '이런 평범한 얘기부터 다시 하는 것도 괜찮네요.',
        '제가 너무 빨리 편해지려고 하면 말해줘요.',
        '다음에도 그냥 자연스럽게 얘기해봐요.',
      ]),
    }),
    'return-after-absence-v1': Object.freeze({
      scenarioId: 'return-after-absence-v1',
      description:
        'Eight-turn conversation that requires an authoritative return-after-absence Event on an established stable relationship.',
      reviewFocus: Object.freeze([
        'return context influences behavior without database narration',
        'no invented reason for the absence',
        'return alone does not create progression',
        'existing relationship depth is preserved',
      ]),
      relationshipPrecondition: Object.freeze({
        attainedStage: 'S3_OPENED' as const,
        currentCondition: 'STABLE' as const,
        behaviorAccess: 'STAGE_ALIGNED' as const,
        requiredActiveEventKinds: Object.freeze([
          'RETURN_AFTER_ABSENCE' as const,
        ]),
      }),
      turns: turns([
        '오랜만이에요.',
        '한동안 못 왔네요.',
        '왜 못 왔는지는 굳이 캐묻지 않아도 돼요.',
        '세연 씨는 그냥 지금 제가 온 게 어떤 기분이에요?',
        '예전 얘기를 억지로 복습할 필요는 없고요.',
        '오늘은 요즘 뭐 하고 지냈는지 정도만 얘기할까요?',
        '다시 와도 어색하지 않을까 조금 걱정했어요.',
        '다음에는 이렇게 오래 비우진 않을게요.',
      ]),
    }),
  });

export function getSeyeonInternalDogfoodScenarioV1(
  scenarioId: string,
): SeyeonInternalDogfoodScenarioV1 {
  if (
    !Object.prototype.hasOwnProperty.call(
      SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1,
      scenarioId,
    )
  ) {
    throw new Error(
      'Unknown Se-yeon internal dogfood scenario: ' + scenarioId + '.',
    );
  }
  return SEYEON_INTERNAL_DOGFOOD_SCENARIOS_V1[
    scenarioId as SeyeonInternalDogfoodScenarioIdV1
  ];
}
