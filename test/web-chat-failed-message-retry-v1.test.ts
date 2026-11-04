import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translateStaticUi } from '../apps/web/ui-i18n.js';

const source = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ui = source('apps/web/chat-runtime-client.js');
const transport = source('apps/web/chat-turn-receipt-client.js');
const server = source('apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.ts');
const css = source('apps/web/chat-runtime.css');

describe('Owner-verified failed-message retry', () => {
  it('offers a real button only for retryable, visible original messages', () => {
    const render = ui.slice(ui.indexOf('function createStreamMessage('), ui.indexOf('function renderConversation('));
    expect(render).toContain("message.turnState === 'failed_retryable'");
    expect(render).toContain("authoritativeCharacterId === 'seyeon'");
    expect(render).toContain("message.redacted !== true");
    expect(render).toContain("message.senderType === 'user'");
    expect(render).toContain("message.turnState === 'failed_final'");
    expect(render).toContain("message.turnState === 'abandoned'");
    expect(render).toContain("retry.type = 'button'");
    expect(render).toContain("retry.dataset.chatMessageRetry = ''");
    expect(render).toContain("void retryFailedMessage(message)");
    expect(css).toContain('.chat-message-retry:disabled');
  });

  it('freshly authorizes the exact message and avoids overriding a different pending turn', () => {
    const retry = ui.slice(ui.indexOf('async function retryFailedMessage('), ui.indexOf('async function sendTurn('));
    expect(retry).toContain('readPendingTurn(originalThreadId)');
    expect(retry).toContain('pending.text !== message.bodyText');
    expect(retry).toContain('await readChatPage(bearer, message.sequenceNo - 1)');
    expect(retry).toContain('candidate.messageId === message.messageId');
    expect(retry).toContain("refreshed.turnState !== 'failed_retryable'");
    expect(retry).toContain('refreshed.redacted === true');
    expect(retry).toContain('refreshed.bodyText !== message.bodyText');
    expect(retry).toContain('sameBearer.token !== bearer.token');
    expect(retry).toContain('await sendTurn(message.bodyText, { retryFailed: true })');
    expect(retry).toContain('clearOwnerScopedRoomStateForAuthorityChange()');
  });

  it('requires original failed-turn recovery before any model or credit-bearing retry', () => {
    expect(transport).toContain("headers.set('X-MyeongHa-Seyeon-Explicit-Retry', 'v1')");
    expect(transport).toContain("options?.method === 'POST'");
    expect(server).toContain("retryHeader!=='v1'||!zeroSource||supersedeHeader!==null");
    expect(server).toContain("if(retryHeader==='v1' && recovered===null)");
    expect(server).toContain("kind:'idempotency_conflict'");
    expect(server.indexOf("if(retryHeader==='v1' && recovered===null)"))
      .toBeLessThan(server.indexOf("stage='model_execution'"));
    const send = ui.slice(ui.indexOf('async function sendTurn('), ui.indexOf('function submitTurn('));
    expect(send).toContain('retryFailed ? () => {}');
    expect(send).toContain('retryFailed,');
    expect(send).toContain('if (!retryFailed && error instanceof MyeongHaApiClientErrorV1');
    expect(send).toContain("if (retryFailed) {");
    expect(send).toContain('const refreshed = await loadRoomState();');
    expect(send).toContain("throw new Error('RETRY_STATE_CHANGED')");
    expect(send).toContain("const presented = renderAcknowledgedSeyeonTurn(acknowledgedReply, pendingTurn)");
  });

  it('localizes retry controls and never translates user message bodies', () => {
    for (const phrase of [
      '다시 전송', '이 메시지 다시 전송',
      '메시지를 다시 전송했습니다.',
      '메시지 상태가 변경되었습니다. 대화를 다시 확인해 주세요.',
    ]) {
      for (const locale of ['ja-JP','zh-TW','en-US','zh-CN'] as const) {
        expect(translateStaticUi(phrase,locale)).not.toBe(phrase);
      }
    }
    expect(ui).toContain('paragraph.textContent = message.bodyText');
  });
});
