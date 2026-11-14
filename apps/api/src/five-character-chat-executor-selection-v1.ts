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


// Product-owner-approved first-web-launch target set (2026-11-14).
// This is an admission contract, not publication or a runtime activation.
// Existing five-character callers remain unchanged until the independently
// approved Yunho executor and content release are installed.
export const SIX_CHARACTER_WEB_LAUNCH_CHAT_TARGETS_V1 = Object.freeze([
  ...FIVE_CHARACTER_CHAT_TARGETS_V1,
  'yunho',
] as const);

export type SixCharacterWebLaunchChatTargetV1 =
  (typeof SIX_CHARACTER_WEB_LAUNCH_CHAT_TARGETS_V1)[number];

/**
 * Six-character launch admission. An absent Yunho executor or unpublished
 * source-backed manifest MUST fail closed; no Se-yeon fallback is allowed.
 */
export function selectPublishedSixCharacterWebLaunchChatExecutorV1<T>(
  binding: ChatThreadRuntimeBindingV1,
  manifest: ContentBundleManifestReadResponseV1,
  registeredExecutors: Readonly<Partial<Record<SixCharacterWebLaunchChatTargetV1, T>>>,
): Readonly<{ characterId: SixCharacterWebLaunchChatTargetV1; executor: T }> {
  const participantIds = binding.participantCharacterIds;
  if (
    participantIds.length !== 1 ||
    !SIX_CHARACTER_WEB_LAUNCH_CHAT_TARGETS_V1.some(id => id === participantIds[0])
  ) {
    throw new CharacterChatExecutorUnavailableV1(
      'Thread does not have exactly one approved first-launch Character.',
    );
  }
  const characterId = participantIds[0] as SixCharacterWebLaunchChatTargetV1;
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
