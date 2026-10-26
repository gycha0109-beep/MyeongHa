import { getActiveBearer, readMemberSession } from './product-auth.js';
import { contactText, localizeContactPage } from './contact-i18n.js';

const form = document.getElementById('contact-form');
const submit = document.getElementById('contact-submit');
const status = document.getElementById('contact-status');
const email = document.getElementById('contact-email');
const name = document.getElementById('contact-name');
const session = readMemberSession();
if (session?.user?.email && email instanceof HTMLInputElement) email.value = session.user.email;
if (session?.user?.user_metadata?.display_name && name instanceof HTMLInputElement) {
  name.value = String(session.user.user_metadata.display_name).slice(0, 60);
}

let submissionId;
let statusSource = '';
let sending = false;
function announce(source, kind) {
  statusSource = source;
  status.textContent = contactText(source);
  status.dataset.state = kind;
}
function restoreButton() {
  submit.textContent = contactText('문의 보내기') + ' →';
}
document.addEventListener('myeongha:localechange', () => {
  if (statusSource) status.textContent = contactText(statusSource);
  submit.textContent = contactText(sending ? '문의 전송 중…' : '문의 보내기') + (sending ? '' : ' →');
});
form?.addEventListener('input', () => { if (!sending) submissionId = undefined; });
form?.addEventListener('change', () => { if (!sending) submissionId = undefined; });
restoreButton();
localizeContactPage();

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || sending) return;
  const fields = new FormData(form);
  if (fields.get('company')) {
    announce('문의가 접수되었습니다.', 'success');
    form.reset();
    submissionId = undefined;
    return;
  }
  submissionId ??= crypto.randomUUID();
  sending = true;
  submit.disabled = true;
  submit.textContent = contactText('문의 전송 중…');
  announce('문의를 전송하고 있습니다.', '');

  try {
    const bearer = await getActiveBearer();
    if (!bearer?.token) {
      announce('문의하려면 로그인하거나 방문 세션을 시작해주세요. 마이페이지에서 계정을 연결할 수 있습니다.', 'error');
      return;
    }
    const response = await fetch('/api/contact', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearer.token}`,
      },
      body: JSON.stringify({
        submissionId,
        category: fields.get('category'),
        name: fields.get('name'),
        email: fields.get('email'),
        subject: fields.get('subject'),
        message: fields.get('message'),
        consent: document.getElementById('contact-consent')?.checked === true,
        company: '',
      }),
    });
    let result = null;
    try { result = await response.json(); } catch { /* response is untrusted */ }

    // Never clear the user's content unless a provider-confirmed delivery
    // returns the precise shared HTTP contract.
    if (response.status === 200 && result?.ok === true && result?.code === 'SENT') {
      submissionId = undefined;
      form.reset();
      announce('문의가 정상 접수되었습니다. 입력하신 이메일로 답변드리겠습니다.', 'success');
    } else if (response.status === 401 || response.status === 403) {
      announce('세션이 만료되었거나 접근이 거부되었습니다. 다시 로그인한 뒤 문의해주세요.', 'error');
    } else if (response.status === 429) {
      announce('잠시 후 다시 시도해주세요.', 'error');
    } else if (response.status === 503 || response.status === 502) {
      announce('현재 문의 메일을 전송할 수 없습니다. 잠시 후 다시 시도해주세요.', 'error');
    } else {
      announce('문의 접수에 실패했습니다. 입력 내용을 확인한 뒤 다시 시도해주세요.', 'error');
    }
  } catch {
    announce('네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.', 'error');
  } finally {
    sending = false;
    submit.disabled = false;
    restoreButton();
  }
});
