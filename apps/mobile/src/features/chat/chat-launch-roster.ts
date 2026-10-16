import type { ChatLaunchCharacterIdV1 } from '@myeongha/api-client';

export interface MobileChatLaunchCharacterV1 {
  readonly characterId: ChatLaunchCharacterIdV1;
  readonly displayName: string;
}

/**
 * Historical identity resolution only: de-listing a Character does not remove
 * ownership of previously created threads or change the server's ID contract.
 */
export const MOBILE_CHAT_KNOWN_CHARACTERS_V1 = Object.freeze([
  Object.freeze({ characterId: 'seyeon', displayName: '세연' }),
  Object.freeze({ characterId: 'yeoul', displayName: '여울' }),
  Object.freeze({ characterId: 'seorin', displayName: '서린' }),
  Object.freeze({ characterId: 'rahyeon', displayName: '라현' }),
  Object.freeze({ characterId: 'mira', displayName: '미라' }),
  Object.freeze({ characterId: 'taegyeom', displayName: '태겸' }),
  Object.freeze({ characterId: 'yunho', displayName: '윤호' }),
  Object.freeze({ characterId: 'doyun', displayName: '도윤' }),
  Object.freeze({ characterId: 'baekheon', displayName: '백헌' }),
] satisfies readonly MobileChatLaunchCharacterV1[]);

/** Presentation-only launch visibility. Not server publication/capability authority. */
export const MOBILE_CHAT_LAUNCH_ROSTER_V1 = Object.freeze(
  MOBILE_CHAT_KNOWN_CHARACTERS_V1.filter(
    ({ characterId }) => characterId !== 'seorin'
      && characterId !== 'mira'
      && characterId !== 'doyun',
  ),
);

/** Inactive historical identities: display at the bottom, never send to Chat Open. */
export const MOBILE_CHAT_PENDING_ROSTER_V1 = Object.freeze(
  ['doyun', 'seorin', 'mira'].flatMap(characterId => {
    const match = MOBILE_CHAT_KNOWN_CHARACTERS_V1.find(character => character.characterId === characterId);
    return match === undefined ? [] : [match];
  }),
);
