import {
  attachServerAuthorizedCharacterPublicFactsV1,
} from '../../../packages/domain/src/character-runtime-context.js';
import {
  projectCharacterRuntimeContextForRendererV1,
  type CharacterRendererRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import {
  getServerPreparedChatReceiveContentEntryV1,
} from './chat-receive.js';
import {
  getCharacterPublicFactCatalogV1,
  type CharacterPublicFactCatalogReadAuthorityPortV1,
} from './character-public-fact-catalog-authority.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from './character-standard-reading-chat-turn-preflight.js';

export interface CharacterStandardReadingPublicFactCatalogRendererContextV1 {
  readonly schemaVersion: 'v1';
  readonly releaseId: string;
  readonly characterId: string;
  readonly providerContext: CharacterRendererRuntimeContextV1;
  readonly admittedPublicFactCount: number;
}

export class CharacterStandardReadingPublicFactCatalogRendererContextErrorV1 extends Error {
  override readonly name =
    'CharacterStandardReadingPublicFactCatalogRendererContextErrorV1';

  constructor(message: string) {
    super(message);
  }
}

function exactPreflightIdentity(
  preflight: CharacterStandardReadingChatTurnPreflightV1,
): {
  readonly releaseId: string;
  readonly bundleId: string;
  readonly characterId: string;
} {
  const contentEntry = getServerPreparedChatReceiveContentEntryV1(
    preflight.receivePlan,
  );
  const binding = preflight.runtime.threadBinding;

  if (
    binding.activeContentReleaseId !==
      preflight.receivePlan.resolvedContent.releaseId ||
    binding.activeContentReleaseId !== contentEntry.release.releaseId
  ) {
    throw new CharacterStandardReadingPublicFactCatalogRendererContextErrorV1(
      'PUBLIC fact catalog renderer context release provenance is inconsistent.',
    );
  }

  if (
    binding.activeContentBundleId !==
      preflight.receivePlan.resolvedContent.bundleId ||
    binding.activeContentBundleId !== contentEntry.release.bundleId ||
    preflight.runtime.context.contentBundleId !== binding.activeContentBundleId
  ) {
    throw new CharacterStandardReadingPublicFactCatalogRendererContextErrorV1(
      'PUBLIC fact catalog renderer context bundle provenance is inconsistent.',
    );
  }

  if (
    binding.participantCharacterIds.length !== 1 ||
    binding.participantCharacterIds[0] === undefined
  ) {
    throw new CharacterStandardReadingPublicFactCatalogRendererContextErrorV1(
      'PUBLIC fact catalog renderer context requires one active Character.',
    );
  }

  const characterId = binding.participantCharacterIds[0];
  if (preflight.runtime.context.characterId !== characterId) {
    throw new CharacterStandardReadingPublicFactCatalogRendererContextErrorV1(
      'PUBLIC fact catalog renderer context Character provenance is inconsistent.',
    );
  }

  return Object.freeze({
    releaseId: binding.activeContentReleaseId,
    bundleId: binding.activeContentBundleId,
    characterId,
  });
}

/**
 * Preferred v1 provider composition path for ordinary PUBLIC Character facts.
 *
 * No natural-language -> factKey selector authority is required. The server
 * retrieves the complete bounded PUBLIC/KNOWN/resolved catalog for the exact
 * pinned release and Character, attaches those facts to Runtime authority, then
 * strips registry provenance before provider invocation.
 */
export async function prepareCharacterStandardReadingRendererContextFromPublicCatalogV1(
  input: {
    readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
    readonly catalogAuthorityPort: CharacterPublicFactCatalogReadAuthorityPortV1;
  },
): Promise<CharacterStandardReadingPublicFactCatalogRendererContextV1> {
  const identity = exactPreflightIdentity(input.preflight);

  const rows = await getCharacterPublicFactCatalogV1({
    releaseId: identity.releaseId,
    characterId: identity.characterId,
    authorityPort: input.catalogAuthorityPort,
  });

  const context = attachServerAuthorizedCharacterPublicFactsV1(
    input.preflight.runtime.context,
    rows.map((row) =>
      Object.freeze({
        characterId: row.characterId,
        factKey: row.factKey,
        sourceAuthority: row.sourceAuthority,
        value: row.value,
        sourceReleaseId: row.releaseId,
        sourceSection: row.sourceSection,
        sourceBibleDocument: row.sourceBibleDocument,
        sourceBibleRevision: row.sourceBibleRevision,
      }),
    ),
  );

  return Object.freeze({
    schemaVersion: 'v1',
    releaseId: identity.releaseId,
    characterId: identity.characterId,
    providerContext: projectCharacterRuntimeContextForRendererV1(context),
    admittedPublicFactCount: rows.length,
  });
}
