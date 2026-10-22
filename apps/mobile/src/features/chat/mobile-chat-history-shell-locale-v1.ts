import { normalizeMobileUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * I18N-07 authorized UI shell only: pre-existing Chat read states and
 * privacy HOLD notices. No message, openingLine, errorCode, Character
 * biography or server-owned conversation content is passed into this module.
 * The existing history-reveal gate and send admission remain authoritative.
 */
const COPY = Object.freeze({
  'ko-KR': Object.freeze({
    loading: '대화 기록을 불러오는 중입니다…',
    holdTitle: '세연 대화 기록을 현재 표시할 수 없습니다',
    holdDescription: '개인정보 보호를 위한 서버 확인이 끝나지 않아 대화 기록을 표시할 수 없습니다. 반복해서 불러와도 해제되지 않습니다.',
    holdComposerTitle: '세연 대화는 서버의 보호 조치로 잠시 중단되었습니다',
    holdComposerDescription: '대화 기록과 메시지 보내기는 개인정보 공개 권한 검증이 끝난 뒤 이용할 수 있습니다. 앱을 다시 설치해도 이 제한은 해제되지 않습니다.',
    errorTitle: '대화를 불러오지 못했습니다',
    errorDescription: '대화 기록을 확인하지 못했습니다. 아래에서 다시 불러올 수 있습니다.',
    errorCodeLabel: '오류 코드',
    empty: '아직 표시할 메시지가 없습니다',
    retry: '대화 다시 불러오기 ↻',
    end: '현재 확인할 수 있는 기록의 끝입니다.',
    next: '다음 메시지 불러오기',
    profile: '프로필',
    headerUnknownParticipant: '대화 상대',
    headerVerifiedRoom: '서버가 확인한 대화방',
    headerHistoryLabel: '대화 기록',
    headerPortrait: '연결자 초상화',
  }),
  'ja-JP': Object.freeze({
    loading: '会話履歴を読み込んでいます…',
    holdTitle: '現在、セヨンとの会話履歴を表示できません',
    holdDescription: '個人情報保護のためのサーバー確認が完了していないため、会話履歴を表示できません。繰り返し読み込んでも制限は解除されません。',
    holdComposerTitle: 'サーバー側の保護措置により、セヨンとの会話を一時停止しています',
    holdComposerDescription: '会話履歴の閲覧とメッセージ送信は、個人情報の開示権限が確認された後に利用できます。アプリを再インストールしても制限は解除されません。',
    errorTitle: '会話を読み込めませんでした',
    errorDescription: '会話履歴を確認できませんでした。下の操作から再度読み込めます。',
    errorCodeLabel: 'エラーコード',
    empty: '表示できるメッセージはまだありません',
    retry: '会話を再読み込み ↻',
    end: '現在確認できる履歴はここまでです。',
    next: '次のメッセージを読み込む',
    profile: 'プロフィール',
    headerUnknownParticipant: '会話相手',
    headerVerifiedRoom: 'サーバー確認済みの会話ルーム',
    headerHistoryLabel: '会話履歴',
    headerPortrait: '案内人の肖像',
  }),
  'zh-TW': Object.freeze({
    loading: '正在載入對話紀錄…',
    holdTitle: '目前無法顯示與世妍的對話紀錄',
    holdDescription: '為保護個人資料，伺服器尚未完成確認，因此無法顯示對話紀錄。重複載入也不會解除限制。',
    holdComposerTitle: '伺服器基於保護措施暫時停止與世妍的對話',
    holdComposerDescription: '對話紀錄閱覽及訊息傳送須待個人資料公開權限驗證完成後才能使用。重新安裝應用程式也無法解除此限制。',
    errorTitle: '無法載入對話',
    errorDescription: '無法確認對話紀錄，可使用下方操作重新載入。',
    errorCodeLabel: '錯誤代碼',
    empty: '目前沒有可顯示的訊息',
    retry: '重新載入對話 ↻',
    end: '目前可確認的對話紀錄已全部顯示。',
    next: '載入更多訊息',
    profile: '個人檔案',
    headerUnknownParticipant: '對話對象',
    headerVerifiedRoom: '伺服器已確認的對話室',
    headerHistoryLabel: '對話紀錄',
    headerPortrait: '引路人肖像',
  }),
} as const);

export function projectMobileChatHistoryShellV1(requestedUiLocale: unknown) {
  const uiLocale = normalizeMobileUiLocale(requestedUiLocale);
  return Object.freeze({
    uiLocale,
    ...COPY[uiLocale],
    translatedMessageBody: false as const,
    translatedGreeting: false as const,
    privacyHoldBypassed: false as const,
    readerOutputLocalized: false as const,
  });
}
