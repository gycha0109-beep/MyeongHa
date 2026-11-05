import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * Client-authored Chat composer status only. Original send statuses, retry IDs,
 * user draft, server transcript and server authorization remain untouched.
 */
const STATUS_COPY_ROWS_V1 = [
  [
    "세연과 대화하려면 마이에서 로그인해 주세요.",
    "セヨンと話すには「マイ」でログインしてください。",
    "如要與世妍對話，請先前往「我的」登入。",
    "Sign in from My to chat with Seyeon.",
    "要与世妍对话，请先在“我的”页面登录。"
  ],
  [
    "로그인이 만료되었습니다. 다시 로그인해 주세요.",
    "ログインの有効期限が切れました。もう一度ログインしてください。",
    "登入已逾時，請重新登入。",
    "Your session expired. Please sign in again.",
    "登录已过期，请重新登录。"
  ],
  [
    "회원만 메시지를 보낼 수 있습니다.",
    "メッセージを送信できるのは会員のみです。",
    "只有會員可以傳送訊息。",
    "Only members can send messages.",
    "只有会员可以发送消息。"
  ],
  [
    "이 대화방에 접근할 수 없습니다.",
    "この会話ルームにはアクセスできません。",
    "無法存取此對話室。",
    "You cannot access this conversation.",
    "无法访问此对话。"
  ],
  [
    "현재 세연 대화 콘텐츠를 사용할 수 없습니다.",
    "現在、セヨンとの会話コンテンツを利用できません。",
    "目前無法使用世妍的對話內容。",
    "Seyeon's conversation content is currently unavailable.",
    "目前无法使用世妍的对话内容。"
  ],
  [
    "이전 메시지가 처리 중입니다. 잠시 후 다시 보내 주세요.",
    "前のメッセージを処理中です。しばらくしてから再送信してください。",
    "上一則訊息仍在處理中，請稍後再傳送。",
    "A previous message is still processing. Please try sending again shortly.",
    "上一条消息仍在处理中，请稍后再发送。"
  ],
  [
    "전송 식별자가 충돌했습니다. 다시 보내 주세요.",
    "送信識別子が競合しました。もう一度送信してください。",
    "傳送識別碼發生衝突，請再次傳送。",
    "The send identifier conflicted. Please try again.",
    "发送标识发生冲突，请重新发送。"
  ],
  [
    "세연의 답변 생성이 지연되고 있습니다. 다시 시도해 주세요.",
    "セヨンの返信生成が遅れています。もう一度お試しください。",
    "世妍的回覆產生有所延遲，請重試。",
    "Seyeon's reply is taking longer than expected. Please try again.",
    "世妍的回复生成有所延迟，请重试。"
  ],
  [
    "답변 처리 후 기록을 확인하지 못했습니다. 같은 문장으로 다시 보내 확인할 수 있습니다.",
    "返信処理後の会話記録を確認できませんでした。同じ文章を再送信して確認できます。",
    "回覆處理後無法確認對話紀錄。您可以重新傳送相同文字以確認。",
    "We could not verify the conversation after processing. Resend the same text to check without duplicating it.",
    "回复处理后无法确认对话记录。可以重新发送相同内容以确认。"
  ],
  [
    "메시지를 보내지 못했습니다. 문장을 보존했습니다. 다시 시도해 주세요.",
    "メッセージを送信できませんでした。入力した文章は保持されています。もう一度お試しください。",
    "訊息傳送失敗，已保留輸入內容。請重試。",
    "Could not send the message. Your text is preserved. Please try again.",
    "消息发送失败，已保留输入内容。请重试。"
  ],
  [
    "완료되지 않은 메시지를 복원했습니다. 다시 보내면 중복 없이 이어집니다.",
    "未完了のメッセージを復元しました。再送信しても重複せずに続行できます。",
    "已還原未完成的訊息。再次傳送不會產生重複內容。",
    "Your unfinished message was restored. Resend to continue without duplicates.",
    "已恢复未完成的消息。重新发送不会产生重复内容。"
  ],
  [
    "이전 전송 내용을 확인할 수 없습니다.",
    "以前の送信内容を確認できません。",
    "無法確認先前傳送的內容。",
    "Could not verify the previous send.",
    "无法确认之前发送的内容。"
  ],
  [
    "메시지는 1~8,000자로 입력해 주세요.",
    "メッセージは1〜8,000文字で入力してください。",
    "訊息長度須介於 1 至 8,000 字元之間。",
    "Enter a message between 1 and 8,000 characters.",
    "消息长度须为 1 至 8,000 个字符。"
  ],
  [
    "세연이 답하고 있습니다…",
    "セヨンが返信しています…",
    "世妍正在回覆…",
    "Seyeon is replying…",
    "世妍正在回复…"
  ],
  [
    "세연의 답변이 도착했습니다.",
    "セヨンから返信が届きました。",
    "已收到世妍的回覆。",
    "Seyeon's reply has arrived.",
    "已收到世妍的回复。"
  ]
] as const;
const BY_SOURCE: ReadonlyMap<string, readonly [string, string, string, string]> =
  new Map(STATUS_COPY_ROWS_V1.map(([source, ja, tw, en, cn]) =>
    [source, [ja, tw, en, cn] as const] as const));

export const MOBILE_CHAT_COMPOSER_AUTHORED_STATUS_KEYS_V1: readonly string[] =
  Object.freeze(STATUS_COPY_ROWS_V1.map(([source]) => source));

export function localizeMobileChatComposerStatusV1(source: string, locale: MobileUiLocale): string {
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
