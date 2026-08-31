const readerCatalog = {
  baekheon: {
    name: '백헌',
    title: '충추원의 장',
    intro: '당신의 사주를 바탕으로 지금의 흐름부터 하나씩 살펴보겠습니다.',
    line: '결과를 보고, 그 선택의 귀결까지 함께 보겠습니다.',
  },
  seyeon: {
    name: '세연',
    title: '',
    intro: '복잡하게 시작하지 않을게요. 지금 가장 크게 읽히는 흐름부터 같이 봐요.',
    line: '읽고 나서 마음이 어디에서 조금 편해지는지도 같이 볼게요.',
  },
  yeoul: {
    name: '여울',
    title: '',
    intro: '돌려 말하지 않을게요. 지금 필요한 흐름부터 바로 짚겠습니다.',
    line: '결과가 좋고 나쁘고보다, 지금 뭘 놓치고 있는지가 더 중요하니까요.',
  },
  seorin: {
    name: '서린',
    title: '',
    intro: '지금의 흐름이 예전의 어떤 기록과 이어지는지 천천히 살펴볼게요.',
    line: '한 번 지나간 선택도, 지금의 맥락에서는 다른 의미로 이어질 수 있어요.',
  },
  rahyeon: {
    name: '라현',
    title: '',
    intro: '표면적인 답보다, 당신이 실제로 흔들리는 지점부터 읽어보죠.',
    line: '답을 고르는 것보다 왜 그 답에 끌리는지가 더 재미있을 것 같네요.',
  },
  mira: {
    name: '미라',
    title: '',
    intro: '과하게 의미 붙이지 말고, 지금 쓸 수 있는 정보부터 보죠.',
    line: '결국 중요한 건 이걸 실제 생활에서 어떻게 써먹느냐니까요.',
  },
  taegyeom: {
    name: '태겸',
    title: '',
    intro: '근거 없는 낙관은 빼겠습니다. 확인되는 구조부터 보죠.',
    line: '판단할 거라면 적어도 무엇을 근거로 판단하는지는 분명해야 합니다.',
  },
  yunho: {
    name: '윤호',
    title: '',
    intro: '급하게 결론부터 내리지 않고, 구조와 시기를 차례대로 읽어보겠습니다.',
    line: '조금 천천히 봐도 괜찮습니다. 흐름을 알면 선택지가 더 선명해지니까요.',
  },
  doyoon: {
    name: '도윤',
    title: '',
    intro: '일단 재미없는 설명부터 길게 하진 않을게요. 지금 걸리는 부분부터 보죠.',
    line: '답이 뻔해 보여도, 의외로 다른 길이 하나쯤 숨어 있을 수 있잖아요.',
  },
};

const aliases = new Map([
  ['백헌', 'baekheon'],
  ['세연', 'seyeon'],
  ['여울', 'yeoul'],
  ['서린', 'seorin'],
  ['라현', 'rahyeon'],
  ['미라', 'mira'],
  ['태겸', 'taegyeom'],
  ['윤호', 'yunho'],
  ['도윤', 'doyoon'],
]);

const readingSteps = [
  {
    eyebrow: '읽기 1 / 4',
    title: '지금 읽히는 흐름',
    body: '검증된 Saju Reading의 핵심 흐름 요약이 이 영역에 표시됩니다.',
    structureTitle: '이 흐름을 만드는 구조',
    structureBody: 'Saju Engine이 확정한 구조적 근거와 적용 범위가 표시됩니다.',
  },
  {
    eyebrow: '읽기 2 / 4',
    title: '시기와 변화',
    body: '현재 범위에서 변화가 집중되는 시기와 흐름의 전환점이 표시됩니다.',
    structureTitle: '지금 확인할 기준',
    structureBody: '시기 판단에 실제로 사용된 근거와 제한사항이 함께 표시됩니다.',
  },
  {
    eyebrow: '읽기 3 / 4',
    title: '선택에서 볼 것',
    body: '현재 Reading이 선택과 판단에 제공할 수 있는 범위만 정리해 보여줍니다.',
    structureTitle: '읽기에서 말하지 않는 것',
    structureBody: '미래 확정, 마음 읽기, 확인되지 않은 생활 사실은 Reading 결과로 만들지 않습니다.',
  },
  {
    eyebrow: '읽기 4 / 4',
    title: '이번 읽기의 정리',
    body: '앞 단계의 검증된 결과를 다시 요약하고, 사용자가 이어서 확인할 질문을 제안합니다.',
    structureTitle: '다음으로 이어가기',
    structureBody: '더 깊은 Reading 또는 선택한 캐릭터와의 후속 대화로 이어갈 수 있습니다.',
  },
];

