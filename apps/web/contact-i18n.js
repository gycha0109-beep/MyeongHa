// Contact-only fixed copy shares the existing web locale setting without
// extending the web/mobile common dictionary with web-only support text.
import { getUiLocale } from './ui-i18n.js';

// [Korean, Japanese, Traditional Chinese, English, Simplified Chinese].
export const CONTACT_STATIC_COPY_V1 = Object.freeze([
  ['문의하기 · 명하','お問い合わせ · 命河','聯絡客服 · 命河','Contact · MyeongHa','联系支持 · 命河'],
  ['← 마이페이지로 돌아가기','← マイページへ戻る','← 返回我的頁面','← Back to My Page','← 返回我的页面'],
  ['무엇을 도와드릴까요?','どのようなことでお困りですか？','需要我們協助什麼？','How can we help?','有什么可以帮助您？'],
  ['서비스 이용 중 궁금하신 점이나 불편한 점을 남겨주세요. 확인 후 입력하신 이메일로 답변드리겠습니다.','サービスについてのご質問やお困りごとをお送りください。確認後、入力したメールアドレスへ返信します。','如有服務相關疑問或問題，請留言。我們確認後將回覆至您填寫的電子郵件。','Send us your questions or issues. We will reply to the email you provide after reviewing your inquiry.','如有服务相关问题，请留言。核实后我们将回复您填写的邮箱。'],
  ['문의 내용은 운영자에게 전달됩니다.','您的お問い合わせは運営者に届きます。','您的詢問將寄送給管理員。','Your inquiry will be delivered to the operator.','您的咨询将发送给管理员。'],
  ['계정·결제·서비스 오류 등 문의 유형을 선택하시면 내용을 파악하는 데 도움이 됩니다.','アカウント・決済・不具合などの種類を選んでください。','請選擇帳號、付款、服務錯誤等諮詢類別。','Select a topic such as account, payments, or service errors.','请选择账号、支付或服务故障等咨询类别。'],
  ['비밀번호, 인증번호, 결제카드 전체 번호 등 민감한 정보는 입력하지 마세요.','パスワード、認証コード、カード番号などの機密情報は入力しないでください。','請勿輸入密碼、驗證碼或完整信用卡號等敏感資訊。','Do not include passwords, verification codes, or full payment card numbers.','请勿输入密码、验证码或完整银行卡号等敏感信息。'],
  ['01 — 문의 접수','01 — お問い合わせ','01 — 提交詢問','01 — Contact form','01 — 提交咨询'],
  ['문의하기','お問い合わせ','聯絡客服','Contact us','联系我们'],
  ['표시는 필수 입력 항목입니다.','は必須項目です。','代表必填欄位。','indicates required fields.','表示必填项目。'],
  ['문의 유형','お問い合わせの種類','詢問類別','Inquiry category','咨询类别'],
  ['문의 유형을 선택해주세요','種類を選択してください','請選擇詢問類別','Select a category','请选择咨询类别'],
  ['서비스 이용','サービスの利用','服務使用','Using the service','服务使用'],
  ['결제 · 이용권','決済・利用権','付款 · 使用權','Payments · Credits','支付 · 使用权益'],
  ['계정 · 로그인','アカウント・ログイン','帳號 · 登入','Account · Sign in','账号 · 登录'],
  ['오류 신고','不具合報告','回報錯誤','Report a bug','报告故障'],
  ['기타 문의','その他','其他問題','Other','其他问题'],
  ['이름 또는 호칭','お名前・呼び名','姓名或稱呼','Name or nickname','姓名或称呼'],
  ['답변 시 불러드릴 이름','返信時のお呼び名','回覆時的稱呼','How should we address you?','回复时如何称呼您？'],
  ['답변받을 이메일','返信先メールアドレス','回覆電子郵件','Reply-to email','回复邮箱'],
  ['제목','件名','主旨','Subject','主题'],
  ['문의 제목을 입력해주세요','件名を入力してください','請輸入主旨','Enter a subject','请输入主题'],
  ['문의 내용','お問い合わせ内容','詢問內容','Message','咨询内容'],
  ['발생한 상황이나 궁금한 내용을 자세히 작성해주세요.','状況やご質問を詳しく入力してください。','請詳細說明遇到的問題或疑問。','Describe the problem or your question.','请详细说明问题或疑问。'],
  ['문의 처리 및 답변을 위해 입력한 이메일과 문의 내용이 운영자에게 전달되는 데 동의합니다.','対応と返信のため、メールアドレスとお問い合わせ内容が運営者に送られることに同意します。','我同意將電子郵件和詢問內容寄給管理員，以便處理與回覆。','I agree that my email and message may be sent to the operator to handle and reply to my inquiry.','我同意将邮箱和咨询内容发送给管理员用于处理与回复。'],
  ['(필수)','（必須）','（必填）','(Required)','（必填）'],
  ['문의 보내기','送信する','送出詢問','Send inquiry','发送咨询'],
  ['문의가 정상 접수된 경우에만 완료 메시지가 표시됩니다.','正常に受け付けられた場合のみ完了メッセージが表示されます。','僅在成功送出詢問後顯示完成訊息。','A confirmation appears only after successful delivery.','仅成功发送后才会显示完成提示。'],
  ['문의가 접수되었습니다.','お問い合わせを受け付けました。','詢問已接收。','Inquiry received.','咨询已接收。'],
  ['문의 전송 중…','送信中…','傳送中…','Sending…','发送中…'],
  ['문의를 전송하고 있습니다.','お問い合わせを送信しています。','正在傳送詢問。','Sending your inquiry.','正在发送咨询。'],
  ['문의하려면 로그인하거나 방문 세션을 시작해주세요. 마이페이지에서 계정을 연결할 수 있습니다.','ログインまたはゲストセッションを開始してください。マイページから連携できます。','請先登入或啟動訪客工作階段。可在我的頁面連結帳號。','Sign in or start a guest session. You can link your account from My Page.','请先登录或开启访客会话。可在我的页面关联账号。'],
  ['문의가 정상 접수되었습니다. 입력하신 이메일로 답변드리겠습니다.','お問い合わせを送信しました。入力したメールアドレスに返信します。','詢問已成功寄出。我們將回覆至您填寫的電子郵件。','Inquiry sent successfully. We will reply to your email.','咨询已成功发送。我们将回复您的邮箱。'],
  ['세션이 만료되었거나 접근이 거부되었습니다. 다시 로그인한 뒤 문의해주세요.','セッションが期限切れ、またはアクセスが拒否されました。ログインし直してください。','工作階段已過期或無法存取，請重新登入。','Session expired or access denied. Please sign in again.','会话已过期或访问被拒绝，请重新登录。'],
  ['잠시 후 다시 시도해주세요.','少し待ってから再度お試しください。','請稍後再試。','Please try again later.','请稍后重试。'],
  ['현재 문의 메일을 전송할 수 없습니다. 잠시 후 다시 시도해주세요.','現在送信できません。しばらくしてからお試しください。','目前無法寄出詢問，請稍後再試。','Unable to send right now. Please try again later.','目前无法发送咨询，请稍后再试。'],
  ['문의 접수에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.','送信に失敗しました。入力内容を確認して再度お試しください。','送出失敗，請確認填寫內容後再試。','Unable to submit. Check your details and try again.','提交失败，请检查填写内容后重试。'],
  ['네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.','ネットワークエラーです。接続を確認してください。','網路錯誤。請檢查網路後再試。','Network error. Check your connection and retry.','网络错误，请检查连接后重试。'],
]);
const LOCALE_INDEX = Object.freeze({ 'ko-KR': 0, 'ja-JP': 1, 'zh-TW': 2, 'en-US': 3, 'zh-CN': 4 });
const COPY = new Map(CONTACT_STATIC_COPY_V1.map(row => [row[0], row]));
const originals = new WeakMap();
const placeholderOriginals = new WeakMap();

