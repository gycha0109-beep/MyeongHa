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
  const user = document.createElement('article');
  user.className = 'conversation-message conversation-live-message';
  user.dataset.sender = 'user';
  user.dataset.pending = 'true';
  user.setAttribute('aria-label', '전송 중인 메시지');

  const userAvatar = document.createElement('span');
  userAvatar.className = 'conversation-message-avatar';
  userAvatar.setAttribute('aria-hidden', 'true');
  userAvatar.textContent = '나';
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
  typing.setAttribute('aria-label', '세연의 답장을 기다리는 중');

  const avatar = document.createElement('span');
  avatar.className = 'conversation-message-avatar';
  avatar.dataset.character = 'seyeon';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '세';

  const reply = document.createElement('div');
  reply.className = 'conversation-message-body';
  const name = document.createElement('strong');
  name.textContent = '세연';
  const bubble = document.createElement('p');
  bubble.className = 'conversation-live-typing';
  bubble.textContent = '답장하는 중';
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
