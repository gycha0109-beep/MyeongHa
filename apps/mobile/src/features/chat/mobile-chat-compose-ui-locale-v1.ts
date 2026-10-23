import { normalizeMobileLegacySourceUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * I18N-07 allowed presentation subset: authored Chat composer messages only.
 * No status from the server, Chat body, Character voice, send permission,
 * session authority or output locale is inferred or translated here.
 */
const COPY = Object.freeze({
  'ko-KR': Object.freeze({
    checkingCharacter: '대화 상대를 확인하고 있습니다',
    waitingForHistory: '대화 기록을 확인한 뒤 메시지를 보낼 수 있습니다',
    characterNotReady: '이 캐릭터의 AI 대화는 준비 중입니다',
    retryRoom: '대화방 기록을 불러오지 못한 경우 다시 입장해 주세요.',
    nonSeyeonNotice: '캐릭터 대화방과 기록은 이용할 수 있으며, AI 답변 기능은 추후 열립니다.',
    placeholder: '세연에게 하고 싶은 말을 적어주세요',
  }),
  'ja-JP': Object.freeze({
    checkingCharacter: '会話相手を確認しています',
    waitingForHistory: '会話履歴の確認後にメッセージを送信できます',
    characterNotReady: 'このキャラクターのAI会話は準備中です',
    retryRoom: '会話履歴を読み込めない場合は、会話ルームに入り直してください。',
    nonSeyeonNotice: 'キャラクターの会話ルームと履歴は利用できますが、AI応答機能は今後提供予定です。',
    placeholder: 'メッセージを入力してください',
  }),
  'zh-TW': Object.freeze({
    checkingCharacter: '正在確認對話對象',
    waitingForHistory: '確認對話紀錄後才能傳送訊息',
    characterNotReady: '此角色的 AI 對話功能尚在準備中',
    retryRoom: '若無法載入對話紀錄，請重新進入對話室。',
    nonSeyeonNotice: '目前可使用角色對話室與紀錄，AI 回覆功能尚未開放。',
    placeholder: '請輸入訊息',
  }),
} as const);

export type MobileChatComposeUiStatusV1 = 'checking_character' | 'waiting_history' | 'character_not_ready';

/**
 * Only the caller's existing snapshot/allow predicates determine the state;
 * the projection never claims permission to send or advances readiness.
 */
export function projectMobileChatComposeUiV1(requestedUiLocale: unknown, blockedStatus: MobileChatComposeUiStatusV1) {
  const uiLocale = normalizeMobileLegacySourceUiLocale(requestedUiLocale);
  const copy = COPY[uiLocale];
  const blockedTitle = blockedStatus === 'checking_character'
    ? copy.checkingCharacter
    : blockedStatus === 'waiting_history'
      ? copy.waitingForHistory
      : copy.characterNotReady;
  const blockedDescription = blockedStatus === 'waiting_history' ? copy.retryRoom : copy.nonSeyeonNotice;
  return Object.freeze({
    uiLocale,
    blockedTitle,
    blockedDescription,
    placeholder: copy.placeholder,
    translatedChatSource: false as const,
    readerOutputLocalized: false as const,
    sendAllowedByLocale: false as const,
  });
}
