const params = new URLSearchParams(window.location.search);
const threadId = params.get('threadId');
const room = window.MyeongHaCharacterRoom;
const characterKey = room?.characterKey ?? document.body.dataset.character ?? 'baekheon';
const characterName = room?.characterName ?? document.querySelector('[data-character-name]')?.textContent ?? '대리자';
const apiEnvelopePromise = import('./api-envelope.js');

const historyList = document.querySelector('[data-history-list]');
const historyEmpty = document.querySelector('[data-history-empty]');
const contextPill = document.querySelector('[data-context-pill]');
const contextTitle = document.querySelector('[data-context-title]');
const composeStatus = document.querySelector('[data-compose-status]');
const chatStream = document.querySelector('[data-chat-stream]');
const chatIntro = document.querySelector('[data-chat-intro]');

function setComposeStatus(message) {
  if (composeStatus) composeStatus.textContent = message;
}

function formatTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '시간 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function assertRoomState(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Character Room runtime returned an invalid response.');
  }
  if (typeof payload.threadId !== 'string' || payload.threadId !== threadId) {
    throw new Error('Character Room runtime returned a different thread identity.');
  }
  if (payload.presentationKey !== characterKey) {
    throw new Error('Character Room runtime returned a different presentation identity.');
  }
  if (typeof payload.characterId !== 'string' || payload.characterId.trim().length === 0) {
    throw new Error('Character Room runtime did not return an authoritative character identity.');
  }
  if (!Array.isArray(payload.messages)) {
    throw new Error('Character Room runtime did not return an authoritative message stream.');
  }
  if (!Number.isSafeInteger(payload.lastSequenceNo) || payload.lastSequenceNo < 0) {
    throw new Error('Character Room runtime returned an invalid sequence cursor.');
  }
  return payload;
}

function senderLabel(message, authoritativeCharacterId) {
  if (message.senderType === 'user') return '나';
  if (message.senderType === 'character') {
    return message.characterId === authoritativeCharacterId ? characterName : '다른 대리자';
  }
  return '대화 기록';
}

function safeMessageText(message) {
  if (message.redacted === true) return '삭제된 메시지입니다.';
  if (typeof message.bodyText === 'string' && message.bodyText.trim().length > 0) return message.bodyText;
  return '표시할 수 있는 텍스트가 없습니다.';
}

function renderHistory(messages, authoritativeCharacterId) {
  if (!historyList) return;
  historyList.replaceChildren();

  if (messages.length === 0) {
    if (historyEmpty) historyEmpty.hidden = false;
    return;
  }

  if (historyEmpty) historyEmpty.hidden = true;

  messages.forEach((message) => {
    if (!message || typeof message !== 'object') return;
    if (!Number.isSafeInteger(message.sequenceNo)) return;
    if (typeof message.senderType !== 'string') return;

    const article = document.createElement('article');
    article.className = 'history-entry';
    article.dataset.sender = message.senderType;
    article.dataset.redacted = String(message.redacted === true);

    const time = document.createElement('time');
    time.textContent = formatTimestamp(message.createdAt);
    if (typeof message.createdAt === 'string') time.dateTime = message.createdAt;

    const strong = document.createElement('strong');
    strong.textContent = senderLabel(message, authoritativeCharacterId);

    const paragraph = document.createElement('p');
    paragraph.textContent = safeMessageText(message);

    article.append(time, strong, paragraph);
    historyList.append(article);
  });
}

function createStreamMessage(message, authoritativeCharacterId) {
  if (!message || typeof message !== 'object') return null;
  if (!Number.isSafeInteger(message.sequenceNo) || typeof message.senderType !== 'string') return null;

  const article = document.createElement('article');
  article.className = 'conversation-message';
  article.dataset.sender = message.senderType;
  article.dataset.redacted = String(message.redacted === true);

  const avatar = document.createElement('span');
  avatar.className = 'conversation-message-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.dataset.character = message.senderType === 'character' ? characterKey : 'user';
  avatar.textContent = message.senderType === 'user' ? '나' : characterName.slice(0, 1);

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
  paragraph.textContent = safeMessageText(message);
  body.append(heading, paragraph);
  article.append(avatar, body);
  return article;
}

function renderConversation(messages, authoritativeCharacterId) {
  if (!chatStream) return;
  const nodes = messages.map((message) => createStreamMessage(message, authoritativeCharacterId)).filter(Boolean);
  if (nodes.length === 0) {
    if (chatIntro) chatIntro.hidden = false;
    return;
  }
  chatStream.replaceChildren(...nodes);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function renderRoomState(payload) {
  const state = assertRoomState(payload);
  renderHistory(state.messages, state.characterId);
  renderConversation(state.messages, state.characterId);

  const latest = state.latestCharacterMessage;
  if (
    latest &&
    latest.redacted !== true &&
    latest.characterId === state.characterId &&
    typeof latest.bodyText === 'string' &&
    latest.bodyText.trim().length > 0
  ) {
    room?.setDialogueText(latest.bodyText);
  }

  // Life Thread / 이어지는 이야기 authority is intentionally not inferred from
  // chat messages. Until a verified continuation projection is supplied, the
  // context pill stays hidden.
  if (contextPill) contextPill.hidden = true;
  if (contextTitle) contextTitle.textContent = '';
}

async function loadRoomState() {
  if (!threadId) {
    if (historyEmpty) {
      historyEmpty.hidden = false;
      historyEmpty.textContent = '이어갈 대화를 선택하면 지난 대화가 여기에 표시됩니다.';
    }
    return;
  }

  try {
    const url = new URL(`/api/chat/${encodeURIComponent(threadId)}`, window.location.origin);
    url.searchParams.set('afterSequenceNo', '0');
    url.searchParams.set('presentationKey', characterKey);

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Character Room read failed with ${response.status}.`);
    }

    const envelope = await response.json();
    const { unwrapApiSuccessEnvelope } = await apiEnvelopePromise;
    renderRoomState(unwrapApiSuccessEnvelope(envelope));
  } catch {
    if (historyEmpty) {
      historyEmpty.hidden = false;
      historyEmpty.textContent = '현재 지난 대화를 불러올 수 없습니다.';
    }
    setComposeStatus('현재 대화 기록 연결을 사용할 수 없습니다.');
  }
}

function submitTurn(event) {
  if (!(event instanceof CustomEvent)) return;
  event.preventDefault();

  const message = event.detail?.message;
  if (typeof message !== 'string' || message.trim().length === 0) return;

  if (!threadId) {
    setComposeStatus('먼저 이어갈 대화를 선택해야 합니다. 입력한 내용은 보내지지 않았습니다.');
    return;
  }

  // ChatRequestV1 requires clientCapability. The current web surface has no
  // source-backed capability acquisition contract or live HTTP adapter, so a
  // valid command cannot be formed without inventing client authority. Keep
  // the user's draft and fail closed before any mutation request is sent.
  setComposeStatus('현재 메시지를 보낼 수 없습니다. 입력한 내용은 그대로 남아 있습니다.');
}

document.addEventListener('myeongha:chat-submit', submitTurn);
void loadRoomState();