const params = new URLSearchParams(window.location.search);
const requested = params.get('character') || params.get('reader') || 'baekheon';
const normalized = aliases.get(requested) || requested.toLowerCase();
const readerKey = readerCatalog[normalized] ? normalized : 'baekheon';
const reader = readerCatalog[readerKey];

const root = document.body;
root.dataset.reader = readerKey;

document.querySelectorAll('[data-reader-name]').forEach((element) => {
  element.textContent = reader.name;
});
document.querySelectorAll('[data-reader-title]').forEach((element) => {
  element.textContent = reader.title;
  element.hidden = !reader.title;
});
document.querySelectorAll('[data-reader-intro]').forEach((element) => {
  element.textContent = reader.intro;
});
document.querySelectorAll('[data-reader-line]').forEach((element) => {
  element.textContent = reader.line;
});

const portrait = document.querySelector('[data-reader-portrait]');
if (portrait) {
  portrait.setAttribute('aria-label', `${reader.name} 사주 읽기 장면`);
}

const progressLabel = document.querySelector('[data-reading-progress-label]');
const progressDots = [...document.querySelectorAll('[data-reading-progress-dot]')];
const stepTitle = document.querySelector('[data-reading-step-title]');
const stepBody = document.querySelector('[data-reading-step-body]');
const structureTitle = document.querySelector('[data-reading-structure-title]');
const structureBody = document.querySelector('[data-reading-structure-body]');
const nextButton = document.querySelector('[data-reading-next]');
const prevButton = document.querySelector('[data-reading-prev]');
let stepIndex = 0;

function renderStep() {
  const step = readingSteps[stepIndex];
  if (progressLabel) progressLabel.textContent = step.eyebrow;
  if (stepTitle) stepTitle.textContent = step.title;
  if (stepBody) stepBody.textContent = step.body;
  if (structureTitle) structureTitle.textContent = step.structureTitle;
  if (structureBody) structureBody.textContent = step.structureBody;
  progressDots.forEach((dot, index) => {
    dot.classList.toggle('is-active', index === stepIndex);
    dot.classList.toggle('is-past', index < stepIndex);
  });
  if (prevButton) prevButton.disabled = stepIndex === 0;
  if (nextButton) nextButton.textContent = stepIndex === readingSteps.length - 1 ? '대화로 이어가기' : '다음 읽기';
}

nextButton?.addEventListener('click', () => {
  if (stepIndex === readingSteps.length - 1) {
    window.location.href = `chat.html?character=${encodeURIComponent(readerKey)}&from=reading`;
    return;
  }
  stepIndex += 1;
  renderStep();
});

prevButton?.addEventListener('click', () => {
  if (stepIndex === 0) return;
  stepIndex -= 1;
  renderStep();
});

const chartDialog = document.querySelector('[data-chart-dialog]');
const chartOpen = document.querySelector('[data-chart-open]');
const chartClose = document.querySelector('[data-chart-close]');
chartOpen?.addEventListener('click', () => chartDialog?.showModal());
chartClose?.addEventListener('click', () => chartDialog?.close());
chartDialog?.addEventListener('click', (event) => {
  if (event.target === chartDialog) chartDialog.close();
});

renderStep();
