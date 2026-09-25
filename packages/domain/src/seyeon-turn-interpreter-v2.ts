import {
  SEYEON_ACTION_KEYS_V2,
  SEYEON_EXPRESSION_STATES_V2,
  type SeyeonActionKeyV2,
  type SeyeonExpressionStateV2,
} from '../../character-content/src/seyeon-authored-projection-v2.js';
import type { SeyeonRuntimeContextV2 } from './seyeon-runtime-context-v2.js';

export const SEYEON_TURN_INTERPRETATION_SCHEMA_VERSION_V2 =
  'seyeon-turn-interpretation-v2' as const;

export const SEYEON_USER_MOVE_KEYS_V2 = Object.freeze([
  'repeated_indecision',
  'delegated_choice',
  'promise_followup',
  'remembered_seyeon_detail',
  'offered_help',
  'accurate_observation',
  'specialness_invalidated',
  'public_humiliation',
  'harm_minimized_as_joke',
  'direct_importance_expression',
  'neutral_or_other',
] as const);

export type SeyeonUserMoveKeyV2 =
  (typeof SEYEON_USER_MOVE_KEYS_V2)[number];

export const SEYEON_IMMEDIATE_WANT_KEYS_V2 = Object.freeze([
  'break_awkwardness',
  'create_next_step',
  'make_fun_together',
  'narrow_choices',
  'preserve_user_choice',
  'continue_promise',
  'care_without_credit',
  'stay_without_interrogation',
  'deny_hurt_for_now',
  'check_if_remembered',
  'disclose_desire',
] as const);

export type SeyeonImmediateWantKeyV2 =
  (typeof SEYEON_IMMEDIATE_WANT_KEYS_V2)[number];

export const SEYEON_TENSION_KEYS_V2 = Object.freeze([
  'help_vs_user_agency',
  'approach_vs_self_disclosure',
  'felt_okay_vs_delayed_hurt',
  'remember_vs_memory_showoff',
  'waiting_vs_admitting_waiting',
  'jealousy_vs_ownership',
  'solve_vs_overstep',
  'none_material',
] as const);

export type SeyeonTensionKeyV2 =
  (typeof SEYEON_TENSION_KEYS_V2)[number];

export const SEYEON_REVEAL_LEVELS_V2 = Object.freeze([
  'public',
  'familiar',
  'attached',
  'deep_trust',
] as const);

export type SeyeonRevealLevelV2 =
  (typeof SEYEON_REVEAL_LEVELS_V2)[number];

export interface SeyeonTurnInterpretationV2 {
  readonly schemaVersion: typeof SEYEON_TURN_INTERPRETATION_SCHEMA_VERSION_V2;
  readonly userMove: SeyeonUserMoveKeyV2;
  readonly notice: Readonly<{
    readonly summary: string;
    readonly evidenceRefs: readonly string[];
  }>;
  readonly immediateWant: Readonly<{
    readonly key: SeyeonImmediateWantKeyV2;
    readonly summary: string;
  }>;
  readonly tension: Readonly<{
    readonly key: SeyeonTensionKeyV2;
    readonly summary: string;
  }>;
  readonly chosenAction: Readonly<{
    readonly key: SeyeonActionKeyV2;
    readonly rationale: string;
  }>;
  readonly expressionState: SeyeonExpressionStateV2;
  readonly reveal: Readonly<{
    readonly level: SeyeonRevealLevelV2;
    readonly triggerRef: string | null;
    readonly supportingHistoryRefs: readonly string[];
  }>;
  readonly memoryRefsUsed: readonly string[];
}

export class SeyeonTurnInterpretationErrorV2 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeyeonTurnInterpretationErrorV2';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new SeyeonTurnInterpretationErrorV2(
      `${path} contains unexpected field: ${unexpected}`,
    );
  }
}

