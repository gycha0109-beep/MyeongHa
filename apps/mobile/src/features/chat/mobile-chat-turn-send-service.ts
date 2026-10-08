import {
  sendSeyeonChatTurnV1,
  type MyeongHaApiClientV1,
  type SeyeonChatTurnSendRequestV1,
  type SeyeonChatTurnSendResultV1,
} from '@myeongha/api-client';

import type {
  MobileMemberSessionCoordinatorV1,
} from '@/core/session/mobile-member-session';

export class MobileChatTurnSendErrorV1 extends Error {
  constructor(
    readonly code: 'MOBILE_CHAT_TURN_SEND_UNAVAILABLE',
  ) {
    super('현재 모바일 메시지 전송은 세연 대화에서만 사용할 수 있습니다.');
    this.name = 'MobileChatTurnSendErrorV1';
  }
}

export interface MobileChatTurnSendInputV1 {
  readonly threadId: string;
  readonly characterId: string | null;
  readonly request: SeyeonChatTurnSendRequestV1;
}

export interface MobileChatTurnSendServiceV1 {
  send(input: MobileChatTurnSendInputV1): Promise<SeyeonChatTurnSendResultV1>;
}

export function createMobileChatTurnSendServiceV1(input: {
  readonly client: MyeongHaApiClientV1;
  readonly memberSession: Pick<MobileMemberSessionCoordinatorV1, 'withMemberBearer'>;
}): MobileChatTurnSendServiceV1 {
  return Object.freeze({
    async send(turn: MobileChatTurnSendInputV1) {
      if (turn.characterId !== 'seyeon') {
        throw new MobileChatTurnSendErrorV1('MOBILE_CHAT_TURN_SEND_UNAVAILABLE');
      }

      return input.memberSession.withMemberBearer((bearer) =>
        sendSeyeonChatTurnV1(
          input.client,
          bearer,
          turn.threadId,
          turn.request,
        ),
      );
    },
  });
}
