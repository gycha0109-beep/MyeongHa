import { resolveCharacterDisplayNameV1 } from './character-display-locale.js';
import { getUiLocale, getUiLocaleRequestHeadersV1, translateStaticUi } from './ui-i18n.js';
import { resolveCanonicalCharacterPresentationV1 } from './character-presentation-identity.js';
import {
  ChatOpenClientErrorV1,
  buildChatThreadUrlV1,
  createChatOpenClientV1,
} from './chat-open-client.js';
import { applyCanonicalCharacterPresentationV1 } from './chat-character.js';
import { parseChatRoomReadPayloadV1, parseChatThreadRouteV1 } from './chat-room-read-contract.js';
import { getActiveBearer, invalidateGuestSession, invalidateMemberSession } from './product-auth.js';
import { PRODUCT_AUTH_STORAGE_V1 } from './product-auth.js';
import { MyeongHaApiClientErrorV1 } from '../../packages/api-client/src/index.ts';
import { sendSeyeonBrowserTurnWithReceiptV1 } from './chat-turn-receipt-client.js';
import { shouldReloadChatForMemberSessionStorageChange } from './product-auth-surface.js';
import { mountSeyeonPrivateMemoryReviewV1 } from './seyeon-private-memory-review-view.js';
import { subscribeSeyeonMemoryVisibilityInvalidationV1 } from './seyeon-memory-visibility-invalidation.js';

const params = new URLSearchParams(window.location.search);
const threadRoute = parseChatThreadRouteV1(params);
let threadId = threadRoute.threadId;
const invalidThreadRoute = threadRoute.state === 'invalid';
const requestedCharacterId = (() => {
  const raw = params.get('character');
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return resolveCanonicalCharacterPresentationV1(normalized) ? normalized : null;
})();
const apiEnvelopePromise = import('./api-envelope.js');
const chatOpenClient = createChatOpenClientV1();

const contextPill = document.querySelector('[data-context-pill]');
const contextTitle = document.querySelector('[data-context-title]');
const composeStatus = document.querySelector('[data-compose-status]');
const chatStream = document.querySelector('[data-chat-stream]');
const chatIntro = document.querySelector('[data-chat-intro]');
const roomLoading = document.querySelector('[data-room-loading]');
const retryButton = document.querySelector('[data-room-retry]');
const messageInput = document.querySelector('[data-message-input]');
const composer = document.querySelector('[data-composer]');
let roomBootPromise = null;
let roomReady = false;
let queuedSubmission = false;
let sendingTurn = false;
let authoritativeCharacterId = null;
let historyWithheld = false;
let composeStatusSource = null;
let roomLoadingSource = null;
// Increment whenever server-confirmed source withdrawal invalidates this
// document. Async fetch/receipt responses from earlier epochs cannot repaint.
let sourceVisibilityEpoch = 0;

function uiText(source) {
  return translateStaticUi(source, getUiLocale());
}

function setComposeStatus(message) {
  composeStatusSource = message;
  if (composeStatus) composeStatus.textContent = uiText(message);
}

function setRoomLoadingStatus(message) {
  roomLoadingSource = message;
  if (roomLoading) roomLoading.textContent = uiText(message);
}

function setComposerBusy(busy) {
  if (composer) composer.dataset.runtimeBusy = String(Boolean(busy));
  if (messageInput instanceof HTMLTextAreaElement) messageInput.readOnly = Boolean(busy);
  const sendButton = composer?.querySelector('button[type="submit"]');
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = Boolean(busy);
}

function pendingDraftKey(targetThreadId) {
  return `myeongha:chat:pending-draft:${targetThreadId}`;
}

function pendingTurnKey(targetThreadId) {
  return `myeongha:chat:pending-turn:v1:${targetThreadId}`;
}

function readPendingTurn(targetThreadId) {
  if (!targetThreadId) return null;
  const raw = sessionStorage.getItem(pendingTurnKey(targetThreadId));
  if (typeof raw !== 'string' || raw.length === 0) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.clientTurnId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed.clientTurnId) ||
      typeof parsed.text !== 'string' ||
      parsed.text.trim().length === 0 ||
      parsed.text.length > 8000
    ) {
      sessionStorage.removeItem(pendingTurnKey(targetThreadId));
      return null;
    }
    return Object.freeze({
      clientTurnId: parsed.clientTurnId,
      text: parsed.text,
    });
  } catch {
    sessionStorage.removeItem(pendingTurnKey(targetThreadId));
    return null;
  }
}

