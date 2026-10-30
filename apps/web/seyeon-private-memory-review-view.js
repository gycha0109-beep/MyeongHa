// Watchtower-Track: security
// UC-07: show a pending fact proposed by the Character, not an original
// Message save button. No DOM inference and no local candidate generation.
import { getUiLocale, translateStaticUi } from './ui-i18n.js';
import { createSeyeonPrivateMemoryReviewClientV1,
  isServerPlannerMemoryProposalV1 } from './seyeon-private-memory-review-client.js';

function t(source) { return translateStaticUi(source, getUiLocale()); }
function element(tag, className, label) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = t(label);
  return node;
}

export function mountSeyeonPrivateMemoryReviewV1(options) {
  const { container, plannerProposal } = options ?? {};
  if (!(container instanceof HTMLElement) || container.isConnected !== true ||
      !isServerPlannerMemoryProposalV1(plannerProposal)) return null;

  const client = options.client ?? createSeyeonPrivateMemoryReviewClientV1();
  const panel = element('section', 's0-memory-proposal-review', '');
  panel.setAttribute('aria-label', t('기억 제안'));
  const caption = element('p', 's0-memory-proposal-description', '세연이 기억하고 싶은 내용');
  const summary = element('p', 's0-memory-proposal-summary', '');
  summary.textContent = plannerProposal.summary;
  const status = element('p', 's0-memory-proposal-status', '');
  status.setAttribute('role', 'status');
  const choices = [
    ['session_only', '이 대화에서만'],
    ['character_only', '이 대리자만 기억'],
    ['current_characters', '현재 대리자들에게 공유'],
    ['discard', '기록하지 않기'],
  ];
  const buttons = choices.map(([choice, label]) => {
    const button = element('button', 's0-memory-proposal-choice', label);
    button.type = 'button';
    button.dataset.choice = choice;
    return button;
  });
  let inFlight = false;
  let finished = false;

  for (let i = 0; i < choices.length; i += 1) {
    const [choice, label] = choices[i];
    buttons[i].addEventListener('click', async () => {
      if (inFlight || finished || !panel.isConnected) return;
      if (!window.confirm(t(`"${label}" 선택을 확정하시겠습니까?`))) return;
      inFlight = true;
      buttons.forEach(button => { button.disabled = true; });
      status.textContent = t('선택 결과를 확인 중입니다…');
      try {
        const receipt = await client.decidePlannerProposal(plannerProposal, choice, true);
        if (panel.isConnected && receipt.proposalId === plannerProposal.proposalId &&
            receipt.decision === choice && receipt.status === 'resolved') {
          finished = true;
          status.textContent = t('기억 범위 선택이 확인됐습니다.');
        }
      } catch {
        finished = true;
        if (panel.isConnected) {
          status.textContent = t('선택 결과를 확인할 수 없습니다. 기록에서 상태를 다시 확인해 주세요.');
        }
      } finally {
        inFlight = false;
        if (!finished && panel.isConnected) {
          buttons.forEach(button => { button.disabled = false; });
        }
      }
    });
  }

  panel.append(caption, summary, ...buttons, status);
  container.append(panel);
  return panel;
}
