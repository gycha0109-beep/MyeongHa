import {
  openMemberCharacterThreadV1,
  type ChatLaunchCharacterIdV1,
  type ChatOpenResultV1,
  type MyeongHaApiClientV1,
} from '@myeongha/api-client';

import type { MobileMemberSessionCoordinatorV1 } from '@/core/session/mobile-member-session';

export interface MobileChatOpenServiceV1 {
  open(characterId: ChatLaunchCharacterIdV1): Promise<ChatOpenResultV1>;
}

export function createMobileChatOpenServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly memberSession: Pick<MobileMemberSessionCoordinatorV1, 'withMemberBearer'>;
}): MobileChatOpenServiceV1 {
  return Object.freeze({
    open(characterId: ChatLaunchCharacterIdV1) {
      return input.memberSession.withMemberBearer((bearer) =>
        openMemberCharacterThreadV1(input.client, bearer, characterId),
      );
    },
  });
}
