import { createHash } from 'node:crypto';

import {
  canonicalJson,
  type CharacterDialogueEnvelopeV1,
} from '../../../packages/domain/src/index.js';

export const CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1 =
  'character-dialogue-message-v1' as const;

export interface CharacterDialoguePersistedMessageV1 {
  readonly bodyText: string;
  readonly messagePayloadJsonb: {
    readonly schemaVersion: typeof CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1;
    readonly envelope: CharacterDialogueEnvelopeV1;
  };
  readonly messageSchemaVersion: typeof CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1;
  readonly contentHash: string;
}

export class CharacterDialogueMessagePersistenceErrorV1 extends Error {
  override readonly name = 'CharacterDialogueMessagePersistenceErrorV1';
}

function requireVisibleText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new CharacterDialogueMessagePersistenceErrorV1(
      `${path} must not be blank.`,
    );
  }
  return normalized;
}

/**
 * Deterministic visible-text projection for a validated Character envelope.
 *
 * The message stream can render bodyText directly while messagePayloadJsonb keeps
 * the exact guarded envelope for richer clients and replay/provenance checks.
 */
export function serializeCharacterDialogueEnvelopeForPersistenceV1(
  envelope: CharacterDialogueEnvelopeV1,
): CharacterDialoguePersistedMessageV1 {
  if (
    envelope.memoryProposals.length > 0 ||
    envelope.relationshipEventProposals.length > 0
  ) {
    throw new CharacterDialogueMessagePersistenceErrorV1(
      'Production v1 cannot persist unresolved Character side-effect proposals.',
    );
  }

  const parts: string[] = [];
  if (envelope.framingBefore !== null) {
    parts.push(requireVisibleText(envelope.framingBefore, 'framingBefore'));
  }
  envelope.protectedSajuSegments.forEach((segment, index) => {
    parts.push(
      requireVisibleText(
        segment.text,
        `protectedSajuSegments[${index}].text`,
      ),
    );
  });
  envelope.protectedSajuDisclosures.forEach((disclosure, index) => {
    parts.push(
      requireVisibleText(
        disclosure.text,
        `protectedSajuDisclosures[${index}].text`,
      ),
    );
  });
  envelope.calculationAmbiguity.forEach((ambiguity, index) => {
    parts.push(
      requireVisibleText(
        ambiguity,
        `calculationAmbiguity[${index}]`,
      ),
    );
  });
  if (envelope.framingAfter !== null) {
    parts.push(requireVisibleText(envelope.framingAfter, 'framingAfter'));
  }

  if (parts.length === 0) {
    throw new CharacterDialogueMessagePersistenceErrorV1(
      'Validated Character envelope has no visible persisted text.',
    );
  }

  const bodyText = parts.join('\n\n');
  const messagePayloadJsonb = Object.freeze({
    schemaVersion: CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1,
    envelope,
  });
  const hashMaterial = Object.freeze({
    messageSchemaVersion: CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1,
    bodyText,
    messagePayloadJsonb,
  });
  const contentHash = `sha256:v1:${createHash('sha256')
    .update(canonicalJson(hashMaterial), 'utf8')
    .digest('hex')}`;

  return Object.freeze({
    bodyText,
    messagePayloadJsonb,
    messageSchemaVersion: CHARACTER_DIALOGUE_MESSAGE_SCHEMA_VERSION_V1,
    contentHash,
  });
}
