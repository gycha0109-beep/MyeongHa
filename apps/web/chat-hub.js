const people = Object.freeze([
  {
    key: 'seyeon',
    name: '세연',
    title: '무녀',
    line: '왔네요. 오늘은 어떤 이야기부터 해볼까요?',
    tags: ['밝고 가까운', '따뜻한', '편하게'],
  },
  {
    key: 'baekheon',
    name: '백헌',
    title: '충추원의 장',
    line: '이야기를 시작하죠. 지금 가장 먼저 꺼내고 싶은 것은 무엇입니까?',
    tags: ['선택과 책임', '차분한', '직설적인'],
  },
  {
    key: 'yeoul',
    name: '여울',
    title: '설계관 기록관',
    line: '그래서, 무슨 얘기인데요? 듣고는 있을게요.',
    tags: ['새침한', '빠른 반응', '솔직한'],
  },
  {
    key: 'seorin',
    name: '서린',
    title: '기억 서고지기',
    line: '천천히 말씀해 주세요. 지금부터 함께 볼게요.',
    tags: ['조용한', '기억', '천천히'],
  },
  {
    key: 'rahyeon',
    name: '라현',
    title: '대리자',
    line: '말해봐요. 어디서부터 시작할지는 당신이 정해요.',
    tags: ['성숙한', '긴장감', '주도적인'],
  },
  {
    key: 'mira',
    name: '미라',
    title: '대리자',
    line: '편하게 말해요. 듣고 있을게요.',
    tags: ['무심다정', '친구 같은', '담백한'],
  },
  {
    key: 'taegyeom',
    name: '태겸',
    title: '대리자',
    line: '핵심부터 말해보죠. 무엇이 가장 걸립니까?',
    tags: ['차가운', '까다로운', '핵심부터'],
  },
  {
    key: 'yunho',
    name: '윤호',
    title: '대리자',
    line: '천천히 말씀하셔도 됩니다. 어떤 이야기부터 시작할까요?',
    tags: ['따뜻한', '안정적인', '지적인'],
  },
  {
    key: 'doyoon',
    name: '도윤',
    title: '대리자',
    line: '자, 무슨 얘기부터 해볼까요? 편하게 말해요.',
    tags: ['자유로운', '능청스러운', '가벼운'],
  },
]);

const peopleGrid = document.querySelector('[data-people-grid]');
const peopleSearch = document.querySelector('[data-people-search]');
const peopleMore = document.querySelector('[data-people-more]');
const searchEmpty = document.querySelector('[data-search-empty]');
const continuationEmpty = document.querySelector('[data-continuation-empty]');
const continuationActive = document.querySelector('[data-continuation-active]');
const continuationName = document.querySelector('[data-continuation-name]');
const continuationTitle = document.querySelector('[data-continuation-title]');
const continuationContext = document.querySelector('[data-continuation-context]');
const continuationInitial = document.querySelector('[data-continuation-initial]');
const continuationLink = document.querySelector('[data-continuation-link]');
const continuationScene = document.querySelector('[data-continuation-scene]');
const recentList = document.querySelector('[data-recent-list]');
const recentEmpty = document.querySelector('[data-recent-empty]');
const recentAll = document.querySelector('[data-recent-all]');
const incomingSection = document.querySelector('[data-incoming-section]');
const incomingList = document.querySelector('[data-incoming-list]');

const PAGE_SIZE = 6;
let visibleCount = PAGE_SIZE;
let searchTerm = '';

function safePresentationKey(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,64}$/.test(normalized) ? normalized : null;
}

function roomHref(characterKey) {
  const safeKey = safePresentationKey(characterKey);
  return safeKey ? `chat.html?character=${encodeURIComponent(safeKey)}` : 'chat.html';
}

function findPerson(characterKey) {
  const safeKey = safePresentationKey(characterKey);
  return safeKey ? people.find((person) => person.key === safeKey) ?? null : null;
}

function createPersonCard(person) {
  const article = document.createElement('article');
  article.className = 'chat-person-card';
  article.dataset.character = person.key;

  const art = document.createElement('div');
  art.className = 'chat-person-art';
  art.setAttribute('aria-hidden', 'true');

  const initial = document.createElement('span');
  initial.className = 'chat-person-initial';
  initial.textContent = person.name;
  art.append(initial);

  const copy = document.createElement('div');
  copy.className = 'chat-person-copy';

  const titleRow = document.createElement('div');
  titleRow.className = 'chat-person-title-row';

  const name = document.createElement('h3');
  name.textContent = person.name;

  const title = document.createElement('span');
  title.textContent = person.title;
  titleRow.append(name, title);

  const line = document.createElement('p');
  line.className = 'chat-person-line';
  line.textContent = person.line;

  const tags = document.createElement('div');
  tags.className = 'chat-person-tags';
  person.tags.slice(0, 3).forEach((tag) => {
    const tagNode = document.createElement('span');
    tagNode.className = 'chat-person-tag';
    tagNode.textContent = tag;
    tags.append(tagNode);
  });

  const action = document.createElement('a');
  action.className = 'chat-person-action';
  action.href = roomHref(person.key);

  const actionLabel = document.createElement('span');
  actionLabel.textContent = '이야기하기';
  const actionArrow = document.createElement('span');
  actionArrow.setAttribute('aria-hidden', 'true');
  actionArrow.textContent = '→';
  action.append(actionLabel, actionArrow);

  copy.append(titleRow, line, tags, action);
  article.append(art, copy);
  return article;
}