function getOrCreatePendingTurn(message) {
  const existing = readPendingTurn(threadId);
  if (existing?.text === message) return existing;

  const pendingTurn = Object.freeze({
    clientTurnId: crypto.randomUUID(),
    text: message,
  });
  sessionStorage.setItem(pendingTurnKey(threadId), JSON.stringify(pendingTurn));
  return pendingTurn;
}

function clearPendingTurn(clientTurnId, targetThreadId = threadId) {
  const existing = readPendingTurn(targetThreadId);
  if (existing?.clientTurnId !== clientTurnId) return;
  sessionStorage.removeItem(pendingTurnKey(targetThreadId));
}

function restorePendingDraft() {
  if (!threadId || !(messageInput instanceof HTMLTextAreaElement) || messageInput.value.trim()) return;

  const draftKey = pendingDraftKey(threadId);
  const openDraft = sessionStorage.getItem(draftKey);
  const pendingTurn = readPendingTurn(threadId);
  const draft = typeof openDraft === 'string' && openDraft.trim().length > 0
    ? openDraft
    : pendingTurn?.text ?? null;

  if (typeof draft !== 'string' || draft.trim().length === 0) return;

  messageInput.value = draft;
  if (openDraft === draft) sessionStorage.removeItem(draftKey);
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
  setComposeStatus(
    pendingTurn?.text === draft
      ? '완료되지 않은 전송 문장을 복원했습니다. 다시 보내면 같은 요청으로 이어집니다.'
      : '대화방 연결은 완료되었습니다. 입력한 문장은 보존했습니다.',
  );
}

