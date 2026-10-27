import { ensureActiveBearer, readMemberSession } from './product-auth.js';

const form = document.getElementById('owner-reply-form');
const submit = document.getElementById('reply-submit');
const status = document.getElementById('reply-status');
let replyId;
let sending = false;
const announce = (message, state = 'error') => {
  status.textContent = message;
  status.dataset.state = state;
};
form?.addEventListener('input', () => { if (!sending) replyId = undefined; });
form?.addEventListener('change', () => { if (!sending) replyId = undefined; });
if (!readMemberSession()) announce('운영자 회원 계정으로 로그인해야 합니다.');
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (sending || !form.reportValidity()) return;
  sending = true;
  submit.disabled = true;
  replyId ??= crypto.randomUUID();
  announce('회신 요청을 확인하고 있습니다.', '');
  try {
    const bearer = await ensureActiveBearer();
    if (!bearer?.token || !readMemberSession()) {
      announce('운영자 회원 계정 로그인이 필요합니다.');
      return;
    }
    const data = new FormData(form);
    const response = await fetch('/api/admin/contact/reply', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearer.token}`,
      },
      body: JSON.stringify({
        submissionId: data.get('submissionId'),
        replyId,
        recipientEmail: data.get('recipientEmail'),
        originalSubject: data.get('originalSubject'),
        message: data.get('message'),
        confirmRecipient: data.get('confirmRecipient') === 'on',
      }),
    });
    let result;
    try { result = await response.json(); } catch { /* deny untrusted bodies */ }
    if (response.status === 200 && result?.ok && result.code === 'REPLY_SENT') {
      replyId = undefined;
      form.reset();
      announce('회신 발송 요청이 접수되었습니다. 수신 여부는 고객 메일함에서 별도 확인해야 합니다.', 'success');
    } else if (result?.code === 'REPLY_NOT_ENABLED') {
      announce('공식 발신 도메인 인증 전이므로 회신 발송을 사용할 수 없습니다.');
    } else if (response.status === 401 || response.status === 403) {
      announce('운영자 권한이 확인되지 않았습니다. 회원 계정으로 로그인해 주십시오.');
    } else if (response.status === 429) {
      announce('발송 요청이 많습니다. 잠시 후 동일 내용을 재시도하십시오.');
    } else {
      announce('회신을 발송하지 못했습니다. 입력값과 설정을 확인한 뒤 재시도하십시오.');
    }
  } catch {
    announce('네트워크 오류가 발생했습니다. 전송 여부를 확인하고 재시도하십시오.');
  } finally {
    sending = false;
    submit.disabled = false;
  }
});
