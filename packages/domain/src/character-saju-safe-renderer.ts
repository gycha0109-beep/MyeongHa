import {
  CHARACTER_VOICE_AUTHORITY_SOURCE_V1,
  type CharacterSajuSafeFramingEntryV1,
} from '../../character-content/src/index.js';
import {
  CharacterOutputGuardError,
  guardCharacterRendererOutput,
  type CharacterDialogueEnvelopeV1,
} from './character-output-guard.js';
import type { CharacterRuntimeContextV1 } from './character-runtime-context.js';

/**
 * Strict provider contract for Saju-bearing turns.
 * No provider-authored visible prose is accepted; only content-pinned framing keys may be chosen.
 */
export interface CharacterSajuSafeRendererDraftV1 {
  readonly schemaVersion: 'v1';
  readonly framingBeforeKey?: string;
  readonly framingAfterKey?: string;
  readonly emotion: string;
  readonly animationCue?: string;
  readonly memoryProposals: readonly unknown[];
  readonly relationshipEventProposals: readonly unknown[];
  readonly suggestedActions: readonly unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected !== undefined) {
    throw new CharacterOutputGuardError(
      `sajuSafeRendererOutput contains unexpected field: ${unexpected}`,
    );
  }
}

function optionalStableKey(value: unknown, path: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(value)
  ) {
    throw new CharacterOutputGuardError(`${path} must be a stable lower-case key.`);
  }
  return value;
}

function resolveFraming(
  key: string | null,
  entries: readonly CharacterSajuSafeFramingEntryV1[],
  path: string,
): string | undefined {
  if (key === null) return undefined;
  const entry = entries.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    throw new CharacterOutputGuardError(`${path} is not present in the pinned safe framing catalog.`);
  }
  return entry.text;
}

/**
 * Saju rendering must consume the exact published Character voice objects assembled
 * for the active turn. Any stale, cross-Character, cloned, or surface-swapped authority
 * fails closed before provider output is accepted.
 */
export function assertCharacterSajuVoiceRuntimeInvariantV1(
  context: CharacterRuntimeContextV1,
): void {
  if (context.saju === null) {
    throw new CharacterOutputGuardError(
      'Saju voice runtime invariant requires a Saju-bearing runtime context.',
    );
  }

  const authority = context.voiceAuthority;
  if (authority.source !== CHARACTER_VOICE_AUTHORITY_SOURCE_V1) {
    throw new CharacterOutputGuardError(
      'Saju renderer voice authority must come from published Character content.',
    );
  }
  if (authority.surface !== 'saju_product') {
    throw new CharacterOutputGuardError(
      'Saju renderer voice authority surface must be saju_product.',
    );
  }
  if (authority.characterId !== context.characterId) {
    throw new CharacterOutputGuardError(
      'Saju renderer voice authority does not match the active Character.',
    );
  }
  if (authority.contentVersion !== context.contentVersion) {
    throw new CharacterOutputGuardError(
      'Saju renderer voice authority does not match the active Character content version.',
    );
  }
  if (authority.speech !== context.speech) {
    throw new CharacterOutputGuardError(
      'Saju renderer must use the exact published Character speech object for the turn.',
    );
  }
  if (authority.communication !== context.persona.communication) {
    throw new CharacterOutputGuardError(
      'Saju renderer must use the exact published Character communication object for the turn.',
    );
  }
}

export function guardCharacterSajuSafeRendererOutput(input: {
  readonly rawOutput: unknown;
  readonly context: CharacterRuntimeContextV1;
  readonly allowedSuggestedActionKeys: readonly string[];
}): CharacterDialogueEnvelopeV1 {
  assertCharacterSajuVoiceRuntimeInvariantV1(input.context);

  const catalog = input.context.sajuProfile.safeFraming;
  if (catalog === undefined || catalog.schemaVersion !== 'v1') {
    throw new CharacterOutputGuardError(
      'Saju-bearing baseline requires a content-pinned safe framing catalog.',
    );
  }
  if (!isRecord(input.rawOutput)) {
    throw new CharacterOutputGuardError('Saju-safe renderer output must be an object.');
  }

  assertOnlyKeys(input.rawOutput, [
    'schemaVersion',
    'framingBeforeKey',
    'framingAfterKey',
    'emotion',
    'animationCue',
    'memoryProposals',
    'relationshipEventProposals',
    'suggestedActions',
  ]);
  if (input.rawOutput.schemaVersion !== 'v1') {
    throw new CharacterOutputGuardError('Saju-safe renderer schemaVersion must be v1.');
  }

  const beforeKey = optionalStableKey(input.rawOutput.framingBeforeKey, 'framingBeforeKey');
  const afterKey = optionalStableKey(input.rawOutput.framingAfterKey, 'framingAfterKey');
  const framingBefore = resolveFraming(beforeKey, catalog.before, 'framingBeforeKey');
  const framingAfter = resolveFraming(afterKey, catalog.after, 'framingAfterKey');

  return guardCharacterRendererOutput({
    context: input.context,
    allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
    rawOutput: {
      schemaVersion: 'v1',
      ...(framingBefore === undefined ? {} : { framingBefore }),
      ...(framingAfter === undefined ? {} : { framingAfter }),
      emotion: input.rawOutput.emotion,
      ...(input.rawOutput.animationCue === undefined
        ? {}
        : { animationCue: input.rawOutput.animationCue }),
      memoryProposals: input.rawOutput.memoryProposals,
      relationshipEventProposals: input.rawOutput.relationshipEventProposals,
      suggestedActions: input.rawOutput.suggestedActions,
    },
  });
}
