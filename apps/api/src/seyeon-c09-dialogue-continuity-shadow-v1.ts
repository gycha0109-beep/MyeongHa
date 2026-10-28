import type { SeyeonRuntimeContextV2 } from '../../../packages/domain/src/seyeon-runtime-context-v2.js';
import {
  CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1,
  composeCharacterDialogueContinuityPlanShadowV1,
  requireCharacterThreadSnapshotShadowV1,
  type CharacterDialogueContinuityPacketShadowV1,
} from '../../../packages/domain/src/character-dialogue-continuity-shadow-v1.js';
import { CHARACTER_RUNTIME_AUTHORING_V1 } from
  '../../../packages/character-content/src/runtime-authoring-v1.js';
import type { SeyeonStructuredProviderRequestV2 } from './seyeon-character-runtime-v2.js';
import { PUBLIC_PERSON_CHARACTER_V1 } from './seyeon-c09-character-first-composer-shadow-v1.js';

export const SEYEON_C09_DIALOGUE_CONTINUITY_SHADOW_VERSION_V1 =
  'seyeon-c09-dialogue-continuity-shadow-v1' as const;

/** Compatibility boundary for C09's original PUBLIC research harness. */
export interface SeyeonC09DialogueContinuityPacketShadowV1
  extends Omit<CharacterDialogueContinuityPacketShadowV1,
    'version' | 'scope' | 'characterId'> {
  readonly version: typeof SEYEON_C09_DIALOGUE_CONTINUITY_SHADOW_VERSION_V1;
  readonly scope: 'PUBLIC_BOUNDED_DIALOGUE_SHADOW_NOT_PRODUCTION';
}

function fail(): never {
  throw new TypeError('C09_DIALOGUE_CONTINUITY_SHADOW_NOT_ELIGIBLE');
}
function requireSeyeonPublicContext(context: SeyeonRuntimeContextV2): void {
  if (
    context.character.characterId !== 'seyeon' ||
    !context.integrity.governedPreflightApplied ||
    context.integrity.decisions.length !== 0 ||
    context.integrity.unverifiedClaimsMayEnterAsFacts !== false ||
    context.authorityBoundaries.assistantOutputNeverAuthority !== true ||
    context.relationship !== null ||
    context.relationshipSemantics !== null ||
    context.disclosure.decision !== null ||
    context.disclosure.retrievedSources.length !== 0 ||
    context.retrievedMemories.length !== 0 ||
    context.behaviorPolicy.interactionDepth !== 'public_first_contact'
  ) fail();
}

function seyeonVoice() {
  const voice = CHARACTER_RUNTIME_AUTHORING_V1.find(
    (entry) => entry.characterId === 'seyeon',
  );
  if (!voice) fail();
  return voice;
}

function genericPlan(context: SeyeonRuntimeContextV2) {
  requireSeyeonPublicContext(context);
  try {
    return composeCharacterDialogueContinuityPlanShadowV1({
      voice: seyeonVoice(),
      recentConversation: context.recentConversation,
    });
  } catch {
    fail();
  }
}

/** All history selection and speaking-style analysis now live in the common C1 path. */
export function deriveSeyeonC09DialogueContinuityPacketShadowV1(
  context: SeyeonRuntimeContextV2,
): SeyeonC09DialogueContinuityPacketShadowV1 {
  const { packet } = genericPlan(context);
  const { characterId: _characterId, version: _version, scope: _scope, ...rest } = packet;
  return Object.freeze({
    ...rest,
    version: SEYEON_C09_DIALOGUE_CONTINUITY_SHADOW_VERSION_V1,
    scope: 'PUBLIC_BOUNDED_DIALOGUE_SHADOW_NOT_PRODUCTION' as const,
  });
}

export const SEYEON_C09_THREAD_SNAPSHOT_SHADOW_VERSION_V1 =
  'seyeon-c09-thread-snapshot-shadow-v1' as const;

/** Legacy C09 snapshot contract; adapted to the common character-scoped verifier. */
export interface SeyeonC09ThreadSnapshotShadowPortV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readThreadSnapshot(input: Readonly<{
    subjectId: string;
    threadId: string;
    currentUserMessageId: string;
  }>): unknown | Promise<unknown>;
}

