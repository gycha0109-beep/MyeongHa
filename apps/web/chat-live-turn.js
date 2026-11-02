/**
 * Visual-only, immediately rendered turn while the real chat API is working.
 * The temporary bubbles are NEVER treated as server-confirmed history.
 */
export function presentChatLiveTurnV1(stream, input) {
  if (!stream || typeof stream.append !== 'function' ||
      typeof input?.message !== 'string' || input.message.trim().length === 0) {
    return () => {};
  }

  const document = stream.ownerDocument;
  const labels = input.labels ?? {};
  const user = document.createElement('article');
  user.className = 'conversation-message conversation-live-message';
  user.dataset.sender = 'user';
  user.dataset.pending = 'true';
  user.setAttribute('aria-label', labels.sendingAria ?? '전송 중인 메시지');

  const userAvatar = document.createElement('span');
  userAvatar.className = 'conversation-message-avatar';
  userAvatar.setAttribute('aria-hidden', 'true');
  userAvatar.textContent = labels.userLabel ?? '나';
  const userBody = document.createElement('div');
  userBody.className = 'conversation-message-body';
  const userContent = document.createElement('p');
  userContent.textContent = input.message;
  userBody.append(userContent);
  user.append(userAvatar, userBody);

  const typing = document.createElement('article');
  typing.className = 'conversation-message conversation-live-message';
  typing.dataset.sender = 'character';
  typing.dataset.pending = 'true';
  typing.setAttribute('role', 'status');
  typing.setAttribute('aria-label', labels.waitingAria ?? '세연의 답장을 기다리는 중');

  const avatar = document.createElement('span');
  avatar.className = 'conversation-message-avatar';
  avatar.dataset.character = 'seyeon';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = labels.characterAvatar ?? '세';

  const reply = document.createElement('div');
  reply.className = 'conversation-message-body';
  const name = document.createElement('strong');
  name.textContent = labels.characterLabel ?? '세연';
  const bubble = document.createElement('p');
  bubble.className = 'conversation-live-typing';
  bubble.textContent = labels.typingText ?? '답장하는 중';
  const dots = document.createElement('span');
  dots.className = 'conversation-live-dots';
  dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.textContent = '·';
    dots.append(dot);
  }
  bubble.append(dots);
  reply.append(name, bubble);
  typing.append(avatar, reply);

  stream.append(user, typing);
  stream.scrollTop = stream.scrollHeight;

  let cleared = false;
  return () => {
    if (cleared) return;
    cleared = true;
    user.remove();
    typing.remove();
  };
}


/**
 * Repaint only ephemeral labels; never rewrite the user's pending message.
 * This also handles a locale switch while a request is in flight.
 */
export function repaintPendingChatLiveTurnV1(stream, labels) {
  if (!stream || !labels) return;
  const pendingUser = stream.querySelector('.conversation-live-message[data-sender="user"][data-pending="true"]');
  if (pendingUser) {
    pendingUser.setAttribute('aria-label', labels.sendingAria);
    const avatar = pendingUser.querySelector('.conversation-message-avatar');
    if (avatar) avatar.textContent = labels.userLabel;
  }
  const pendingCharacter = stream.querySelector('.conversation-live-message[data-sender="character"][data-pending="true"]');
  if (pendingCharacter) {
    pendingCharacter.setAttribute('aria-label', labels.waitingAria);
    const avatar = pendingCharacter.querySelector('.conversation-message-avatar');
    const name = pendingCharacter.querySelector('.conversation-message-body > strong');
    const typing = pendingCharacter.querySelector('.conversation-live-typing');
    if (avatar) avatar.textContent = labels.characterAvatar;
    if (name) name.textContent = labels.characterLabel;
    if (typing) {
      const dots = typing.querySelector('.conversation-live-dots');
      typing.textContent = labels.typingText;
      if (dots) typing.append(dots);
    }
  }
}

/**
 * Append receipt-ACKed turns to the visible *current-document* conversation.
 * This is not a stored transcript or a permission to replay private history.
 * The caller verifies the active Member/thread after ACK before rendering.
 */
export function presentAcknowledgedChatTurnV1(stream, input) {
  const userText = input?.userText;
  const assistantText = input?.assistantText;
  const turnId = input?.turnId;
  if (!stream || typeof stream.append !== 'function' ||
      typeof userText !== 'string' || !userText.trim() ||
      typeof assistantText !== 'string' || !assistantText.trim() ||
      typeof turnId !== 'string' || !turnId.trim()) return false;

  // An ACK may be replayed when the initial response was lost. The same
  // logical turn must never appear twice in the active DOM.
  for (const node of Array.from(stream.children ?? [])) {
    if (node.dataset?.acknowledgedTurn === turnId) return false;
  }

  const doc = stream.ownerDocument;
  const article = (sender, avatarLabel, headingLabel, text) => {
    const root = doc.createElement('article');
    root.className = 'conversation-message';
    root.dataset.sender = sender;
    root.dataset.acknowledgedTurn = turnId;
    if (sender === 'character') root.dataset.messageCharacterId = 'seyeon';

    const avatar = doc.createElement('span');
    avatar.className = 'conversation-message-avatar';
    avatar.dataset.character = sender === 'user' ? 'user' : 'runtime-character';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = avatarLabel;

    const body = doc.createElement('div');
    body.className = 'conversation-message-body';
    const heading = doc.createElement('div');
    heading.className = 'conversation-message-heading';
    const name = doc.createElement('strong');
    name.textContent = headingLabel;
    heading.append(name);
    const paragraph = doc.createElement('p');
    paragraph.dataset.chatBodySource = '';
    paragraph.textContent = text;
    body.append(heading, paragraph);
    root.append(avatar, body);
    return root;
  };

  const user = article('user', input.userLabel ?? '나', input.userLabel ?? '나', userText);
  const seyeon = article('character', input.characterAvatar ?? '세', input.characterLabel ?? '세연', assistantText);
  stream.append(user, seyeon);
  stream.scrollTop = stream.scrollHeight;
  return true;
}
