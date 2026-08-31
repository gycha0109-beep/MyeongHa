const characters = {
  baekheon: {
    name: '백헌',
    title: '충추원의 장',
    sceneLabel: '백헌의 야간 기록실',
    context: '퇴사를 고민했던 이야기',
    line: ['결정하지 못한 게 아닙니다.', '어느 쪽의 책임을 질지, 아직 정하지 않은 거죠.'],
    history: [
      ['8월 24일', '퇴사를 고민했던 이야기', '남기로 결정했다고 이야기했습니다.'],
      ['8월 18일', '선택을 미루고 있던 이유', '안정과 하고 싶은 일 사이의 고민을 나눴습니다.'],
    ],
  },
  seyeon: {
    name: '세연',
    title: '무녀',
    sceneLabel: '세연의 따뜻한 낮 생활 공간',
    context: '오늘의 마음을 물어본 이야기',
    line: ['오늘은 좀 괜찮았어요?', '억지로 괜찮은 척하지 않아도 돼요.'],
    history: [
      ['8월 31일', '오늘의 마음을 물어본 이야기', '하루가 어땠는지 천천히 이야기했습니다.'],
      ['8월 26일', '가족 이야기를 나눈 날', '걱정하던 일이 조금 가라앉았다고 말했습니다.'],
    ],
  },
  yeoul: {
    name: '여울',
    title: '설계관 기록관',
    sceneLabel: '여울의 회보라 기록 공간',
    context: '결정을 미루고 있던 이야기',
    line: ['또 생각만 하고 있었죠?', '답이 없어서가 아니라, 고르기 싫은 걸 수도 있어요.'],
    history: [
      ['8월 30일', '결정을 미루고 있던 이야기', '선택지를 줄이지 못한 이유를 이야기했습니다.'],
    ],
  },
  seorin: {
    name: '서린',
    title: '기억 서고지기',
    sceneLabel: '서린의 조용한 기록 서고',
    context: '예전에 남긴 말을 다시 본 이야기',
    line: ['그때 했던 말을 아직 기억하고 있어요.', '지금 다시 보면, 조금 다르게 읽힐지도 모르겠네요.'],
    history: [
      ['8월 29일', '예전에 남긴 말을 다시 본 이야기', '오래된 선택을 지금의 시선으로 다시 살펴봤습니다.'],
    ],
  },
  rahyeon: {
    name: '라현',
    title: '대리자',
    sceneLabel: '라현의 낮은 조도 응접 공간',
    context: '마음을 숨기고 있던 이야기',
    line: ['말하지 않아도 되는 건 맞아요.', '다만 숨기고 있다는 사실까지 없어지는 건 아니죠.'],
    history: [
      ['8월 28일', '마음을 숨기고 있던 이야기', '말하지 않은 감정이 선택에 미치는 영향을 이야기했습니다.'],
    ],
  },
  mira: {
    name: '미라',
    title: '대리자',
    sceneLabel: '미라의 담백한 현대 생활 공간',
    context: '괜찮다고 넘기려던 이야기',
    line: ['굳이 멀쩡한 척할 필요는 없잖아요.', '말하고 싶을 때 말하면 돼요.'],
    history: [
      ['8월 27일', '괜찮다고 넘기려던 이야기', '별일 아닌 척했던 일을 편하게 꺼내봤습니다.'],
    ],
  },
  taegyeom: {
    name: '태겸',
    title: '대리자',
    sceneLabel: '태겸의 절제된 회색 공간',
    context: '스스로 납득하지 못한 선택 이야기',
    line: ['남에게 설명할 필요는 없습니다.', '적어도 본인은 납득하고 선택해야죠.'],
    history: [
      ['8월 25일', '스스로 납득하지 못한 선택 이야기', '타인의 기준과 자신의 기준을 분리해봤습니다.'],
    ],
  },
  yunho: {
    name: '윤호',
    title: '대리자',
    sceneLabel: '윤호의 따뜻한 목재 서재',
    context: '조금 쉬어도 되는지 물어본 이야기',
    line: ['지금 당장 답을 내지 않아도 괜찮습니다.', '생각할 여유가 있어야 보이는 것도 있으니까요.'],
    history: [
      ['8월 23일', '조금 쉬어도 되는지 물어본 이야기', '멈추는 것과 포기하는 것의 차이를 이야기했습니다.'],
    ],
  },
  doyoon: {
    name: '도윤',
    title: '대리자',
    sceneLabel: '도윤의 자유롭고 비공식적인 공간',
    context: '계획대로 안 된 이야기',
    line: ['계획이 틀어졌다고 끝난 건 아니잖아요.', '오히려 이제부터가 좀 재밌을 수도 있고.'],
    history: [
      ['8월 22일', '계획대로 안 된 이야기', '예정과 달라진 상황을 다른 방향에서 봤습니다.'],
    ],
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

document.querySelectorAll('[data-context-title]').forEach((node) => {
  node.textContent = character.context;
});

document.querySelectorAll('[data-history-character-name]').forEach((node) => {
  node.textContent = `${character.name}과 나눈 이야기`;
});

const scene = document.querySelector('[data-character-scene]');
if (scene) {
  scene.setAttribute('aria-label', character.sceneLabel);
}

const dialogueLine = document.querySelector('[data-dialogue-line]');
if (dialogueLine) {
  dialogueLine.replaceChildren();
  character.line.forEach((line, index) => {
    if (index > 0) dialogueLine.append(document.createElement('br'));
    dialogueLine.append(document.createTextNode(line));
  });
}

const historyList = document.querySelector('[data-history-list]');
if (historyList) {
  historyList.replaceChildren();
  character.history.forEach(([date, title, summary]) => {
    const article = document.createElement('article');
    article.className = 'history-entry';

    const time = document.createElement('time');
    time.textContent = date;

    const strong = document.createElement('strong');
    strong.textContent = title;

    const paragraph = document.createElement('p');
    paragraph.textContent = summary;

    article.append(time, strong, paragraph);
    historyList.append(article);
  });
}

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
continueButton?.addEventListener('click', () => {
  openHistory();
});

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
    detail: { characterKey, message: value },
  });

  const handled = !composer.dispatchEvent(submitEvent);
  if (!handled && composeStatus) {
    composeStatus.textContent = '대화 UI는 준비되었습니다. 실제 응답은 서버 chat runtime 연결 후 표시됩니다.';
  }

  if (messageInput) {
    messageInput.value = '';
    messageInput.style.height = 'auto';
  }
});
