import { getActiveBearer, readMemberSession } from './product-auth.js';

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
function announce(message, kind) {
  status.textContent = message;
  status.dataset.state = kind;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity() || submit.disabled) return;

  const fields = new FormData(form);
  if (fields.get('company')) {
    announce('문의가 접수되었습니다.', 'success');
    form.reset();
    return;
  }

  submissionId ??= crypto.randomUUID();
  submit.disabled = true;
  submit.textContent = '문의 전송 중…';
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

    if (response.ok) {
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
    submit.disabled = false;
    submit.innerHTML = '문의 보내기 <span aria-hidden="true">→</span>';
  }
});