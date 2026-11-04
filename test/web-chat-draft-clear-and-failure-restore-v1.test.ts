import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {translateStaticUi} from '../apps/web/ui-i18n.js';

const source=readFileSync(new URL('../apps/web/chat-runtime-client.js',import.meta.url),'utf8');

describe('Se-yeon chat composer send/restore and concise confirmation',()=>{
  const start=source.indexOf('async function sendTurn(message,');
  const end=source.indexOf('function submitTurn(event)');
  const send=source.slice(start,end);

  it('clears the visible composer as soon as one logical Turn is accepted',()=>{
    expect(start).toBeGreaterThan(0);
    expect(send).toContain('const pendingTurn = getOrCreatePendingTurn(message);');
    expect(send).toContain("messageInput.value.trim() === pendingTurn.text");
    expect(send).toContain("messageInput.value = '';");
    expect(send.indexOf("messageInput.value = '';")).toBeLessThan(
      send.indexOf('acknowledgedReply = await sendSeyeonBrowserTurnWithReceiptV1'));
    expect(send).toContain('if (sendingTurn) return;');
  });
  it('restores only unacknowledged failed text without overwriting newer draft',()=>{
    expect(send).toContain('let receiptAcknowledged = false;');
    expect(send).toContain('receiptAcknowledged = true;');
    expect(send).toContain('!receiptAcknowledged && threadId === submittedThreadId');
    expect(send).toContain('!messageInput.value.trim()');
    expect(send).toContain('messageInput.value = pendingTurn.text');
    expect(send).toContain('clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId)');
    expect(send).toContain('removePendingBubbles();');
  });
  it('uses short localized stale-message confirmation',()=>{
    const prompt='이전에 보내지 못한 메시지가 있어요. 이전 기록은 남기고 새 메시지를 보낼까요?';
    expect(send).toContain('window.confirm(uiText(');
    expect(send).toContain(prompt);
    for(const locale of ['ja-JP','zh-TW','en-US','zh-CN'] as const){
      const translation=translateStaticUi(prompt,locale);
      expect(translation).not.toBe(prompt);
      expect(translation).not.toMatch(/[가-힣]/u);
    }
  });
});
