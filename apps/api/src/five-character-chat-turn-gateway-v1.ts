// Watchtower-Track: character-memory
// Server-only execution gateway for the five requested live-chat targets.
// Registration is a trusted composition-root decision, never client data.
// This gateway does not install any Character provider, receipt issuer or route.
import {
  getChatThreadRuntimeBinding,
  type ChatThreadRuntimeBindingReadAuthorityPortV1,
  type ChatThreadRuntimeBindingV1,
} from './chat-thread-runtime-binding-read.js';
import {
  getContentBundleManifest,
  type ContentBundleManifestReadAuthorityPortV1,
  type ContentBundleManifestReadResponseV1,
} from './content-bundle-manifest-read.js';
import {
  selectPublishedFiveCharacterChatExecutorV1,
  type FiveCharacterChatTargetV1,
} from './five-character-chat-executor-selection-v1.js';
import type { RequestUiLocaleV1 } from './request-ui-locale-v1.js';
import {
  evaluateCharacterContentCompatibilityV1,
  type CharacterClientCompatibilityProfileV1,
} from '../../../packages/domain/src/character-content-compatibility.js';
import { ApiCommandError } from './api-error.js';
import { FOUR_CHARACTER_CHAT_MAX_MESSAGE_UTF16_CODE_UNITS_V1 } from './four-character-chat-length-limits-v1.js';

export interface TrustedFiveCharacterChatTurnV1 {
  readonly characterId: FiveCharacterChatTargetV1;
  /** Canonical Member Subject, resolved before entry by the server identity runner. */
  readonly subjectId: string;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly text: string;
  readonly replyLocale: RequestUiLocaleV1;
  /** Immutable server-owned thread Pin; no new release selection or rebinding. */
  readonly pinnedReleaseId: string;
  readonly pinnedBundleId: string;
  readonly threadBinding: ChatThreadRuntimeBindingV1;
  readonly bundleManifest: ContentBundleManifestReadResponseV1;
}

/**
 * Per-Character executor owns the full cost reservation, AI inference,
 * durable answer/receipt commit, current-rights reveal and recipient ACK.
 * Nothing in this gateway makes an uninstalled Character executable.
 */
export type FiveCharacterChatTurnExecutorV1<TResult> = (
  turn: TrustedFiveCharacterChatTurnV1,
) => Promise<TResult>;

export interface RunPublishedFiveCharacterChatTurnInputV1<TResult> {
  /** Passed from a verified Member Subject transaction, never from JSON. */
  readonly resolvedSubjectId: string;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly text: string;
  readonly replyLocale: RequestUiLocaleV1;
  readonly bindingAuthorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
  readonly manifestAuthorityPort: ContentBundleManifestReadAuthorityPortV1;
  /** Exact published profile is certified by the server for this Character.
   * Absent/unsupported assets, cues or capability must reject before any AI call.
   */
  readonly compatibilityProfiles: Readonly<Partial<Record<
    FiveCharacterChatTargetV1, CharacterClientCompatibilityProfileV1
  >>>;
  /** Only real independently wired server executors may be registered. */
  readonly registeredExecutors: Readonly<Partial<Record<
    FiveCharacterChatTargetV1, FiveCharacterChatTurnExecutorV1<TResult>
  >>>;
}

export interface RunPublishedFiveCharacterChatTurnResultV1<TResult> {
  readonly characterId: FiveCharacterChatTargetV1;
  readonly threadBinding: ChatThreadRuntimeBindingV1;
  readonly bundleManifest: ContentBundleManifestReadResponseV1;
  /** Raw internal executor result; never directly serialize to a public HTTP response. */
  readonly execution: TResult;
}

function bounded(value: string, name: string, limit: number): string {
  if (typeof value !== 'string') {
    throw new Error('Five-Character Chat ' + name + ' is invalid.');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > limit) {
    throw new Error('Five-Character Chat ' + name + ' is outside allowed bounds.');
  }
  return trimmed;
}

export async function runPublishedFiveCharacterChatTurnV1<TResult>(
  input: RunPublishedFiveCharacterChatTurnInputV1<TResult>,
): Promise<RunPublishedFiveCharacterChatTurnResultV1<TResult>> {
  const subjectId = bounded(input.resolvedSubjectId, 'subjectId', 256);
  const threadId = bounded(input.threadId, 'threadId', 256);
  const clientTurnId = bounded(input.clientTurnId, 'clientTurnId', 256);
  const text = bounded(input.text, 'text', FOUR_CHARACTER_CHAT_MAX_MESSAGE_UTF16_CODE_UNITS_V1);

  // Both reads must go through server-authorized, Member-owned DB read ports.
  // The client cannot name the Character, bundle, release or execution port.
  const threadBinding = await getChatThreadRuntimeBinding({
    resolvedSubjectId: subjectId,
    threadId,
    authorityPort: input.bindingAuthorityPort,
  });
  const bundleManifest = await getContentBundleManifest({
    contentBundleId: threadBinding.activeContentBundleId,
    authorityPort: input.manifestAuthorityPort,
  });
  const selected = selectPublishedFiveCharacterChatExecutorV1(
    threadBinding,
    bundleManifest,
    input.registeredExecutors,
  );

  // The profile is server-installed for the same exact selected Character,
  // never a browser-selected capability/asset hash. A future published lane
  // cannot bypass client compatibility just because its DB Pin is valid.
  const profile = input.compatibilityProfiles[selected.characterId];
  if (profile === undefined) {
    throw new ApiCommandError(
      'CAPABILITY_UNAVAILABLE',
      'Published Character has no approved server-owned client profile.',
    );
  }
  const decision = evaluateCharacterContentCompatibilityV1({
    manifest: {
      minClientCapability: bundleManifest.manifest.minClientCapability,
      assetManifestHash: bundleManifest.manifest.assetManifestHash,
      cueSchemaVersion: bundleManifest.manifest.cueSchemaVersion,
    },
    clientProfile: profile,
  });
  if (!decision.compatible || decision.action !== 'activate') {
    throw new ApiCommandError(
      decision.failures.includes('INVALID_COMPATIBILITY_INPUT')
        ? 'CAPABILITY_UNAVAILABLE' : 'CONTENT_INCOMPATIBLE',
      'Published Character bundle is incompatible with the approved client profile.',
    );
  }

  // No provider/receipt work is permitted until all immutable authority
  // checks, per-Character registration and client compatibility complete.
  const execution = await selected.executor(Object.freeze({
    characterId: selected.characterId,
    subjectId,
    threadId,
    clientTurnId,
    text,
    replyLocale: input.replyLocale,
    pinnedReleaseId: threadBinding.activeContentReleaseId,
    pinnedBundleId: threadBinding.activeContentBundleId,
    threadBinding,
    bundleManifest,
  }));
  return Object.freeze({
    characterId: selected.characterId,
    threadBinding,
    bundleManifest,
    execution,
  });
}