function chatOpenFailureMessage(error) {
  if (!(error instanceof ChatOpenClientErrorV1)) {
    return '대화방을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (error.code === 'CHAT_OPEN_SESSION_REQUIRED') {
    return '대화를 시작하려면 로그인이 필요합니다.';
  }
  if (error.code === 'CHAT_OPEN_MEMBER_REQUIRED') {
    return '현재 웹 대화는 회원 계정에서 시작할 수 있습니다.';
  }
  if (error.code === 'CHAT_OPEN_CHARACTER_UNAVAILABLE') {
    return '현재 세연 대화방을 열 수 없습니다.';
  }
  if (error.code === 'CHAT_OPEN_CONTENT_INCOMPATIBLE') {
    return '현재 웹 버전과 세연 대화 콘텐츠가 맞지 않습니다.';
  }
  if (error.code === 'CHAT_OPEN_CONTENT_UNAVAILABLE') {
    return '세연 대화 콘텐츠를 지금 불러올 수 없습니다.';
  }
  return '대화방을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function formatTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return uiText('시간 정보 없음');
  return new Intl.DateTimeFormat(getUiLocale(), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function senderLabel(message, authoritativeCharacterId) {
  const locale = getUiLocale();
  if (message.senderType === 'user') return translateStaticUi('나', locale);
  if (message.senderType === 'character') {
    const name = resolveCharacterDisplayNameV1(message.characterId, locale);
    if (message.characterId === authoritativeCharacterId) return name ?? translateStaticUi('연결자', locale);
    return name ?? translateStaticUi('다른 연결자', locale);
  }
  return translateStaticUi('대화 기록', locale);
}

function safeMessageText(message) {
  if (message.redacted === true) return '삭제된 메시지입니다.';
  if (typeof message.bodyText === 'string' && message.bodyText.trim().length > 0) return message.bodyText;
  return '표시할 수 있는 텍스트가 없습니다.';
}

function createStreamMessage(message, authoritativeCharacterId) {
  if (!message || typeof message !== 'object') return null;
  if (!Number.isSafeInteger(message.sequenceNo) || typeof message.senderType !== 'string') return null;

  const article = document.createElement('article');
  article.className = 'conversation-message';
  article.dataset.sender = message.senderType;
  article.dataset.redacted = String(message.redacted === true);
  if (message.senderType === 'character') {
    const canonical = resolveCanonicalCharacterPresentationV1(message.characterId);
    if (canonical) article.dataset.messageCharacterId = canonical.presentationKey;
  }

  const avatar = document.createElement('span');
  avatar.className = 'conversation-message-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.dataset.character = message.senderType === 'character' ? 'runtime-character' : 'user';
  avatar.textContent = message.senderType === 'user' ? translateStaticUi('나', getUiLocale()) : '대';

  const body = document.createElement('div');
  body.className = 'conversation-message-body';

  const heading = document.createElement('div');
  heading.className = 'conversation-message-heading';
  const strong = document.createElement('strong');
  strong.textContent = senderLabel(message, authoritativeCharacterId);
  const time = document.createElement('time');
  time.textContent = formatTimestamp(message.createdAt);
  if (typeof message.createdAt === 'string') time.dateTime = message.createdAt;
  heading.append(strong, time);

  const paragraph = document.createElement('p');
  const hasSourceBody = message.redacted !== true
    && typeof message.bodyText === 'string'
    && message.bodyText.trim().length > 0;
  if (hasSourceBody) {
    // Source-owned message text must not enter the static UI translation pipeline.
    paragraph.dataset.chatBodySource = '';
    paragraph.textContent = message.bodyText;
  } else {
    paragraph.dataset.chatUiPlaceholder = safeMessageText(message);
    paragraph.textContent = uiText(safeMessageText(message));
  }
  body.append(heading, paragraph);
  article.append(avatar, body);
  return article;
}

function renderConversation(messages, authoritativeCharacterId, historyProtected, memberReadAllowed) {
  if (!chatStream) return;
  const nodes = messages.map((message) => createStreamMessage(message, authoritativeCharacterId)).filter(Boolean);
  if (nodes.length === 0) {
    if (chatIntro) {
      chatIntro.hidden = false;
      chatStream.replaceChildren(chatIntro);
    } else {
      chatStream.replaceChildren();
    }
    return;
  }
  chatStream.replaceChildren(...nodes);
  // Only a verified server Dialogue Planner pending proposal may be reviewed.
  // Never turn a user Message into a manual Memory creation entrypoint.
  // Protected History has no original messages or eligible proposals.
  if (!historyProtected && memberReadAllowed && authoritativeCharacterId === 'seyeon') {
    for (let i = 0; i < messages.length; i += 1) {
      const proposal = messages[i]?.memoryProposal;
      const body = nodes[i]?.querySelector('.conversation-message-body');
      if (proposal && body instanceof HTMLElement) {
        mountSeyeonPrivateMemoryReviewV1({ container: body, plannerProposal: proposal });
      }
    }
  }
  chatStream.scrollTop = chatStream.scrollHeight;
}

// Repaint only metadata already present on owner-scoped DOM nodes. No cached
// transcripts, no server refetch, no reinterpretation or modification of bodyText.
// If the session changes, the existing authority guard removes these nodes.
document.addEventListener('myeongha:localechange', () => {
  if (composeStatusSource !== null && composeStatus) composeStatus.textContent = uiText(composeStatusSource);
  if (roomLoadingSource !== null && roomLoading) roomLoading.textContent = uiText(roomLoadingSource);
  if (!chatStream) return;
  for (const article of chatStream.querySelectorAll('.conversation-message')) {
    const placeholder = article.querySelector('[data-chat-ui-placeholder]');
    if (placeholder) placeholder.textContent = uiText(placeholder.dataset.chatUiPlaceholder);
    const senderType = article.dataset.sender;
    const characterId = article.dataset.messageCharacterId ?? null;
    const heading = article.querySelector('.conversation-message-heading strong');
    if (heading) heading.textContent = senderLabel({ senderType, characterId }, authoritativeCharacterId);
    const time = article.querySelector('.conversation-message-heading time');
    if (time) {
      const timestamp = time.getAttribute('datetime');
      time.textContent = formatTimestamp(timestamp === null ? undefined : timestamp);
    }
    if (senderType === 'user') {
      const avatar = article.querySelector('.conversation-message-avatar');
      if (avatar) avatar.textContent = translateStaticUi('나', getUiLocale());
    }
  }
});

// The S0 receipt is verified and ACKed before this call. History/Replay are
// deliberately unavailable: display only the just-received response in this
// document, never cache it or infer an authorized transcript from it.
function renderAcknowledgedSeyeonFirstReply(result) {
  if (!chatStream || !result || typeof result.assistantText !== 'string' ||
      result.assistantText.trim().length === 0 || result.replayed !== false) {
    return false;
  }
  const article = document.createElement('article');
  article.className = 'conversation-message';
  article.dataset.sender = 'character';
  article.dataset.messageCharacterId = 'seyeon';
  article.dataset.acknowledgedFirstReply = '';

  const avatar = document.createElement('span');
  avatar.className = 'conversation-message-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.dataset.character = 'runtime-character';
  avatar.textContent = '대';

  const body = document.createElement('div');
  body.className = 'conversation-message-body';
  const heading = document.createElement('div');
  heading.className = 'conversation-message-heading';
  const strong = document.createElement('strong');
  strong.textContent = resolveCharacterDisplayNameV1('seyeon', getUiLocale())
    ?? translateStaticUi('연결자', getUiLocale());
  heading.append(strong);

  const paragraph = document.createElement('p');
  paragraph.dataset.chatBodySource = '';
  paragraph.textContent = result.assistantText;
  body.append(heading, paragraph);
  article.append(avatar, body);

  if (chatIntro) chatIntro.hidden = true;
  // Replacing a held history with this one reply does not grant replay access.
  chatStream.replaceChildren(article);
  chatStream.scrollTop = chatStream.scrollHeight;
  historyWithheld = true;
  return true;
}

function renderRoomState(state) {
  historyWithheld = state.historyWithheld === true;
  renderConversation(state.messages, state.characterId, historyWithheld, state.memberReadAllowed === true);

  // Exact-nine product authority maps canonical Character id to the same
  // English browser presentation key. The thread read remains identity authority.
  applyCanonicalCharacterPresentationV1(state.characterId);

  // Life Thread / 이어지는 이야기 authority is intentionally not inferred from
  // chat messages. Until a verified continuation projection is supplied, the
  // context pill stays hidden.
  if (contextPill) contextPill.hidden = true;
  if (contextTitle) contextTitle.textContent = '';
}

function clearOwnerScopedRoomStateForAuthorityChange() {
  // Old DOM Message nodes are not durable history Reveal authority.
  chatStream?.replaceChildren();
  if (chatIntro) chatIntro.hidden = true;
  roomReady = false;
  authoritativeCharacterId = null;
  historyWithheld = false;
  if (contextPill) contextPill.hidden = true;
  if (contextTitle) contextTitle.textContent = '';
  setComposeStatus('현재 계정의 대화 권한을 다시 확인하는 중입니다.');
}

function invalidateRejectedBearer(activeBearer) {
  if (activeBearer?.kind === 'member') {
    invalidateMemberSession(activeBearer.token);
    return;
  }
  if (activeBearer?.kind === 'guest') invalidateGuestSession(activeBearer.token);
}

async function readChatPage(activeBearer, afterSequenceNo) {
  const url = new URL(`/api/chat/${encodeURIComponent(threadId)}`, window.location.origin);
  url.searchParams.set('afterSequenceNo', String(afterSequenceNo));

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
          'Accept-Language': getUiLocale(),
          ...getUiLocaleRequestHeadersV1(),
      Authorization: `Bearer ${activeBearer.token}`,
    },
  });

  if (response.status === 401) {
    invalidateRejectedBearer(activeBearer);
    throw new Error('Character Room read requires a current session.');
  }
  if (response.status === 503) {
    // A former Se-yeon participant can be absent from the requested page.
    // Never treat a rejected historical replay as a transient empty page.
    // Consume only the public error code; do not project private body fields.
    let code = null;
    try {
      const denial = await response.json();
      code = denial?.error?.code ?? null;
    } catch {
      // Malformed denial is still a failed authoritative re-read.
    }
    if (code === 'SEYEON_HISTORY_REVEAL_HOLD') {
      throw new Error('SEYEON_HISTORY_REVEAL_HOLD');
    }
    throw new Error(`Character Room read failed with ${response.status}.`);
  }
  if (!response.ok) {
    throw new Error(`Character Room read failed with ${response.status}.`);
  }

  const envelope = await response.json();
  const { unwrapApiSuccessEnvelope } = await apiEnvelopePromise;
  return parseChatRoomReadPayloadV1(unwrapApiSuccessEnvelope(envelope), {
    expectedThreadId: threadId,
    expectedAfterSequenceNo: afterSequenceNo,
  });
}

