import { resolveCharacterDisplayNameV1 } from './character-display-locale.js';
import { resolveCharacterChatIntroV1 } from './character-chat-intro-locale.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { resolveCanonicalCharacterPresentationV1 } from './character-presentation-identity.js';
import { parseChatThreadRouteV1 } from './chat-room-read-contract.js';
const characters = {
  baekheon: {
    name: '백헌',
    title: '베테랑 조정자',
    sceneLabel: '백헌의 야간 기록실',
    intro: ['이야기를 시작하죠.', '지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?'],
  },
  seyeon: {
    name: '세연',
    title: '명하의 안내인',
    sceneLabel: '세연의 따뜻한 오후빛 대화 공간',
    intro: ['왔네요.', '오늘은 어떤 이야기부터 해볼까요?'],
  },
  yeoul: {
    name: '여울',
    title: '운영관리팀 사원',
    sceneLabel: '여울의 회보라 기록 공간',
    intro: ['그래서, 무슨 얘기인데요?', '듣고는 있을게요.'],
  },
  seorin: {
    name: '서린',
    title: '기억 서고지기',
    sceneLabel: '서린의 조용한 기록 서고',
    intro: ['천천히 말씀해 주세요.', '지금부터 함께 볼게요.'],
  },
  rahyeon: {
    name: '라현',
    title: '전시 기획자',
    sceneLabel: '라현의 낮은 조도 응접 공간',
    intro: ['말해봐요.', '어디서부터 시작할지는 당신이 정해요.'],
  },
  mira: {
    name: '미라',
    title: '연결자',
    sceneLabel: '미라의 담백한 현대 생활 공간',
    intro: ['편하게 말해요.', '듣고 있을게요.'],
  },
  taegyeom: {
    name: '태겸',
    title: '프로 격구 선수',
    sceneLabel: '태겸의 절제된 회색 공간',
    intro: ['핵심부터 말해보죠.', '무엇이 가장 걸립니까?'],
  },
  yunho: {
    name: '윤호',
    title: '연결자',
    sceneLabel: '윤호의 따뜻한 목재 서재',
    intro: ['천천히 말씀하셔도 됩니다.', '어떤 이야기부터 시작할까요?'],
  },
  doyun: {
    name: '도윤',
    title: '연결자',
    sceneLabel: '도윤의 자유롭고 비공식적인 공간',
    intro: ['자, 무슨 얘기부터 해볼까요?', '편하게 말해요.'],
  },
};

const params = new URLSearchParams(window.location.search);
const threadRoute = parseChatThreadRouteV1(params);
const threadId = threadRoute.threadId;
const hasThreadRoute = threadRoute.state !== 'none';
const requestedCharacter = params.get('character')?.toLowerCase() ?? null;
const presentationCharacterKey = !hasThreadRoute && requestedCharacter && Object.hasOwn(characters, requestedCharacter)
  ? requestedCharacter
  : null;
const characterKey = presentationCharacterKey ?? (hasThreadRoute ? null : 'baekheon');
const character = characterKey
  ? characters[characterKey]
  : Object.freeze({
      name: '대화 상대',
      title: '서버 확인 중',
      sceneLabel: '대화 상대 확인 중',
      intro: ['대화 상대를 확인하고 있습니다.'],
    });
const root = document.body;
if (characterKey) {
  root.dataset.character = characterKey;
  root.dataset.characterAuthority = 'presentation_hint_only';
} else {
  delete root.dataset.character;
  root.dataset.characterAuthority = threadRoute.state === 'ready'
    ? 'thread_identity_pending'
    : 'thread_identity_invalid';
}
document.title = `${characterKey ? resolveCharacterDisplayNameV1(characterKey, getUiLocale()) : character.name} · ${translateStaticUi('대화 · 명하', getUiLocale())}`;

document.querySelectorAll('[data-character-name], [data-dialogue-name]').forEach((node) => {
  node.textContent = characterKey ? resolveCharacterDisplayNameV1(characterKey, getUiLocale()) : character.name;
});

document.querySelectorAll('[data-character-title]').forEach((node) => {
  node.textContent = translateStaticUi(character.title, getUiLocale());
});

document.querySelectorAll('[data-character-avatar]').forEach((node) => {
  if (characterKey) node.dataset.character = characterKey;
  else delete node.dataset.character;
  node.textContent = (characterKey ? resolveCharacterDisplayNameV1(characterKey, getUiLocale()) : character.name).slice(0, 1);
});

