import { READER_PRESENTATIONS } from './reader-presentation-catalog.js';

// Shared presentation only. Product availability and any paid/server authority
// remain owned by each caller; this component cannot grant Reader access.
export function createDelegatePicker({
  titleId,
  titleText = '어떤 대리자와 함께 볼까요?',
  description,
  targetLabel,
  note,
  resolveOption,
  onSelect,
}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'reading-reader-picker';

  const panel = document.createElement('div');
  panel.className = 'reading-reader-picker-panel';

  const close = document.createElement('button');
  close.className = 'reading-reader-picker-close';
  close.type = 'button';
  close.setAttribute('aria-label', '대리자 선택 닫기');
  close.textContent = '×';

  const intro = document.createElement('div');
  intro.className = 'reading-reader-picker-intro';

  const kicker = document.createElement('span');
  kicker.className = 'reading-reader-picker-kicker';
  kicker.textContent = '대리자';

  const heading = document.createElement('h2');
  heading.id = titleId;
  heading.textContent = titleText;

  const copy = document.createElement('p');
  copy.textContent = description;

  const target = document.createElement('span');
  target.className = 'reading-reader-picker-target';
  target.dataset.readerPickerTarget = '';
  target.textContent = targetLabel;
  intro.append(kicker, heading, copy, target);

  const tools = document.createElement('div');
  tools.className = 'reading-reader-picker-tools';
  const search = document.createElement('input');
  search.className = 'reading-reader-picker-search';
  search.type = 'search';
  search.setAttribute('aria-label', '대리자 검색');
  search.placeholder = '이름이나 설명으로 대리자 찾기';
  tools.append(search);

  const grid = document.createElement('div');
  grid.className = 'reading-reader-picker-grid';
  grid.setAttribute('role', 'list');

  for (const reader of READER_PRESENTATIONS) {
    const optionState = resolveOption(reader);
    const button = document.createElement('button');
    button.className = 'reading-reader-option';
    button.type = 'button';
    button.dataset.readerKey = reader.key;
    button.dataset.readerSearch = [reader.name, reader.title, reader.tone]
      .join(' ').toLocaleLowerCase('ko-KR');
    if (optionState.stage) button.dataset.readerRolloutState = optionState.stage;
    button.disabled = optionState.selectable === false;
    if (button.disabled) button.classList.add('is-unavailable');
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', optionState.ariaLabel ||
      (button.disabled ? reader.name + ' 대리자 준비 중' : reader.name + ' 선택'));

    const art = document.createElement('span');
    art.className = 'reading-reader-option-art';
    const image = document.createElement('img');
    image.src = reader.portrait;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    art.append(image);

    const body = document.createElement('span');
    body.className = 'reading-reader-option-copy';
    const nameRow = document.createElement('span');
    nameRow.className = 'reading-reader-option-heading';
    const name = document.createElement('strong');
    name.textContent = reader.name;
    const subtitle = document.createElement('small');
    subtitle.textContent = optionState.title ?? reader.title;
    nameRow.append(name, subtitle);

    const tone = document.createElement('span');
    tone.className = 'reading-reader-option-tone';
    tone.textContent = optionState.tone ?? reader.tone;

    const action = document.createElement('span');
    action.className = 'reading-reader-option-action';
    action.textContent = optionState.action || '이 대리자와 보기 →';
    body.append(nameRow, tone, action);
    button.append(art, body);
    grid.append(button);
  }

  const empty = document.createElement('p');
  empty.className = 'reading-reader-picker-empty';
  empty.hidden = true;
  empty.textContent = '검색과 일치하는 대리자가 없습니다.';

  const footnote = document.createElement('p');
  footnote.className = 'reading-reader-picker-note';
  footnote.textContent = note;

  panel.append(close, intro, tools, grid, empty, footnote);
  dialog.append(panel);
  dialog.setAttribute('aria-labelledby', heading.id);
  document.body.append(dialog);

  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase('ko-KR');
    let count = 0;
    for (const button of grid.querySelectorAll('[data-reader-key]')) {
      const visible = (button.dataset.readerSearch || '').includes(query);
      button.hidden = !visible;
      if (visible) count += 1;
    }
    empty.hidden = count > 0;
  };

  search.addEventListener('input', filter);
  close.addEventListener('click', () => dialog.close('close'));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('backdrop');
  });
  dialog.addEventListener('close', () => {
    search.value = '';
    filter();
  });
  grid.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-reader-key]') : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    const reader = READER_PRESENTATIONS.find((item) => item.key === button.dataset.readerKey);
    if (!reader) return;
    onSelect(reader);
    dialog.close('reader-selected');
  });

  function open({ selectedKey = null, targetText = null } = {}) {
    if (targetText !== null) target.textContent = targetText;
    for (const button of grid.querySelectorAll('[data-reader-key]')) {
      const isSelected = selectedKey !== null && button.dataset.readerKey === selectedKey;
      button.classList.toggle('is-selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    }
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const focus = grid.querySelector(selectedKey
      ? '[data-reader-key="' + selectedKey + '"]:not(:disabled)'
      : '[data-reader-key]:not(:disabled)');
    if (focus instanceof HTMLButtonElement) focus.focus();
    else search.focus();
  }

  return { dialog, open };
}