async function loadRoomState() {
  const startedAtVisibilityEpoch = sourceVisibilityEpoch;
  if (!threadId || invalidThreadRoute) {
    setComposeStatus('유효한 대화를 다시 선택해 주세요.');
    return false;
  }

  try {
    const activeBearer = await getActiveBearer();
    if (!activeBearer) {
      throw new Error('Character Room read requires an active authenticated or guest bearer.');
    }

    const messages = [];
    const seenMessageIds = new Set();
    const seenCursors = new Set([0]);
    let afterSequenceNo = 0;
    let characterId = null;
    let protectedHistory = false;

    for (;;) {
      const page = await readChatPage(activeBearer, afterSequenceNo);
      if (page.historyWithheld === true) protectedHistory = true;
      if (characterId === null) {
        characterId = page.characterId;
      } else if (page.characterId !== characterId) {
        throw new Error('Character Room read changed character authority across pages.');
      }

      for (const message of page.messages) {
        if (seenMessageIds.has(message.messageId)) {
          throw new Error('Character Room read repeated a message across pages.');
        }
        seenMessageIds.add(message.messageId);
        messages.push(message);
      }

      if (!page.pagination.hasMore) break;
      const next = page.pagination.nextAfterSequenceNo;
      if (
        !Number.isSafeInteger(next)
        || next <= afterSequenceNo
        || seenCursors.has(next)
      ) {
        throw new Error('Character Room read returned a non-advancing page cursor.');
      }
      seenCursors.add(next);
      afterSequenceNo = next;
    }

    if (characterId === null) {
      throw new Error('Character Room read omitted character authority.');
    }
    // Current session must still match the credentials used for the entire
    // owner-scoped read. No private body or Memory offer survives a change.
    const latestBearer = await getActiveBearer();
    if (sourceVisibilityEpoch !== startedAtVisibilityEpoch) {
      throw new Error('Memory source invalidated during room read.');
    }
    if (latestBearer?.kind !== activeBearer.kind ||
        latestBearer?.token !== activeBearer.token) {
      throw new Error('Character Room Member session changed during read.');
    }
    authoritativeCharacterId = characterId;
    renderRoomState(Object.freeze({
      characterId,
      messages: Object.freeze(messages),
      historyWithheld:protectedHistory,
      memberReadAllowed:activeBearer.kind === 'member',
    }));
    return true;
  } catch (error) {
    // A failed authoritative history re-read cannot leave a previously
    // rendered DOM transcript/Relationship-derived presentation accessible.
    // This also applies to malformed denial envelopes and changed owners.
    clearOwnerScopedRoomStateForAuthorityChange();
    setComposeStatus(
      error instanceof Error && error.message === 'SEYEON_HISTORY_REVEAL_HOLD'
        ? '이전 대화 기록은 서버의 개인정보 보호 조치로 표시할 수 없습니다.'
        : '현재 대화 기록 연결을 사용할 수 없습니다.',
    );
    return false;
  }
}

