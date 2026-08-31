const params = new URLSearchParams(window.location.search);
const threadId = params.get('threadId');
const room = window.MyeongHaCharacterRoom;
const characterKey = room?.characterKey ?? document.body.dataset.character ?? 'baekheon';
const characterName = room?.characterName ?? document.querySelector('[data-character-name]')?.textContent ?? '대리자';

const historyList = document.querySelector('[data-history-list]');
const historyEmpty = document.querySelector('[data-history-empty]');
const contextPill = document.querySelector('[data-context-pill]');
const contextTitle = document.querySelector('[data-context-title]');
const composeStatus = document.querySelector('[data-compose-status]');
const composer = document.querySelector('[data-composer]');
const messageInput = document.querySelector('[data-message-input]');
const sendButton = document.querySelector('.character-send-button');

let lastSequenceNo = 0;

function setComposeStatus(message) {
  if (composeStatus) composeStatus.textContent = message;
}

function setBusy(busy) {
  if (composer) composer.dataset.runtimeBusy = String(busy);
  if (sendButton instanceof HTMLButtonElement) sendButton.disabled = busy;
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
  if (!Array.isArray(payload.messages)) {
    throw new Error('Character Room runtime did not return an authoritative message stream.');
  }
  if (!Number.isSafeInteger(payload.lastSequenceNo) || payload.lastSequenceNo < 0) {
    throw new Error('Character Room runtime returned an invalid sequence cursor.');
  }
  return payload;
}

function renderHistory(messages) {
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
    if (message.senderType === 'user') {
      strong.textContent = '나';
    } else if (message.senderType === 'character') {
      strong.textContent = message.characterId ? characterName : '대리자';
    } else {
      strong.textContent = '대화 기록';
    }

    const paragraph = document.createElement('p');
    if (message.redacted === true) {
      paragraph.textContent = '삭제된 메시지입니다.';
    } else if (typeof message.bodyText === 'string' && message.bodyText.trim().length > 0) {
      paragraph.textContent = message.bodyText;
    } else {
      paragraph.textContent = '표시할 수 있는 텍스트가 없습니다.';
    }

    article.append(time, strong, paragraph);
    historyList.append(article);
  });
}

function renderRoomState(payload) {
  const state = assertRoomState(payload);
  lastSequenceNo = state.lastSequenceNo;
  renderHistory(state.messages);

  const latest = state.latestCharacterMessage;
  if (
    latest &&
    latest.redacted !== true &&
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
    const url = new URL('/api/chat/thread', window.location.origin);
    url.searchParams.set('threadId', threadId);
    url.searchParams.set('afterSequenceNo', '0');
    url.searchParams.set('character', characterKey);

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Character Room read failed with ${response.status}.`);
    }

    renderRoomState(await response.json());
  } catch {
    if (historyEmpty) {
      historyEmpty.hidden = false;
      historyEmpty.textContent = '현재 지난 대화를 불러올 수 없습니다.';
    }
    setComposeStatus('현재 대화 기록 연결을 사용할 수 없습니다.');
  }
}

async function submitTurn(event) {
  if (!(event instanceof CustomEvent)) return;
  event.preventDefault();

  const message = event.detail?.message;
  if (typeof message !== 'string' || message.trim().length === 0) return;

  if (!threadId) {
    setComposeStatus('먼저 이어갈 대화를 선택해야 합니다. 입력한 내용은 보내지지 않았습니다.');
    return;
  }

  setBusy(true);
  setComposeStatus('보내는 중…');

  try {
    const response = await fetch('/api/chat/turn', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threadId,
        character: characterKey,
        clientTurnId: crypto.randomUUID(),
        text: message.trim(),
        afterSequenceNo: lastSequenceNo,
      }),
    });

    if (!response.ok) {
      throw new Error(`Character Room submit failed with ${response.status}.`);
    }

    const payload = await response.json();
    if (payload?.roomState) {
      renderRoomState(payload.roomState);
    } else {
      await loadRoomState();
    }

    if (messageInput instanceof HTMLTextAreaElement) {
      messageInput.value = '';
      messageInput.style.height = 'auto';
    }
    setComposeStatus('');
  } catch {
    setComposeStatus('메시지를 보내지 못했습니다. 입력한 내용은 그대로 남아 있습니다.');
  } finally {
    setBusy(false);
  }
}

document.addEventListener('myeongha:chat-submit', submitTurn);
void loadRoomState();