function normalizedSearchText(person) {
  return [person.name, person.title, person.line, ...person.tags].join(' ').toLowerCase();
}

function filteredPeople() {
  if (!searchTerm) return people;
  return people.filter((person) => normalizedSearchText(person).includes(searchTerm));
}

function renderPeople() {
  if (!peopleGrid) return;
  const matches = filteredPeople();
  const shouldLimit = searchTerm.length === 0;
  const shown = shouldLimit ? matches.slice(0, visibleCount) : matches;

  peopleGrid.replaceChildren(...shown.map(createPersonCard));

  if (searchEmpty) searchEmpty.hidden = shown.length > 0;
  if (peopleMore) {
    peopleMore.hidden = !shouldLimit || shown.length >= matches.length;
    const label = peopleMore.querySelector('span');
    if (label) label.textContent = '다른 사람 더 보기';
  }
}

peopleSearch?.addEventListener('input', () => {
  searchTerm = peopleSearch.value.trim().toLowerCase();
  renderPeople();
});

peopleMore?.addEventListener('click', () => {
  visibleCount = Math.min(visibleCount + PAGE_SIZE, people.length);
  renderPeople();
});

function setContinuation(state) {
  if (!continuationEmpty || !continuationActive) return;
  if (!state || typeof state !== 'object') {
    continuationEmpty.hidden = false;
    continuationActive.hidden = true;
    return;
  }

  const characterKey = safePresentationKey(state.characterKey);
  if (!characterKey || typeof state.context !== 'string' || !state.context.trim()) {
    continuationEmpty.hidden = false;
    continuationActive.hidden = true;
    return;
  }

  const person = findPerson(characterKey);
  const name = typeof state.name === 'string' && state.name.trim() ? state.name.trim() : person?.name;
  if (!name) {
    continuationEmpty.hidden = false;
    continuationActive.hidden = true;
    return;
  }

  continuationEmpty.hidden = true;
  continuationActive.hidden = false;

  if (continuationName) continuationName.textContent = name;
  if (continuationTitle) continuationTitle.textContent = typeof state.title === 'string' ? state.title : (person?.title ?? '');
  if (continuationContext) continuationContext.textContent = state.context.trim();
  if (continuationInitial) continuationInitial.textContent = name.slice(0, 2);
  if (continuationLink) continuationLink.href = roomHref(characterKey);
  if (continuationScene) continuationScene.dataset.character = characterKey;
}

function createRecentItem(item) {
  const characterKey = safePresentationKey(item?.characterKey);
  if (!characterKey) return null;
  const person = findPerson(characterKey);
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : person?.name;
  if (!name) return null;

  const link = document.createElement('a');
  link.className = 'chat-recent-item';
  link.href = roomHref(characterKey);

  const avatar = document.createElement('span');
  avatar.className = 'chat-recent-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = name.slice(0, 2);

  const copy = document.createElement('span');
  copy.className = 'chat-recent-copy';
  const strong = document.createElement('strong');
  strong.textContent = name;
  const preview = document.createElement('span');
  preview.textContent = typeof item.preview === 'string' ? item.preview : '';
  copy.append(strong, preview);

  const time = document.createElement('time');
  time.className = 'chat-recent-time';
  time.textContent = typeof item.timeLabel === 'string' ? item.timeLabel : '';

  link.append(avatar, copy, time);
  return link;
}

function setRecent(items) {
  if (!recentList || !recentEmpty) return;
  const safeItems = Array.isArray(items)
    ? items.map(createRecentItem).filter(Boolean).slice(0, 5)
    : [];

  if (safeItems.length === 0) {
    recentList.replaceChildren();
    recentList.hidden = true;
    recentEmpty.hidden = false;
    if (recentAll) recentAll.hidden = true;
    return;
  }

  recentList.replaceChildren(...safeItems);
  recentList.hidden = false;
  recentEmpty.hidden = true;
  if (recentAll) recentAll.hidden = safeItems.length < 5;
}

function createIncomingItem(item) {
  const characterKey = safePresentationKey(item?.characterKey);
  if (!characterKey || typeof item?.message !== 'string' || !item.message.trim()) return null;
  const person = findPerson(characterKey);
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : person?.name;
  if (!name) return null;

  const link = document.createElement('a');
  link.className = 'chat-incoming-item';
  link.href = roomHref(characterKey);

  const avatar = document.createElement('span');
  avatar.className = 'chat-recent-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = name.slice(0, 2);

  const copy = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = name;
  const message = document.createElement('p');
  message.textContent = item.message.trim();
  copy.append(strong, message);

  const arrow = document.createElement('span');
  arrow.className = 'chat-incoming-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  link.append(avatar, copy, arrow);
  return link;
}

function setIncoming(items) {
  if (!incomingSection || !incomingList) return;
  const safeItems = Array.isArray(items)
    ? items.map(createIncomingItem).filter(Boolean).slice(0, 3)
    : [];

  if (safeItems.length === 0) {
    incomingList.replaceChildren();
    incomingSection.hidden = true;
    return;
  }

  incomingList.replaceChildren(...safeItems);
  incomingSection.hidden = false;
}

window.MyeongHaChatHub = Object.freeze({
  people,
  setRelationshipState(state = {}) {
    setContinuation(state.continuation ?? null);
    setRecent(state.recent ?? []);
    setIncoming(state.incoming ?? []);
  },
  clearRelationshipState() {
    setContinuation(null);
    setRecent([]);
    setIncoming([]);
  },
});

renderPeople();
setContinuation(null);
setRecent([]);
setIncoming([]);