// Resolve or reuse an owner-scoped thread in the current document. Never
// navigate away on the first message: the server decides thread identity,
// while this UI updates only the URL after the canonical response.
function ensureRoomReady() {
  if (roomReady) return Promise.resolve(true);
  if (roomBootPromise) return roomBootPromise;

  roomBootPromise = (async () => {
    const initialVisibilityEpoch = sourceVisibilityEpoch;
    if (invalidThreadRoute) {
      setComposeStatus('대화 주소가 올바르지 않습니다. 연결자를 다시 선택해 주세요.');
      return false;
    }
    try {
      if (!threadId) {
        if (!requestedCharacterId) {
          setComposeStatus('대화 상대를 확인할 수 없습니다.');
          return false;
        }
        const opened = await chatOpenClient.openForCanonicalCharacter({
          characterId: requestedCharacterId,
        });
        threadId = opened.threadId;
        window.history.replaceState(window.history.state, '', buildChatThreadUrlV1(threadId));
      }

      const loaded = await loadRoomState();
      if (!loaded || sourceVisibilityEpoch !== initialVisibilityEpoch) return false;
      roomReady = true;
      if (retryButton) retryButton.hidden = true;
      setComposeStatus(historyWithheld
        ? '이전 대화 기록은 개인정보 보호를 위해 표시하지 않습니다. 새 AI 답변은 아직 준비 중입니다.'
        : '');
      restorePendingDraft();
      return true;
    } catch (error) {
      setComposeStatus(chatOpenFailureMessage(error));
      return false;
    }
  })().then((ready) => {
    if (!ready) {
      const message = composeStatusSource || '대화를 불러오지 못했습니다.';
      if (roomLoading) {
        roomLoading.hidden = false;
        setRoomLoadingStatus(message);
      }
      if (retryButton && !invalidThreadRoute) retryButton.hidden = false;
    } else if (roomLoading) {
      roomLoading.hidden = true;
    }
    return ready;
  }).finally(() => {
    roomBootPromise = null;
  });

  return roomBootPromise;
}

