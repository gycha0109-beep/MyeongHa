import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * Only the local Chat Hub's fixed error/status messages are translated.
 * Never translate messages from a server, Character names, or private chat.
 */
const CHAT_HUB_ERROR_ROWS_V1 = [
  [
    "대화를 시작하려면 마이 탭에서 로그인해 주세요.",
    "会話を始めるには、マイページでログインしてください。",
    "若要開始對話，請先前往「我的」分頁登入。",
    "Sign in from the My tab to start a conversation.",
    "要开始对话，请先在“我的”页面登录。"
  ],
  [
    "현재 이 대화 상대를 사용할 수 없습니다.",
    "現在、この会話相手は利用できません。",
    "目前無法使用這位對話角色。",
    "This conversation partner is currently unavailable.",
    "目前无法使用这位对话角色。"
  ],
  [
    "기존 대화 상태를 안전하게 열 수 없습니다.",
    "既存の会話状態を安全に開くことができません。",
    "無法安全開啟既有對話狀態。",
    "We cannot safely open the existing conversation state.",
    "无法安全打开现有对话状态。"
  ],
  [
    "현재 대화 콘텐츠를 준비 중입니다.",
    "現在、会話コンテンツを準備中です。",
    "目前正在準備對話內容。",
    "Conversation content is currently being prepared.",
    "目前正在准备对话内容。"
  ],
  [
    "대화 서버에 연결하지 못했습니다.",
    "会話サーバーに接続できませんでした。",
    "無法連線至對話伺服器。",
    "Could not connect to the conversation server.",
    "无法连接对话服务器。"
  ],
  [
    "대화를 시작하지 못했습니다.",
    "会話を開始できませんでした。",
    "無法開始對話。",
    "Could not start the conversation.",
    "无法开始对话。"
  ],
  [
    "회원 상태를 확인하지 못했습니다.",
    "会員状態を確認できませんでした。",
    "無法確認會員狀態。",
    "Could not verify your member status.",
    "无法验证会员状态。"
  ]
] as const;
const BY_SOURCE: ReadonlyMap<string, readonly [string,string,string,string]> =
  new Map(CHAT_HUB_ERROR_ROWS_V1.map(([ko, ja, tw, en, cn]) =>
    [ko, [ja, tw, en, cn] as const] as const));

export const MOBILE_CHAT_HUB_AUTHORED_ERROR_KEYS_V1: readonly string[] =
  Object.freeze(CHAT_HUB_ERROR_ROWS_V1.map(([source]) => source));

export function localizeMobileChatHubErrorV1(source: string, locale: MobileUiLocale): string {
  if (locale === 'ko-KR') return source;
  const row = BY_SOURCE.get(source);
  if (row === undefined) return source;
  switch (locale) {
    case 'ja-JP': return row[0];
    case 'zh-TW': return row[1];
    case 'en-US': return row[2];
    case 'zh-CN': return row[3];
  }
}
