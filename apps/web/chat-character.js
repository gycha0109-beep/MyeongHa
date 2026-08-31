const characters = {
  baekheon: {
    name: '백헌',
    title: '충추원의 장',
    sceneLabel: '백헌의 야간 기록실',
    intro: ['이야기를 시작하죠.', '지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?'],
  },
  seyeon: {
    name: '세연',
    title: '무녀',
    sceneLabel: '세연의 따뜻한 낮 생활 공간',
    intro: ['왔네요.', '오늘은 어떤 이야기부터 해볼까요?'],
  },
  yeoul: {
    name: '여울',
    title: '설계관 기록관',
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
    title: '대리자',
    sceneLabel: '라현의 낮은 조도 응접 공간',
    intro: ['말해봐요.', '어디서부터 시작할지는 당신이 정해요.'],
  },
  mira: {
    name: '미라',
    title: '대리자',
    sceneLabel: '미라의 담백한 현대 생활 공간',
    intro: ['편하게 말해요.', '듣고 있을게요.'],
  },
  taegyeom: {
    name: '태겸',
    title: '대리자',
    sceneLabel: '태겸의 절제된 회색 공간',
    intro: ['핵심부터 말해보죠.', '무엇이 가장 걸립니까?'],
  },
  yunho: {
    name: '윤호',
    title: '대리자',
    sceneLabel: '윤호의 따뜻한 목재 서재',
    intro: ['천천히 말씀하셔도 됩니다.', '어떤 이야기부터 시작할까요?'],
  },
  doyoon: {
    name: '도윤',
    title: '대리자',
    sceneLabel: '도윤의 자유롭고 비공식적인 공간',
    intro: ['자, 무슨 얘기부터 해볼까요?', '편하게 말해요.'],
  },
};

const params = new URLSearchParams(window.location.search);
const requestedCharacter = (params.get('character') || 'baekheon').toLowerCase();
const characterKey = Object.hasOwn(characters, requestedCharacter) ? requestedCharacter : 'baekheon';
const character = characters[characterKey];
const root = document.body;

root.dataset.character = characterKey;
document.title = `${character.name} · 대화 · 명하`;

document.querySelectorAll('[data-character-name], [data-dialogue-name]').forEach((node) => {
  node.textContent = character.name;
});

document.querySelectorAll('[data-character-title]').forEach((node) => {
  node.textContent = character.title;
});

document.querySelectorAll('[data-history-character-name]').forEach((node) => {
  node.textContent = `${character.name}과 나눈 이야기`;
});

const scene = document.querySelector('[data-character-scene]');
if (scene) {
  scene.setAttribute('aria-label', character.sceneLabel);
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
setDialogueLines(character.intro);

window.MyeongHaCharacterRoom = Object.freeze({
  characterKey,
  characterName: character.name,
  setDialogueText(text) {
    if (typeof text !== 'string' || text.trim().length === 0) return;
    setDialogueLines(text.split(/\n+/).filter(Boolean));
  },
});

const historyDrawer = document.querySelector('[data-history-drawer]');
const historyOpen = document.querySelector('[data-history-open]');
const historyClose = document.querySelector('[data-history-close]');
const scrim = document.querySelector('[data-room-scrim]');
const roomMenu = document.querySelector('[data-room-menu]');
const menuToggle = document.querySelector('[data-menu-toggle]');

function openHistory() {
  historyDrawer?.classList.add('is-open');
  historyDrawer?.setAttribute('aria-hidden', 'false');
  if (scrim) scrim.hidden = false;
}

function closeHistory() {
  historyDrawer?.classList.remove('is-open');
  historyDrawer?.setAttribute('aria-hidden', 'true');
  if (scrim && (!roomMenu || roomMenu.hidden)) scrim.hidden = true;
}

function closeMenu() {
  if (roomMenu) roomMenu.hidden = true;
  if (scrim && !historyDrawer?.classList.contains('is-open')) scrim.hidden = true;
}

historyOpen?.addEventListener('click', openHistory);
historyClose?.addEventListener('click', closeHistory);

menuToggle?.addEventListener('click', () => {
  if (!roomMenu) return;
  roomMenu.hidden = !roomMenu.hidden;
  if (scrim) scrim.hidden = roomMenu.hidden && !historyDrawer?.classList.contains('is-open');
});

scrim?.addEventListener('click', () => {
  closeHistory();
  closeMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeHistory();
    closeMenu();
  }
});

const continueButton = document.querySelector('[data-continue-context]');
continueButton?.addEventListener('click', openHistory);

const composer = document.querySelector('[data-composer]');
const messageInput = document.querySelector('[data-message-input]');
const composeStatus = document.querySelector('[data-compose-status]');

messageInput?.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
});

composer?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = messageInput?.value.trim() ?? '';
  if (!value) return;

  const submitEvent = new CustomEvent('myeongha:chat-submit', {
    bubbles: true,
    cancelable: true,
    detail: Object.freeze({ characterKey, message: value }),
  });

  const handled = !composer.dispatchEvent(submitEvent);
  if (!handled && composeStatus) {
    composeStatus.textContent = '현재 이 대화는 서버 연결이 준비되지 않았습니다. 입력한 내용은 보내지지 않았습니다.';
  }
});