async function sendTurn(message) {
  if (authoritativeCharacterId !== 'seyeon') {
    setComposeStatus('현재 운영 메시지 전송은 세연 대화에서만 사용할 수 있습니다.');
    return;
  }

  if (sendingTurn) return;

  sendingTurn = true;
  const sendVisibilityEpoch = sourceVisibilityEpoch;
  setComposerBusy(true);
  setComposeStatus('세연이 답하고 있습니다…');
  const pendingTurn = getOrCreatePendingTurn(message);
  const submittedThreadId = threadId;

  try {
    const activeBearer = await getActiveBearer();
    if (!activeBearer || activeBearer.kind !== 'member') {
      throw new Error('MEMBER_REQUIRED');
    }
    let acknowledgedReply;
    try {
      acknowledgedReply = await sendSeyeonBrowserTurnWithReceiptV1({
        origin: window.location.origin,
        bearer: activeBearer.token,
        threadId: submittedThreadId,
        turn: { clientTurnId: pendingTurn.clientTurnId, text: pendingTurn.text },
        language: getUiLocale(),
        localeHeaders: getUiLocaleRequestHeadersV1(),
      });
    } catch (error) {
      if (error instanceof MyeongHaApiClientErrorV1) {
        if (error.status === 401 || error.code === 'AUTH_REQUIRED') {
          invalidateRejectedBearer(activeBearer);
          throw new Error('AUTH_REQUIRED');
        }
        if (error.code === 'IDEMPOTENCY_CONFLICT') {
          clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId);
          throw new Error('IDEMPOTENCY_CONFLICT');
        }
        if (error.code === 'INSUFFICIENT_CREDITS' || error.code === 'CREDIT_INSUFFICIENT') {
          document.dispatchEvent(new CustomEvent('myeongha:credit-shortage', {
            detail: { turnId: pendingTurn.clientTurnId },
          }));
          throw new Error('CREDIT_SHORTAGE');
        }
        if (error.code === 'SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE' ||
            error.code === 'CREDIT_AUTHORITY_UNAVAILABLE') {
          throw new Error('AI_TURN_NOT_YET_AVAILABLE');
        }
        if (error.status === 403) throw new Error('MEMBER_REQUIRED');
        if (['CONTENT_INCOMPATIBLE', 'CAPABILITY_UNAVAILABLE', 'TURN_IN_FLIGHT',
          'AI_TEMPORARILY_UNAVAILABLE'].includes(error.code)) {
          throw new Error(error.code);
        }
        throw new Error(error.kind === 'malformed_response'
          ? 'INVALID_RESPONSE' : 'TURN_SEND_FAILED');
      }
      // Includes a syntactically invalid or unacknowledged delivery receipt.
      // Leave the draft and stable clientTurnId intact for reconciliation.
      throw new Error('INVALID_RESPONSE');
    }

    // The receipt ACK is already complete. Retire the idempotency draft
    // before a refresh or session change can make a successful turn retryable.
    clearPendingTurn(pendingTurn.clientTurnId, submittedThreadId);
    // A protected history GET may legitimately return 503. Never use it as
    // positive receipt confirmation or as a reason to resend this turn.
    const currentBearer = await getActiveBearer();
    if (sourceVisibilityEpoch !== sendVisibilityEpoch) {
      throw new Error('SOURCE_INVALIDATED');
    }
    if (currentBearer?.kind !== 'member' ||
        currentBearer.token !== activeBearer.token ||
        authoritativeCharacterId !== 'seyeon' ||
        threadId !== submittedThreadId) {
      // Never render a private reply into a different Member or thread.
      throw new Error('AUTH_REQUIRED');
    }

    if (messageInput instanceof HTMLTextAreaElement) {
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }
    const presented = renderAcknowledgedSeyeonFirstReply(acknowledgedReply);
    setComposeStatus(presented
      ? '세연의 답변이 도착했습니다.'
      : '현재 대화 기록 연결을 사용할 수 없습니다.');
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const messageByCode = {
      AUTH_REQUIRED: '로그인 상태가 만료되었습니다. 다시 로그인해 주세요.',
      SOURCE_INVALIDATED: '기억 접근 권한이 변경되어 이전 세연 답변을 표시하지 않습니다. 이후 접근 여부는 서버에서 다시 확인합니다.',
      MEMBER_REQUIRED: '현재 웹 실대화는 회원 계정에서만 사용할 수 있습니다.',
      CONTENT_INCOMPATIBLE: '현재 웹 버전과 세연 대화 콘텐츠가 맞지 않습니다.',
      CAPABILITY_UNAVAILABLE: '세연 실대화 운영 연결을 지금 사용할 수 없습니다.',
      TURN_IN_FLIGHT: '이전 메시지를 처리 중입니다. 잠시 후 다시 보내 주세요.',
      IDEMPOTENCY_CONFLICT: '같은 전송 식별자가 다른 내용과 충돌했습니다.',
      AI_TEMPORARILY_UNAVAILABLE: '세연의 답변 생성이 잠시 지연되고 있습니다. 다시 시도해 주세요.',
      AI_TURN_NOT_YET_AVAILABLE: '현재 세연의 AI 메시지 전송은 운영 준비 중입니다. 크레딧 예약·정산 연결이 완료되지 않아 전송할 수 없으며, 입력한 내용은 보존했습니다.',
      INVALID_RESPONSE: '대화 서버 응답을 확인할 수 없습니다.',
      TURN_SEND_FAILED: '메시지를 보내지 못했습니다. 입력한 내용은 그대로 남아 있습니다.',
      CREDIT_SHORTAGE: '크레딧 안내를 확인해 주세요. 입력한 내용은 그대로 남아 있습니다.',
      AUTHORITATIVE_REREAD_FAILED: '전송 결과를 다시 확인하지 못했습니다. 같은 문장으로 다시 보내면 중복 생성 없이 확인을 이어갑니다.',
    };
    setComposeStatus(
      messageByCode[code] ??
      '메시지를 보내지 못했습니다. 입력한 내용은 그대로 남아 있습니다.',
    );
  } finally {
    sendingTurn = false;
    setComposerBusy(false);
  }
}

