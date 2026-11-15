import type { ChatThreadRuntimeBindingV1 } from './chat-thread-runtime-binding-read.js';
import type { ContentBundleManifestReadResponseV1 } from './content-bundle-manifest-read.js';

/** Real-chat target set; discovery is a separate, unchanged six-person UI. */
export const FIVE_CHARACTER_CHAT_TARGETS_V1 = Object.freeze([
  'seyeon',
  'baekheon',
  'yeoul',
  'rahyeon',
  'taegyeom',
] as const);

export type FiveCharacterChatTargetV1 =
  (typeof FIVE_CHARACTER_CHAT_TARGETS_V1)[number];

export class CharacterChatExecutorUnavailableV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterChatExecutorUnavailableV1';
  }
}

/**
 * Server-side dispatch decision, never inferred from a browser query string.
 * The caller must obtain the Member-owned binding and immutable manifest
 * through their existing trusted DB authority ports, then supply actual
 * installed execution ports. Missing runtimes are denied; there is no
 * fallback to Se-yeon's prompt, model context, ledger or receipt issuer.
 *
 * This is dispatch admission only. A registered execution port remains
 * responsible for exact owner verification, AI cost reservation/settlement,
 * source provenance, durable commit and receipt ACK.
 */
export function selectPublishedFiveCharacterChatExecutorV1<T>(
  binding: ChatThreadRuntimeBindingV1,
  manifest: ContentBundleManifestReadResponseV1,
  registeredExecutors: Readonly<Partial<Record<FiveCharacterChatTargetV1, T>>>,
): Readonly<{ characterId: FiveCharacterChatTargetV1; executor: T }> {
  const participantIds = binding.participantCharacterIds;
  if (
    participantIds.length !== 1 ||
    !FIVE_CHARACTER_CHAT_TARGETS_V1.some(id => id === participantIds[0])
  ) {
    throw new CharacterChatExecutorUnavailableV1(
      'Thread does not have exactly one approved live-chat Character.',
    );
  }
  const characterId = participantIds[0] as FiveCharacterChatTargetV1;
  if (
    binding.activeContentBundleId !== manifest.contentBundleId ||
    !manifest.manifest.characterIds.includes(characterId)
  ) {
    throw new CharacterChatExecutorUnavailableV1(
      'Server-pinned content does not publish this Character.',
    );
  }

  if (!Object.hasOwn(registeredExecutors, characterId)) {
    throw new CharacterChatExecutorUnavailableV1(
      'No independently installed production executor for this Character.',
    );
  }
  const executor = registeredExecutors[characterId];
  if (executor === undefined || executor === null) {
    throw new CharacterChatExecutorUnavailableV1(
      'Registered production executor is unavailable.',
    );
  }

  return Object.freeze({ characterId, executor });
}