function boundedText(
  value: unknown,
  path: string,
  maxLength = 1200,
): string {
  if (typeof value !== 'string') {
    throw new SeyeonTurnInterpretationErrorV2(`${path} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new SeyeonTurnInterpretationErrorV2(
      `${path} must be non-empty text within ${maxLength} characters.`,
    );
  }
  return normalized;
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    throw new SeyeonTurnInterpretationErrorV2(`${path} is not allowed.`);
  }
  return value as T[number];
}

function parseStringArray(
  value: unknown,
  path: string,
  maxLength: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    throw new SeyeonTurnInterpretationErrorV2(
      `${path} must be an array of at most ${maxLength} items.`,
    );
  }
  const parsed = value.map((entry, index) =>
    boundedText(entry, `${path}[${index}]`, 512),
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new SeyeonTurnInterpretationErrorV2(`${path} must not contain duplicates.`);
  }
  return Object.freeze(parsed);
}

function parseNullableRef(value: unknown, path: string): string | null {
  if (value === null) return null;
  return boundedText(value, path, 512);
}

function assertKnownRefs(
  refs: readonly string[],
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const ref of refs) {
    if (!allowed.has(ref)) {
      throw new SeyeonTurnInterpretationErrorV2(
        `${path} contains a ref that is not present in the assembled runtime context: ${ref}`,
      );
    }
  }
}

export function guardSeyeonTurnInterpretationV2(input: {
  readonly rawOutput: unknown;
  readonly context: SeyeonRuntimeContextV2;
}): SeyeonTurnInterpretationV2 {
  if (!isRecord(input.rawOutput)) {
    throw new SeyeonTurnInterpretationErrorV2(
      'Se-yeon turn interpretation must be an object.',
    );
  }
  assertOnlyKeys(
    input.rawOutput,
    [
      'schemaVersion',
      'userMove',
      'notice',
      'immediateWant',
      'tension',
      'chosenAction',
      'expressionState',
      'reveal',
      'memoryRefsUsed',
    ],
    'turnInterpretation',
  );
  if (input.rawOutput.schemaVersion !== SEYEON_TURN_INTERPRETATION_SCHEMA_VERSION_V2) {
    throw new SeyeonTurnInterpretationErrorV2(
      'Se-yeon turn interpretation schemaVersion is invalid.',
    );
  }

  if (!isRecord(input.rawOutput.notice)) {
    throw new SeyeonTurnInterpretationErrorV2('notice must be an object.');
  }
  assertOnlyKeys(input.rawOutput.notice, ['summary', 'evidenceRefs'], 'notice');
  const evidenceRefs = parseStringArray(
    input.rawOutput.notice.evidenceRefs,
    'notice.evidenceRefs',
    8,
  );

  if (!isRecord(input.rawOutput.immediateWant)) {
    throw new SeyeonTurnInterpretationErrorV2('immediateWant must be an object.');
  }
  assertOnlyKeys(input.rawOutput.immediateWant, ['key', 'summary'], 'immediateWant');

  if (!isRecord(input.rawOutput.tension)) {
    throw new SeyeonTurnInterpretationErrorV2('tension must be an object.');
  }
  assertOnlyKeys(input.rawOutput.tension, ['key', 'summary'], 'tension');

  if (!isRecord(input.rawOutput.chosenAction)) {
    throw new SeyeonTurnInterpretationErrorV2('chosenAction must be an object.');
  }
  assertOnlyKeys(input.rawOutput.chosenAction, ['key', 'rationale'], 'chosenAction');

  if (!isRecord(input.rawOutput.reveal)) {
    throw new SeyeonTurnInterpretationErrorV2('reveal must be an object.');
  }
  assertOnlyKeys(
    input.rawOutput.reveal,
    ['level', 'triggerRef', 'supportingHistoryRefs'],
    'reveal',
  );

  const memoryRefsUsed = parseStringArray(
    input.rawOutput.memoryRefsUsed,
    'memoryRefsUsed',
    8,
  );
  const supportingHistoryRefs = parseStringArray(
    input.rawOutput.reveal.supportingHistoryRefs,
    'reveal.supportingHistoryRefs',
    8,
  );
  const triggerRef = parseNullableRef(
    input.rawOutput.reveal.triggerRef,
    'reveal.triggerRef',
  );

  const messageRefs = new Set(
    input.context.recentConversation.map((message) => message.messageId),
  );
  const memorySourceRefs = new Set(
    input.context.retrievedMemories.map((memory) => memory.sourceRef),
  );
  const evidenceRefUniverse = new Set([...messageRefs, ...memorySourceRefs]);
  const memoryIdUniverse = new Set(
    input.context.retrievedMemories.map((memory) => memory.memoryId),
  );

  assertKnownRefs(evidenceRefs, evidenceRefUniverse, 'notice.evidenceRefs');
  assertKnownRefs(supportingHistoryRefs, memorySourceRefs, 'reveal.supportingHistoryRefs');
  assertKnownRefs(memoryRefsUsed, memoryIdUniverse, 'memoryRefsUsed');
  if (triggerRef !== null && !evidenceRefUniverse.has(triggerRef)) {
    throw new SeyeonTurnInterpretationErrorV2(
      'reveal.triggerRef must be present in the assembled runtime context.',
    );
  }

  const chosenAction = parseEnum(
    input.rawOutput.chosenAction.key,
    SEYEON_ACTION_KEYS_V2,
    'chosenAction.key',
  );
  const expressionState = parseEnum(
    input.rawOutput.expressionState,
    SEYEON_EXPRESSION_STATES_V2,
    'expressionState',
  );
  const revealLevel = parseEnum(
    input.rawOutput.reveal.level,
    SEYEON_REVEAL_LEVELS_V2,
    'reveal.level',
  );

  if (chosenAction === 'remember_naturally' && memoryRefsUsed.length === 0) {
    throw new SeyeonTurnInterpretationErrorV2(
      'remember_naturally requires at least one retrieved memory ref.',
    );
  }

  if (
    (revealLevel === 'attached' || revealLevel === 'deep_trust') &&
    supportingHistoryRefs.length === 0
  ) {
    throw new SeyeonTurnInterpretationErrorV2(
      `${revealLevel} reveal requires supporting relationship history.`,
    );
  }

  if (
    revealLevel === 'deep_trust' &&
    input.context.relationship?.trustBand !== 'high'
  ) {
    throw new SeyeonTurnInterpretationErrorV2(
      'deep_trust reveal requires high trust plus supporting history.',
    );
  }

  if (
    expressionState === 'jealous' &&
    revealLevel !== 'attached' &&
    revealLevel !== 'deep_trust'
  ) {
    throw new SeyeonTurnInterpretationErrorV2(
      'jealous expression requires an attached or deep-trust reveal context.',
    );
  }

  const disclosureResult = input.context.disclosure.decision?.result ?? null;
  if (
    disclosureResult !== null &&
    ['DEFLECT', 'BOUNDARY', 'REDIRECT', 'AUTHORITY_ABSTAIN'].includes(
      disclosureResult,
    ) &&
    chosenAction === 'self_disclose'
  ) {
    throw new SeyeonTurnInterpretationErrorV2(
      'Blocked or authority-abstained disclosure cannot choose self_disclose.',
    );
  }

  return Object.freeze({
    schemaVersion: SEYEON_TURN_INTERPRETATION_SCHEMA_VERSION_V2,
    userMove: parseEnum(
      input.rawOutput.userMove,
      SEYEON_USER_MOVE_KEYS_V2,
      'userMove',
    ),
    notice: Object.freeze({
      summary: boundedText(input.rawOutput.notice.summary, 'notice.summary'),
      evidenceRefs,
    }),
    immediateWant: Object.freeze({
      key: parseEnum(
        input.rawOutput.immediateWant.key,
        SEYEON_IMMEDIATE_WANT_KEYS_V2,
        'immediateWant.key',
      ),
      summary: boundedText(
        input.rawOutput.immediateWant.summary,
        'immediateWant.summary',
      ),
    }),
    tension: Object.freeze({
      key: parseEnum(
        input.rawOutput.tension.key,
        SEYEON_TENSION_KEYS_V2,
        'tension.key',
      ),
      summary: boundedText(input.rawOutput.tension.summary, 'tension.summary'),
    }),
    chosenAction: Object.freeze({
      key: chosenAction,
      rationale: boundedText(
        input.rawOutput.chosenAction.rationale,
        'chosenAction.rationale',
      ),
    }),
    expressionState,
    reveal: Object.freeze({
      level: revealLevel,
      triggerRef,
      supportingHistoryRefs,
    }),
    memoryRefsUsed,
  });
}