const scene = document.querySelector('[data-character-scene]');
if (scene) {
  scene.setAttribute('aria-label', translateStaticUi(character.sceneLabel, getUiLocale()));
}

const dialogueLine = document.querySelector('[data-dialogue-line]');
function setDialogueLines(lines) {
  if (!dialogueLine) return;
  dialogueLine.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) dialogueLine.append(document.createElement('br'));
    dialogueLine.append(document.createTextNode(line));
  });
}

setDialogueLines(characterKey ? resolveCharacterChatIntroV1(characterKey, getUiLocale()) : character.intro.map(line => translateStaticUi(line, getUiLocale())));

export function applyCanonicalCharacterPresentationV1(characterId) {
  const identity = resolveCanonicalCharacterPresentationV1(characterId);
  if (!identity) return false;
  const next = characters[identity.presentationKey];
  if (!next) return false;

  root.dataset.character = identity.presentationKey;
  root.dataset.characterAuthority = 'canonical_character_id';
  document.title = `${resolveCharacterDisplayNameV1(identity.presentationKey, getUiLocale())} · ${translateStaticUi('대화 · 명하', getUiLocale())}`;

  document.querySelectorAll('[data-character-name], [data-dialogue-name]').forEach((node) => {
    node.textContent = resolveCharacterDisplayNameV1(identity.presentationKey, getUiLocale());
  });
  document.querySelectorAll('[data-character-title]').forEach((node) => {
    node.textContent = translateStaticUi(next.title, getUiLocale());
  });
  document.querySelectorAll('[data-character-avatar]').forEach((node) => {
    node.dataset.character = identity.presentationKey;
    node.textContent = resolveCharacterDisplayNameV1(identity.presentationKey, getUiLocale()).slice(0, 1);
  });
  setDialogueLines(resolveCharacterChatIntroV1(identity.presentationKey, getUiLocale()));
  if (scene) scene.setAttribute('aria-label', translateStaticUi(next.sceneLabel, getUiLocale()));
  return true;
}

// Presentation metadata is observable for the static discovery route only.
window.MyeongHaCharacterRoom = Object.freeze({
  characterKey,
  characterName: character.name,
  characterAuthority: root.dataset.characterAuthority,
});

const composer = document.querySelector('[data-composer]');
const messageInput = document.querySelector('[data-message-input]');
const composeStatus = document.querySelector('[data-compose-status]');

messageInput?.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
});

let messageCompositionActive = false;
messageInput?.addEventListener('compositionstart', () => { messageCompositionActive = true; });
messageInput?.addEventListener('compositionend', () => { messageCompositionActive = false; });

messageInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  // The Enter key can commit an active Korean/other IME composition.
  // It must never submit a partially composed message.
  if (event.isComposing || messageCompositionActive || event.keyCode === 229) return;

  event.preventDefault();
  if (!messageInput.value.trim()) return;
  composer?.requestSubmit();
});

composer?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = messageInput?.value.trim() ?? '';
  if (!value) return;

  const submitEvent = new CustomEvent('myeongha:chat-submit', {
    bubbles: true,
    cancelable: true,
    // Presentation keys are never mutation authority. The transport resolves
    // all canonical Chat identity from the validated thread route.
    detail: Object.freeze({ message: value }),
  });

  const handled = !composer.dispatchEvent(submitEvent);
  if (!handled && composeStatus) {
    composeStatus.textContent = '현재 이 대화는 서버 연결이 준비되지 않았습니다. 입력한 내용은 보내지지 않았습니다.';
  }
});

document.addEventListener('myeongha:localechange', () => {
  const authoritative = root.dataset.characterAuthority === 'canonical_character_id' ? root.dataset.character : null;
  if (authoritative) {
    applyCanonicalCharacterPresentationV1(authoritative);
    return;
  }
  const label = characterKey ? resolveCharacterDisplayNameV1(characterKey, getUiLocale()) : character.name;
  document.title = `${label} · ${translateStaticUi('대화 · 명하', getUiLocale())}`;
  document.querySelectorAll('[data-character-name], [data-dialogue-name]').forEach(node => { node.textContent = label; });
  document.querySelectorAll('[data-character-avatar]').forEach(node => { node.textContent = label.slice(0, 1); });
  if (characterKey) setDialogueLines(resolveCharacterChatIntroV1(characterKey, getUiLocale()));
  else setDialogueLines(character.intro.map(line => translateStaticUi(line, getUiLocale())));
  if (scene) scene.setAttribute('aria-label', translateStaticUi(character.sceneLabel, getUiLocale()));
});