export function contactText(source) {
  const row = COPY.get(source);
  return row?.[LOCALE_INDEX[getUiLocale()] ?? 0] ?? source;
}

export function localizeContactPage() {
  const root = document.querySelector('.contact-shell');
  if (!root) return;
  const locale = getUiLocale();
  const index = LOCALE_INDEX[locale] ?? 0;
  document.title = contactText('문의하기 · 명하');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const content = node.nodeValue ?? '';
    const trimmed = content.trim();
    const source = originals.get(node) ?? (COPY.has(trimmed) ? trimmed : null);
    if (!source) continue;
    originals.set(node, source);
    const translated = COPY.get(source)?.[index] ?? source;
    if (trimmed !== translated) node.nodeValue = content.replace(trimmed, translated);
  }
  for (const element of root.querySelectorAll('input[placeholder],textarea[placeholder]')) {
    const current = element.getAttribute('placeholder') ?? '';
    const source = placeholderOriginals.get(element) ?? (COPY.has(current) ? current : null);
    if (!source) continue;
    placeholderOriginals.set(element, source);
    element.setAttribute('placeholder', COPY.get(source)?.[index] ?? source);
  }
}

if (typeof document !== 'undefined') {
  localizeContactPage();
  document.addEventListener('myeongha:localechange', localizeContactPage);
}
