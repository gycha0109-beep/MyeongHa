import type { MobileUiLocale } from '../../ui/mobile-ui-copy.js';

/**
 * Strictly client-authored fixed My auth feedback. Never translate provider
 * callbacks, remote bodies, email addresses, credentials or diagnostic codes
 * unless they match a canonical authored message exactly.
 */
const MOBILE_MEMBER_AUTH_COPY_ROWS_V1 = [
  [
    "소셜 로그인 화면을 열지 못했습니다.",
    "ソーシャルログイン画面を開けませんでした。",
    "無法開啟社群登入畫面。",
    "Could not open the social sign-in screen.",
    "无法打开社交登录页面。"
  ],
  [
    "소셜 로그인 요청 시간이 만료되었습니다. 다시 시도해 주세요.",
    "ソーシャルログインの有効期限が切れました。もう一度お試しください。",
    "社群登入請求已逾時，請重試。",
    "Your social sign-in request expired. Please try again.",
    "社交登录请求已过期，请重试。"
  ],
  [
    "다른 소셜 로그인 응답을 확인 중입니다. 잠시 후 다시 시도해 주세요.",
    "別のソーシャルログイン応答を確認中です。しばらくしてからお試しください。",
    "正在確認另一項社群登入回應，請稍後再試。",
    "Another social sign-in response is being checked. Try again shortly.",
    "正在验证另一项社交登录响应，请稍后重试。"
  ],
  [
    "로그인을 시작한 게스트 세션이 변경되어 계정을 안전하게 연결할 수 없습니다.",
    "ログイン開始時のゲストセッションが変更されたため、安全にアカウントを連携できません。",
    "開始登入時的訪客工作階段已變更，因此無法安全連結帳號。",
    "The guest session changed after sign-in began, so the account cannot be linked safely.",
    "开始登录时的访客会话已更改，无法安全关联账号。"
  ],
  [
    "가입을 시작한 게스트 세션이 만료되었거나 변경되어 기록을 안전하게 이어갈 수 없습니다.",
    "登録開始時のゲストセッションが期限切れ、または変更されたため、記録を安全に引き継げません。",
    "註冊開始時的訪客工作階段已過期或變更，無法安全延續紀錄。",
    "The guest session expired or changed during sign-up, so records cannot be carried over safely.",
    "注册开始时的访客会话已过期或更改，无法安全继承记录。"
  ],
  [
    "가입 이어가기 상태를 찾을 수 없습니다.",
    "登録を続行するための状態が見つかりません。",
    "找不到繼續註冊所需的狀態。",
    "Could not find the state needed to continue sign-up.",
    "找不到继续注册所需的状态。"
  ],
  [
    "이 로그인 수단은 외부 연동 설정이 아직 완료되지 않았습니다.",
    "このログイン方法の外部連携設定はまだ完了していません。",
    "此登入方式的外部串接設定尚未完成。",
    "This sign-in provider has not finished external setup.",
    "此登录方式的外部集成配置尚未完成。"
  ],
  [
    "소셜 로그인 응답을 안전하게 확인하지 못했습니다. 다시 시도해 주세요.",
    "ソーシャルログインの応答を安全に確認できませんでした。再試行してください。",
    "無法安全驗證社群登入回應，請重試。",
    "Could not safely verify the social sign-in response. Please try again.",
    "无法安全验证社交登录响应，请重试。"
  ],
  [
    "이메일 또는 비밀번호를 확인해 주세요.",
    "メールアドレスまたはパスワードをご確認ください。",
    "請檢查電子郵件或密碼。",
    "Check your email address or password.",
    "请检查邮箱或密码。"
  ],
  [
    "계정 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
    "アカウントへのリクエストが多すぎます。しばらくしてから再試行してください。",
    "帳號請求過於頻繁，請稍後再試。",
    "Too many account requests. Please try again later.",
    "账号请求过于频繁，请稍后重试。"
  ],
  [
    "유출된 비밀번호로 확인되어 사용할 수 없습니다.",
    "漏えいが確認されたパスワードのため、使用できません。",
    "此密碼已確認外洩，無法使用。",
    "This password is known to be compromised and cannot be used.",
    "该密码已确认泄露，无法使用。"
  ],
  [
    "비밀번호 안전성 확인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    "パスワードの安全性確認を完了できませんでした。しばらくしてから再試行してください。",
    "無法完成密碼安全性檢查，請稍後再試。",
    "Could not complete the password safety check. Please try again later.",
    "无法完成密码安全性检查，请稍后重试。"
  ],
  [
    "새 계정을 만들 수 없습니다. 이미 가입된 이메일인지 확인해 주세요.",
    "新しいアカウントを作成できません。登録済みのメールアドレスかご確認ください。",
    "無法建立新帳號，請確認電子郵件是否已註冊。",
    "Could not create an account. Check whether this email is already registered.",
    "无法创建新账号，请检查邮箱是否已注册。"
  ],
  [
    "기존 회원 계정에는 게스트 기록을 자동 병합할 수 없습니다. 기존 계정 로그인으로 이용해 주세요.",
    "既存会員アカウントへゲスト記録を自動統合することはできません。既存のアカウントでログインしてください。",
    "訪客紀錄無法自動合併至現有會員帳號。請登入現有帳號使用。",
    "Guest records cannot be automatically merged into an existing member account. Sign in to that account instead.",
    "访客记录无法自动合并到已有会员账号。请登录已有账号。"
  ],
  [
    "현재 게스트 세션을 새 회원 계정으로 이어갈 수 없습니다.",
    "現在のゲストセッションを新しい会員アカウントに引き継げません。",
    "目前無法將訪客工作階段延續至新會員帳號。",
    "The current guest session cannot be carried over to a new member account.",
    "当前访客会话无法继承到新会员账号。"
  ],
  [
    "계정 서버에 연결하지 못했습니다.",
    "アカウントサーバーに接続できませんでした。",
    "無法連線至帳號伺服器。",
    "Could not connect to the account server.",
    "无法连接账号服务器。"
  ],
  [
    "계정 작업을 완료하지 못했습니다. [UNEXPECTED_AUTH_ERROR]",
    "アカウント操作を完了できませんでした。[UNEXPECTED_AUTH_ERROR]",
    "無法完成帳號操作。[UNEXPECTED_AUTH_ERROR]",
    "Could not complete the account operation. [UNEXPECTED_AUTH_ERROR]",
    "无法完成账号操作。[UNEXPECTED_AUTH_ERROR]"
  ],
  [
    "확인 메일을 보냈습니다. 이메일 확인 후 앱으로 돌아와 가입을 완료해 주세요.",
    "確認メールを送信しました。メール認証後、アプリに戻って登録を完了してください。",
    "確認郵件已寄出。完成電子郵件驗證後，請返回 App 完成註冊。",
    "A verification email has been sent. Verify your email, then return to the app to finish sign-up.",
    "验证邮件已发送。验证邮箱后，请返回应用完成注册。"
  ],
  [
    "취소한 소셜 로그인 상태를 정리하지 못했습니다. 다시 취소해 주세요.",
    "キャンセルしたソーシャルログインの状態を解除できませんでした。もう一度キャンセルしてください。",
    "無法清除已取消的社群登入狀態，請再次取消。",
    "Could not clear the cancelled social sign-in state. Please cancel again.",
    "无法清除已取消的社交登录状态，请再次取消。"
  ],
  [
    "현재 게스트 기록을 계정으로 안전하게 이어받았습니다.",
    "現在のゲスト記録をアカウントに安全に引き継ぎました。",
    "已安全地將目前的訪客紀錄延續至帳號。",
    "Your current guest records were safely carried over to the account.",
    "已安全地将当前访客记录继承至账号。"
  ],
  [
    "기존 회원 계정으로 로그인했습니다. 현재 게스트 기록은 자동 병합하지 않았습니다.",
    "既存の会員アカウントでログインしました。現在のゲスト記録は自動統合されていません。",
    "已登入現有會員帳號。目前的訪客紀錄未自動合併。",
    "Signed in to your existing account. Current guest records were not merged automatically.",
    "已登录已有会员账号。当前访客记录未自动合并。"
  ],
  [
    "외부 로그인 확인을 마치면 자동으로 명하로 돌아옵니다.",
    "外部ログイン認証が完了すると自動的に命河に戻ります。",
    "完成外部登入驗證後，將自動返回命河。",
    "You will return to MyeongHa automatically after external sign-in.",
    "完成外部登录验证后，将自动返回命河。"
  ],
  [
    "소셜 로그인 취소 정보를 정리하지 못했습니다. 다시 시도해 주세요.",
    "ソーシャルログインのキャンセル情報を解除できませんでした。再試行してください。",
    "無法清除社群登入取消資訊，請重試。",
    "Could not clear the social sign-in cancellation state. Please try again.",
    "无法清除社交登录取消信息，请重试。"
  ],
  [
    "계정 생성 후 게스트 기록 연결을 마저 완료해 주세요.",
    "アカウント作成後、ゲスト記録の引き継ぎを完了してください。",
    "建立帳號後，請完成訪客紀錄連結。",
    "After creating the account, finish linking your guest records.",
    "创建账号后，请完成关联访客记录。"
  ],
  [
    "이메일 확인 후 앱에서 가입 완료를 다시 시도해 주세요.",
    "メール確認後、アプリで登録完了をもう一度お試しください。",
    "驗證電子郵件後，請在 App 中重試完成註冊。",
    "After verifying your email, try completing sign-up in the app again.",
    "验证邮箱后，请在应用中重试完成注册。"
  ],
  [
    "기존 계정의 알림 연결 또는 로그인 상태를 안전하게 정리하지 못했습니다.",
    "既存アカウントの通知連携またはログイン状態を安全に解除できませんでした。",
    "無法安全清除現有帳號的通知連結或登入狀態。",
    "Could not safely clear the existing account's notification link or sign-in state.",
    "无法安全清除现有账号的通知关联或登录状态。"
  ]
] as const;
const BY_SOURCE: ReadonlyMap<string, readonly [string,string,string,string]> =
  new Map(MOBILE_MEMBER_AUTH_COPY_ROWS_V1.map(([source, ja, tw, en, cn]) =>
    [source, [ja, tw, en, cn] as const] as const));
export const MOBILE_MEMBER_AUTH_AUTHORED_COPY_V1: readonly string[] =
  Object.freeze(MOBILE_MEMBER_AUTH_COPY_ROWS_V1.map(([source]) => source));

export function localizeMobileMemberAuthCopyV1(source: string, locale: MobileUiLocale): string {
  if (locale === 'ko-KR') return source;
  const translated = BY_SOURCE.get(source);
  if (translated === undefined) return source;
  if (locale === 'ja-JP') return translated[0];
  if (locale === 'zh-TW') return translated[1];
  return locale === 'en-US' ? translated[2] : translated[3];
}