function submitTurn(event) {
  if (!(event instanceof CustomEvent)) return;
  event.preventDefault();

  const message = event.detail?.message;
  if (typeof message !== 'string' || message.trim().length === 0) return;

  if (invalidThreadRoute) {
    setComposeStatus('대화 주소가 올바르지 않아 메시지를 보낼 수 없습니다.');
    return;
  }

  if (!roomReady) {
    if (queuedSubmission) return;
    queuedSubmission = true;
    setComposerBusy(true);
    void ensureRoomReady().then((ready) => {
      if (ready) return sendTurn(message.trim());
    }).finally(() => {
      queuedSubmission = false;
      if (!sendingTurn) setComposerBusy(false);
    });
    return;
  }

  void sendTurn(message.trim());
}

// Withdrawal ACK is a presentation-invalidation signal ONLY. It carries no
// identity or private text, does not authorize replay and cannot revoke DB
// consent. Suppress stale in-flight chat loads and AI responses in this tab.
subscribeSeyeonMemoryVisibilityInvalidationV1(() => {
  if (authoritativeCharacterId !== null && authoritativeCharacterId !== 'seyeon') return;
  sourceVisibilityEpoch += 1;
  clearOwnerScopedRoomStateForAuthorityChange();
  setComposeStatus('기억 접근 철회 요청이 확인되어 이전 세연 답변을 숨겼습니다. 이후 접근 권한은 서버에서 다시 확인합니다.');
});

document.addEventListener('myeongha:chat-submit', submitTurn);
retryButton?.addEventListener('click', () => {
  if (roomLoading) setRoomLoadingStatus('대화 연결을 다시 확인하고 있습니다…');
  if (retryButton) retryButton.hidden = true;
  void ensureRoomReady();
});
window.addEventListener('storage', (event) => {
  if (event.key !== PRODUCT_AUTH_STORAGE_V1.memberSession) return;
  if (!shouldReloadChatForMemberSessionStorageChange({
    pathname: window.location.pathname,
    oldValue: event.oldValue,
    newValue: event.newValue,
  })) return;
  clearOwnerScopedRoomStateForAuthorityChange();
  window.location.reload();
});
void ensureRoomReady();
