import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';

const webRoot = resolve(process.cwd(), 'apps/web');
const runtime = readFileSync(resolve(webRoot, 'chat-runtime-client.js'), 'utf8');
const translator = readFileSync(resolve(webRoot, 'ui-i18n.js'), 'utf8');

describe('Chat Runtime authored UI locale boundary', () => {
  it('has approved Korean, Japanese and Traditional Chinese UI copy for status/error cases', () => {
    const authored = [
      '완료되지 않은 전송 문장을 복원했습니다. 다시 보내면 같은 요청으로 이어집니다.',
      '현재 계정의 대화 권한을 다시 확인하는 중입니다.',
      '현재 대화 기록 연결을 사용할 수 없습니다.',
      '대화방을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      '세연이 답하고 있습니다…',
      '세연의 답변이 도착했습니다.',
      '현재 웹 실대화는 회원 계정에서만 사용할 수 있습니다.',
      '전송 결과를 다시 확인하지 못했습니다. 같은 문장으로 다시 보내면 중복 생성 없이 확인을 이어갑니다.',
      '대화 연결을 다시 확인하고 있습니다…',
      '대화를 불러오지 못했습니다.',
      '시간 정보 없음',
      '삭제된 메시지입니다.',
      '표시할 수 있는 텍스트가 없습니다.',
    ];
    for (const source of authored) {
      expect(runtime).toContain(source);
      for (const locale of ['ja-JP', 'zh-TW'] as const) {
        expect(translateStaticUi(source, locale)).not.toBe(source);
        expect(translateStaticUi(source, locale)).not.toMatch(/[가-힣]/u);
      }
      expect(translateStaticUi(source, 'ko-KR')).toBe(source);
    }
  });

  it('localizes the shared theme toggle accessibility label reported by Web PR gate', () => {
    for (const locale of ['ja-JP', 'zh-TW'] as const) {
      expect(translateStaticUi('밤 화면으로 전환', locale)).not.toMatch(/[가-힣]/u);
      expect(translateStaticUi('낮 화면으로 전환', locale)).not.toMatch(/[가-힣]/u);
    }
  });

  it('repaints in-flight UI statuses on localechange without re-reading or resending', () => {
    expect(runtime).toContain('composeStatusSource = message;');
    expect(runtime).toContain('composeStatus.textContent = uiText(message);');
    expect(runtime).toContain('roomLoadingSource = message;');
    expect(runtime).toContain('roomLoading.textContent = uiText(message);');
    expect(runtime).toContain("document.addEventListener('myeongha:localechange'");
    expect(runtime).toContain('composeStatus.textContent = uiText(composeStatusSource)');
    expect(runtime).toContain('roomLoading.textContent = uiText(roomLoadingSource)');
    expect(runtime).toContain('const message = composeStatusSource ||');
    expect(runtime).toContain('setRoomLoadingStatus(message);');
    expect(runtime).toContain("setRoomLoadingStatus('대화 연결을 다시 확인하고 있습니다…')");
  });

  it('renders ACKed current-session conversation without fetching held history', () => {
    const send = runtime.slice(runtime.indexOf('async function sendTurn(message)'),
      runtime.indexOf('function submitTurn(event)'));
    expect(send).toContain('acknowledgedReply = await sendSeyeonBrowserTurnWithReceiptV1');
    expect(send).toContain('renderAcknowledgedSeyeonTurn(acknowledgedReply, pendingTurn)');
    expect(send).not.toContain('await loadRoomState()');
    expect(send.indexOf('clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId)')).toBeLessThan(
      send.indexOf('const currentBearer = await getActiveBearer();'),
    );
    expect(send).toContain('currentBearer.token !== activeBearer.token');
    expect(send).toContain('threadId !== submittedThreadId');

    const render = runtime.slice(runtime.indexOf('function renderAcknowledgedSeyeonTurn(result, pendingTurn)'),
      runtime.indexOf('function renderRoomState(state)'));
    expect(render).toContain('presentAcknowledgedChatTurnV1(chatStream, {');
    expect(render).toContain('assistantText: result.assistantText');
    expect(render).toContain('userText: pendingTurn.text');
    expect(render).not.toContain('innerHTML');
    expect(render).not.toContain('sessionStorage');
    expect(render).not.toContain('localStorage');
  });

  it('protects persisted transcript bodies while translating only authored redaction placeholders', () => {
    expect(runtime).toContain('message.bodyText.trim().length > 0');
    expect(runtime).toContain("paragraph.dataset.chatBodySource = ''");
    expect(runtime).toContain('paragraph.textContent = message.bodyText;');
    expect(runtime).toContain('paragraph.dataset.chatUiPlaceholder = safeMessageText(message)');
    expect(runtime).toContain('uiText(placeholder.dataset.chatUiPlaceholder)');
    expect(translator).toContain('[data-chat-body-source]');
    expect(runtime).toContain('clientTurnId: pendingTurn.clientTurnId');
    expect(runtime).toContain('clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId)');
  });
});
