import type { MobileOfficialReadingReaderEntryStatusV1 } from '../features/reading/mobile-official-reading-reader-entry-view-model.js';

/**
 * I18N-07 EN-UI-B/CN-UI-B: authored, staged protective interface copy.
 * These locales are NOT admitted by normalizeMobileUiLocale, provider, API,
 * official Reading, Chat, Persona or Reader generation. UI-only authoring data
 * for future display acceptance; never translate incoming source messages.
 */
export const PLANNED_PROTECTED_UI_LOCALES_V1 = ['en-US', 'zh-CN'] as const;
export type PlannedProtectedUiLocaleV1 = typeof PLANNED_PROTECTED_UI_LOCALES_V1[number];

const COPY = Object.freeze({
  'en-US': Object.freeze({
  "chat": {
    "loading": "Loading conversation history…",
    "holdTitle": "Conversation history is currently unavailable",
    "holdDescription": "The server has not completed the privacy verification required to show this conversation history. Reloading repeatedly will not lift this restriction.",
    "holdComposerTitle": "This conversation is temporarily paused by a server protection measure",
    "holdComposerDescription": "Viewing conversation history and sending messages require server verification of personal-data disclosure permission. Reinstalling the app will not remove this restriction.",
    "errorTitle": "Could not load the conversation",
    "errorDescription": "The conversation history could not be verified. You can try loading it again below.",
    "errorCodeLabel": "Error code",
    "empty": "No messages to display yet",
    "retry": "Reload conversation ↻",
    "end": "You have reached the end of the available history.",
    "next": "Load more messages",
    "profile": "Profile",
    "headerUnknownParticipant": "Conversation partner",
    "headerVerifiedRoom": "Server-verified conversation",
    "headerHistoryLabel": "Conversation history",
    "headerPortrait": "Guide portrait"
  },
  "composer": {
    "checkingCharacter": "Checking the conversation partner",
    "waitingForHistory": "You can send messages after the conversation history is verified",
    "characterNotReady": "AI chat is not yet available for this character",
    "retryRoom": "If the conversation history cannot be loaded, reopen the chat room.",
    "nonSeyeonNotice": "You can access the character's chat room and history, but AI replies are not yet available.",
    "placeholder": "Write a message"
  },
  "originalTextNotices": {
    "chat": "Only the interface language changes. Chat messages remain in their original language and are not automatically translated.",
    "reading": "Only the interface language changes. The original reading text remains unchanged and is not automatically translated."
  },
  "reader": {
    "eyebrow": "GUIDE · Not yet available",
    "title": "Guide for this official Saju reading",
    "description": "This introduction relates to the official reading. Guide commentary and follow-up conversations are not available.",
    "viewIntroduction": "View introduction",
    "viewIntroductionHint": "This only changes the introduction being viewed. It does not start paid commentary.",
    "preview": "Introduction preview",
    "conceptPending": "Character concept in preparation",
    "selectionBoundary": "This selection only displays an introduction. It does not create purchase access, permission to view an official reading, or a dedicated conversation thread.",
    "statusTitle": "Commentary access status",
    "sourceNotice": "Character introductions remain in their original language and are not translated when the interface language changes.",
    "disabledLabel": "Commentary not yet available",
    "disabledAccessibilityLabel": "Guide commentary entry is disabled",
    "authorityBoundary": "A guide introduction or link to a record does not prove product eligibility, purchase access, release approval, or permission to view the official reading.",
    "statusMessages": Object.freeze({
      "public_route_off": "Official guide commentary has not been released.",
      "server_verification_required": "The server must verify product eligibility, purchase access, release approval and access to the official reading.",
      "product_unsupported": "This product does not support commentary from this guide.",
      "purchase_access_required": "Purchase access for this commentary has not been verified.",
      "release_approval_pending": "This guide's commentary is awaiting release approval.",
      "release_temporarily_unavailable": "This guide's commentary is currently unavailable.",
      "official_reading_access_denied": "Access to commentary for this official reading is not permitted.",
      "retryable_verification_failure": "A temporary server verification error occurred. Commentary access remains blocked.",
      "protected_verification_failure": "Permissions or the response could not be verified safely. Commentary access has been blocked.",
      "server_admission_required": "Even after individual checks, entering commentary requires separate server approval."
    })
  }
}),
  'zh-CN': Object.freeze({
  "chat": {
    "loading": "正在加载对话记录…",
    "holdTitle": "目前无法显示对话记录",
    "holdDescription": "服务器尚未完成个人信息保护所需的核验，因此无法显示对话记录。重复加载不会解除此限制。",
    "holdComposerTitle": "服务器的保护措施已暂时暂停此对话",
    "holdComposerDescription": "查看对话记录和发送消息须先通过服务器对个人信息披露权限的核验。重新安装应用也不会解除此限制。",
    "errorTitle": "无法加载对话",
    "errorDescription": "无法核实对话记录。您可以在下方重新尝试加载。",
    "errorCodeLabel": "错误代码",
    "empty": "暂无可显示的消息",
    "retry": "重新加载对话 ↻",
    "end": "当前可查看的对话记录已全部显示。",
    "next": "加载更多消息",
    "profile": "个人资料",
    "headerUnknownParticipant": "对话对象",
    "headerVerifiedRoom": "服务器已核实的对话室",
    "headerHistoryLabel": "对话记录",
    "headerPortrait": "引路人肖像"
  },
  "composer": {
    "checkingCharacter": "正在核实对话对象",
    "waitingForHistory": "核实对话记录后才能发送消息",
    "characterNotReady": "此角色的 AI 对话功能尚未开放",
    "retryRoom": "如果无法加载对话记录，请重新进入对话室。",
    "nonSeyeonNotice": "您可以查看角色对话室和记录，但 AI 回复功能尚未开放。",
    "placeholder": "请输入消息"
  },
  "originalTextNotices": {
    "chat": "仅切换界面语言。对话消息保留原文，不会自动翻译。",
    "reading": "仅切换界面语言。解读正文保留原文，不会自动翻译。"
  },
  "reader": {
    "eyebrow": "引路人 · 尚未开放",
    "title": "为这份正式八字解读提供说明的引路人",
    "description": "此页面仅介绍与正式解读相关的引路人，暂不提供解说或后续对话。",
    "viewIntroduction": "查看介绍",
    "viewIntroductionHint": "仅切换人物介绍，不会启动付费解说。",
    "preview": "介绍预览",
    "conceptPending": "角色设定准备中",
    "selectionBoundary": "当前选择仅用于查看人物介绍，不会创建购买权限、正式解读查看权限或专属对话线程。",
    "statusTitle": "解说访问状态",
    "sourceNotice": "人物介绍保留原文，切换界面语言不会自动翻译。",
    "disabledLabel": "解说服务尚未开放",
    "disabledAccessibilityLabel": "引路人解说入口已禁用",
    "authorityBoundary": "引路人介绍及记录关联不能证明商品资格、购买权限、公开批准或正式解读查看权限。",
    "statusMessages": Object.freeze({
      "public_route_off": "正式引路人解说尚未公开。",
      "server_verification_required": "商品资格、购买权限、公开批准及正式解读查看权限须由服务器核实。",
      "product_unsupported": "该商品不支持此引路人的解说。",
      "purchase_access_required": "尚未核实此解说的购买权限。",
      "release_approval_pending": "此引路人解说仍在等待公开批准。",
      "release_temporarily_unavailable": "此引路人解说目前无法使用。",
      "official_reading_access_denied": "不允许访问此正式解读的引路人解说。",
      "retryable_verification_failure": "服务器核验期间发生暂时性问题，解说入口仍处于阻止状态。",
      "protected_verification_failure": "无法安全核实权限或响应，因此已阻止进入解说。",
      "server_admission_required": "即使完成单项核验，实际进入解说仍需服务器另行批准。"
    })
  }
}),
} as const);

// Exhaustive at compile time: adding a server-owned protected status requires
// deliberate authored copy in every staged language, not generic success.
const _entryStatusCoverage: Record<PlannedProtectedUiLocaleV1, Record<MobileOfficialReadingReaderEntryStatusV1, string>> = {
  'en-US': COPY['en-US'].reader.statusMessages,
  'zh-CN': COPY['zh-CN'].reader.statusMessages,
};
void _entryStatusCoverage;

/** Pure non-admitted candidate projection; null for every other locale. */
export function projectPlannedProtectedUiV1(requestedLocale: unknown) {
  if (requestedLocale !== 'en-US' && requestedLocale !== 'zh-CN') return null;
  const uiLocale = requestedLocale;
  const copy = COPY[uiLocale];
  return Object.freeze({
    uiLocale,
    ...copy,
    activeUiLocaleAdmitted: false as const,
    sourceTextTranslated: false as const,
    chatMessageTranslated: false as const,
    chatSendAllowedByLocale: false as const,
    privacyHoldBypassed: false as const,
    readerOutputLocalized: false as const,
    interpretationReleased: false as const,
  });
}
