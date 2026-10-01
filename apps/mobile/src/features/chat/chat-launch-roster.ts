import type { ChatLaunchCharacterIdV1 } from '@myeongha/api-client';

export interface MobileChatLaunchCharacterV1 {
  readonly characterId: ChatLaunchCharacterIdV1;
  readonly displayName: string;
}

export const MOBILE_CHAT_LAUNCH_ROSTER_V1 = Object.freeze([
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