export async function requireSeyeonC09ThreadSnapshotShadowV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  port: SeyeonC09ThreadSnapshotShadowPortV1 | undefined;
}>): Promise<void> {
  const packet = genericPlan(input.context).packet;
  const legacy = input.port;
  if (!legacy || typeof legacy.readThreadSnapshot !== 'function') fail();

  try {
    await requireCharacterThreadSnapshotShadowV1({
      packet,
      port: {
        characterId: 'seyeon',
        subjectId: legacy.subjectId,
        threadId: legacy.threadId,
        async readThreadSnapshot({ subjectId, threadId, currentUserMessageId }) {
          const raw: unknown = await legacy.readThreadSnapshot({
            subjectId, threadId, currentUserMessageId,
          });
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail();
          const snapshot = raw as Record<string, unknown>;
          if (
            Object.keys(snapshot).length !== 8 ||
            snapshot.schemaVersion !== SEYEON_C09_THREAD_SNAPSHOT_SHADOW_VERSION_V1
          ) fail();
          // The existing C09 snapshot has no character ID field. This legacy
          // adapter is valid ONLY after the strict C09 seyeon context check;
          // other characters must use the common 9-field proof directly.
          return {
            ...snapshot,
            schemaVersion: CHARACTER_THREAD_SNAPSHOT_SHADOW_VERSION_V1,
            characterId: 'seyeon',
          };
        },
      },
    });
  } catch {
    fail();
  }
}

/** Original C09 helper remains; it delegates source checking to the common layer. */
export async function composeSeyeonC09VerifiedDialogueContinuityShadowRequestV1(
  input: Readonly<{
    context: SeyeonRuntimeContextV2;
    request: SeyeonStructuredProviderRequestV2;
    threadSnapshotPort: SeyeonC09ThreadSnapshotShadowPortV1;
  }>,
): Promise<SeyeonStructuredProviderRequestV2> {
  await requireSeyeonC09ThreadSnapshotShadowV1({
    context: input.context,
    port: input.threadSnapshotPort,
  });
  return composeSeyeonC09DialogueContinuityShadowRequestV1(input);
}

/**
 * Only a provider request adapter for the C09 response schema.
 * No separate character-specific continuity algorithm, memory, or scene.
 * Still not wired to Production or first-turn-only fast Shadow.
 */
export function composeSeyeonC09DialogueContinuityShadowRequestV1(input: Readonly<{
  context: SeyeonRuntimeContextV2;
  request: SeyeonStructuredProviderRequestV2;
}>): SeyeonStructuredProviderRequestV2 {
  const plan = genericPlan(input.context);
  const packet = deriveSeyeonC09DialogueContinuityPacketShadowV1(input.context);
  const raw = input.request.input;
  if (
    input.request.contractVersion !== 'seyeon-structured-provider-v2' ||
    input.request.purpose !== 'turn_interpret_render_shadow' ||
    !input.request.responseSchema ||
    typeof raw !== 'object' || raw === null || Array.isArray(raw)
  ) fail();
  const previous = raw as Record<string, unknown>;
  const refs = previous.allowedReferenceVocabulary;
  if (
    previous.context !== input.context ||
    typeof refs !== 'object' || refs === null || Array.isArray(refs) ||
    !Object.hasOwn(previous, 'allowedInterpretationVocabulary')
  ) fail();
  const known = (refs as Record<string, unknown>).noticeEvidenceRefs;
  if (!Array.isArray(known) ||
      !plan.packet.recentMessageRefs.every((ref) => known.includes(ref))) fail();

  return Object.freeze({
    contractVersion: input.request.contractVersion,
    purpose: input.request.purpose,
    responseSchema: input.request.responseSchema,
    instructions: [
      input.request.instructions,
      plan.instructions,
      'C09 PUBLIC Se-yeon first-experimental continuation: her explicitly reviewed public character tendencies (not a source of offscreen events):',
      ...PUBLIC_PERSON_CHARACTER_V1,
      'The PUBLIC reveal level, empty memory/source/disclosure references, and existing independent semantic reviewer must remain in force. No action or private fact is preselected by this adapter.',
    ].join('\n'),
    input: Object.freeze({
      ...previous,
      c09DialogueContinuity: packet,
      characterContinuityDecisionProfile: plan.decisionProfile,
    }),
  });
}
