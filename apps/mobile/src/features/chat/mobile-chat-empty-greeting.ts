import type { MobileChatThreadSnapshotV1 } from './mobile-chat-read-repository.js';
import { MOBILE_CHAT_LAUNCH_ROSTER_V1 } from './chat-launch-roster.js';
import { resolveMobileChatCharacterPresentationV1 } from './chat-character-presentation.js';

export type MobileChatEmptyGreetingInputV1 = Pick<
  MobileChatThreadSnapshotV1,
  'status' | 'characterId' | 'messages' | 'hasMore'
>;

/**
 * Presentation-only greeting, matching the web Character Room's data-chat-intro.
 *
 * Never represent this line as a persisted server message, a granted Reader
 * interpretation or an admission ticket. Only a verified empty history from
 * the server may produce it.
 */
export function projectMobileChatEmptyGreetingV1(
  snapshot: MobileChatEmptyGreetingInputV1,
): Readonly<{
  characterId: (typeof MOBILE_CHAT_LAUNCH_ROSTER_V1)[number]['characterId'];
  displayName: string;
  openingLine: string;
}> | null {
  if (snapshot.status !== 'ready' ||
      snapshot.messages.length !== 0 ||
      snapshot.hasMore ||
      snapshot.characterId === null) {
    return null;
  }

  const character = MOBILE_CHAT_LAUNCH_ROSTER_V1.find(
    (entry) => entry.characterId === snapshot.characterId,
  );
  if (!character) return null;

  const presentation = resolveMobileChatCharacterPresentationV1(character.characterId);
  return Object.freeze({
    characterId: character.characterId,
    displayName: character.displayName,
    openingLine: presentation.openingLine,
  });
}
