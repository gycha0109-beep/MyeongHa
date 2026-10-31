import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const web = (path: string) => readFile(new URL('../apps/web/' + path, import.meta.url), 'utf8');
const sql = new URL('../supabase/migrations/0970_member_character_thread_open_runtime_authority.sql', import.meta.url);

describe('Web Character Room continuous open and resume', () => {
  it('reuses the server-owned Member thread for the same Character without navigating to another page', async () => {
    const [runtime, command, client] = await Promise.all([
      web('chat-runtime-client.js'),
      readFile(sql, 'utf8'),
      web('chat-open-client.js'),
    ]);
    expect(command).toContain('reuse it when present, otherwise create it atomically');
    expect(command).toContain('if v_existing_count = 1 then');
    expect(client).toContain("const endpoint = options.endpoint ?? CHAT_OPEN_ENDPOINT_V1;");
    expect(runtime).toContain('openForCanonicalCharacter({');
    expect(runtime).toContain('threadId = opened.threadId');
    expect(runtime).toContain("window.history.replaceState(window.history.state, '', buildChatThreadUrlV1(threadId))");
    expect(runtime).not.toContain('window.location.assign(');
    expect(runtime).not.toContain('openThreadAndPreserveDraft');
    expect(runtime).not.toContain("sessionStorage.setItem(pendingDraftKey(result.threadId), message)");
  });

  it('confirms historical messages before showing the initial greeting and never invents an empty conversation after failure', async () => {
    const [runtime, page, css] = await Promise.all([
      web('chat-runtime-client.js'), web('src/chat/ChatPage.tsx'), web('chat-runtime.css'),
    ]);
    expect(page).toContain('data-chat-intro hidden');
    expect(page).toContain('data-room-loading role="status"');
    expect(page).toContain('data-room-retry type="button" hidden');
    expect(runtime).toContain('if (chatIntro) {');
    expect(runtime).toContain('chatStream.replaceChildren(chatIntro)');
    expect(runtime).toContain('chatStream.replaceChildren(...nodes)');
    // A revoked source must also prevent a late successful room load from
    // marking the UI ready; a simple !loaded check no longer covers this.
    expect(runtime).toContain('if (!loaded || sourceVisibilityEpoch !== initialVisibilityEpoch) return false;');
    expect(runtime).toContain('const initialVisibilityEpoch = sourceVisibilityEpoch;');
    expect(runtime).toContain('sourceVisibilityEpoch !== startedAtVisibilityEpoch');
    expect(runtime).toContain('roomReady = true');
    expect(runtime).toContain('retryButton.hidden = false');
    expect(runtime).toContain('if (roomReady) return Promise.resolve(true)');
    expect(runtime).toContain('if (roomBootPromise) return roomBootPromise');
    expect(runtime).toContain('void ensureRoomReady()');
    expect(css).toContain('.conversation-message[data-chat-intro][hidden]');
    expect(css).toContain('.character-room-loading[hidden]');
  });

  it('drops stale transcript DOM when G3 history authority denies or a full reread fails', async () => {
    const runtime = await web('chat-runtime-client.js');
    const read = runtime.slice(
      runtime.indexOf('async function readChatPage('),
      runtime.indexOf('async function loadRoomState()'),
    );
    const reload = runtime.slice(
      runtime.indexOf('async function loadRoomState()'),
      runtime.indexOf('// Resolve or reuse an owner-scoped thread'),
    );
    const scrub = runtime.slice(
      runtime.indexOf('function clearOwnerScopedRoomStateForAuthorityChange()'),
      runtime.indexOf('function invalidateRejectedBearer('),
    );
    expect(read).toContain('if (response.status === 503)');
    expect(read).toContain("code === 'SEYEON_HISTORY_REVEAL_HOLD'");
    expect(read).toContain("throw new Error('SEYEON_HISTORY_REVEAL_HOLD')");
    expect(scrub).toContain('chatStream?.replaceChildren()');
    expect(scrub).toContain('authoritativeCharacterId = null');
    expect(scrub).toContain('roomReady = false');
    expect(scrub).toContain('if (chatIntro) chatIntro.hidden = true');
    expect(scrub).toContain('if (contextPill) contextPill.hidden = true');
    expect(reload).toContain('clearOwnerScopedRoomStateForAuthorityChange()');
    expect(reload).toContain("error.message === 'SEYEON_HISTORY_REVEAL_HOLD'");
    expect(reload.indexOf('clearOwnerScopedRoomStateForAuthorityChange()'))
      .toBeLessThan(reload.lastIndexOf('return false;'));
    expect(scrub).not.toContain('sessionStorage.setItem(');
    expect(scrub).not.toContain('sessionStorage.removeItem(');
  });

  it('sends the first composed message exactly once through the existing guarded Member turn route', async () => {
    const runtime = await web('chat-runtime-client.js');
    expect(runtime).toContain('if (queuedSubmission) return');
    expect(runtime).toContain('queuedSubmission = true');
    expect(runtime).toContain('if (ready) return sendTurn(message.trim())');
    expect(runtime).toContain('if (sendingTurn) return');
    expect(runtime).toContain('getOrCreatePendingTurn(message)');
    expect(runtime).toContain('clientTurnId: pendingTurn.clientTurnId');
    expect(runtime).toContain("authoritativeCharacterId !== 'seyeon'");
    const send = runtime.slice(runtime.indexOf('async function sendTurn(message)'), runtime.indexOf('function submitTurn(event)'));
    expect(send).not.toContain('await loadRoomState()');
    expect(send).toContain('acknowledgedReply = await sendSeyeonBrowserTurnWithReceiptV1');
    expect(send).toContain('renderAcknowledgedSeyeonFirstReply(acknowledgedReply)');
    expect(send).toContain('clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId)');
    expect(send).toContain('threadId !== submittedThreadId');
    expect(runtime).toContain('메시지를 보내지 못했습니다. 입력한 내용은 그대로 남아 있습니다.');
    expect(runtime).toContain("error.code === 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE'");
    expect(runtime).toContain("error.code === 'CREDIT_AUTHORITY_UNAVAILABLE'");
    expect(runtime).toContain("throw new Error('AI_TURN_NOT_YET_AVAILABLE')");
    expect(runtime).toContain('크레딧 예약·정산 연결이 완료되지 않아 전송할 수 없으며');
  });

  it('smoke-checks the visible error and retry state without requiring the removed history drawer', async () => {
    const browser = await readFile(new URL('../scripts/verify-web-browser-render.mjs', import.meta.url), 'utf8');
    expect(browser).toContain("document.querySelector('[data-room-loading]')");
    expect(browser).toContain("document.querySelector('[data-chat-intro]')?.hidden === true");
    expect(browser).toContain("document.querySelector('[data-room-retry]')?.hidden === true");
    expect(browser).toContain('invalidThreadChat.loading === invalidThreadChat.status');
    expect(browser).not.toContain("document.querySelector('[data-history-empty]')");
  });

  it('has only the message stream and account-independent official Records tab, not a duplicate past-chat drawer', async () => {
    const [page, transport, presentation] = await Promise.all([
      web('src/chat/ChatPage.tsx'), web('chat-runtime-client.js'), web('chat-character.js'),
    ]);
    expect(page).toContain('data-chat-stream');
    expect(page).not.toContain('data-history-open');
    expect(page).not.toContain('data-history-drawer');
    expect(page).not.toContain('>기록 보기</a>');
    expect(page).not.toContain('className="character-room-menu"');
    expect(transport).not.toContain('renderHistory(');
    expect(presentation).not.toContain("const historyDrawer =");
    expect(presentation).toContain('setDialogueLines(next.intro)');
  });
});
