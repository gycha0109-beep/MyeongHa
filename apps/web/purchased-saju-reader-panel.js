import { createChatOpenClientV1 } from './chat-open-client.js';
import { createReaderRuntimeClientV1 } from './reader-runtime-client.js';
import { appendProtectedReaderChatRevealV1, clearProtectedReaderChatRevealV1 } from './paid-reader-chat-reveal.js';
import { getUiLocale, translateStaticUi } from './ui-i18n.js';

/** Mount only after the existing Records API has admitted an approved purchase. */
export function mountPurchasedSajuReaderPanelV1(panel, record, resolveBearer) {
  const readerCharacterId = record.readerCharacterIds[0];
  if (!record.approvedComponent || record.productResponseState !== 'delivered' ||
      record.readerCharacterIds.length !== 1 || !readerCharacterId) return () => {};

  const controller = new AbortController();
  const { signal } = controller;
  const openClient = createChatOpenClientV1({ resolveBearer });
  const readerClient = createReaderRuntimeClientV1({ enabled: true, resolveBearer });
  const section = document.createElement('div');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.textContent = '연결자에게 풀이 묻기';
  panel.append(launch, status, section);
  panel.hidden = false;

  launch.addEventListener('click', async () => {
    launch.disabled = true;
    status.textContent = '구매한 풀이의 장면을 확인하고 있습니다.';
    try {
      const { threadId } = await openClient.openForServerCharacter({ readerCharacterId });
      if (signal.aborted || !(await resolveBearer())) return;
      const officialReadingId = record.readingId;
      const { scene, latestPaidReply } = await readerClient.readPurchasedReaderScene({
        threadId, officialReadingId, signal,
      });
      if (signal.aborted || !(await resolveBearer())) return;
      if (scene.mode !== 'reader_interpretation' || scene.readerCharacterId !== readerCharacterId ||
          scene.domain !== record.sajuDomain) throw new Error('Purchased Reader scene is unavailable.');

      const form = document.createElement('form');
      const label = document.createElement('label');
      const question = document.createElement('input');
      question.required = true;
      question.maxLength = 240;
      question.value = translateStaticUi('그 부분을 더 설명해 주세요.', getUiLocale());
      label.append('질문 ', question);
      const send = document.createElement('button');
      send.type = 'submit';
      send.textContent = '질문 보내기';
      send.disabled = true;
      form.append(label, send);
      const answer = document.createElement('div');
      let focus;
      let priorAcknowledged = false;
      let pending = null;
      let waitingForAnswer = latestPaidReply !== null;
      const sceneButtons = [];
      for (const [segmentIndex, segment] of scene.utterance.segments.entries()) {
        const paragraph = document.createElement('p');
        paragraph.dataset.officialReading = '';
        paragraph.textContent = segment.text;
        section.append(paragraph);
        if (segment.kind !== 'semantic_realization') continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '이 부분 묻기';
        button.disabled = latestPaidReply !== null;
        button.setAttribute('aria-pressed', 'false');
        sceneButtons.push(button);
        button.addEventListener('click', () => {
          if (waitingForAnswer || pending || priorAcknowledged) return;
          focus = { interpretationHash: scene.interpretationHash, segmentIndex };
          for (const other of sceneButtons) other.setAttribute('aria-pressed', String(other === button));
          send.disabled = false;
          question.focus();
        });
        section.append(button);
      }
      if (!sceneButtons.length) throw new Error('Purchased Reader focus is unavailable.');
      section.append(form, answer);
      status.textContent = '설명을 듣고 싶은 부분을 고르세요.';
      launch.hidden = true;

      function openAnswer(safeMessageId, canContinue) {
        clearProtectedReaderChatRevealV1();
        answer.replaceChildren();
        status.textContent = '연결자의 답변을 열고 있습니다.';
        appendProtectedReaderChatRevealV1(answer, {
          threadId, safeMessageId, officialReadingId, readerCharacterId, openImmediately: true,
          onAcknowledged() {
            if (signal.aborted) return;
            priorAcknowledged = canContinue;
            waitingForAnswer = false;
            question.readOnly = !canContinue;
            send.disabled = !canContinue;
            for (const button of sceneButtons) button.disabled = true;
            status.textContent = canContinue ? '같은 풀이에 대해 이어서 질문할 수 있습니다.'
              : '이전 답변을 읽을 수 있습니다. 이 답변에서 상담을 이어갈 수 없습니다.';
          },
        });
      }

      if (latestPaidReply !== null) {
        question.readOnly = true;
        openAnswer(latestPaidReply.safeMessageId, latestPaidReply.canContinue);
      }
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const text = question.value.trim();
        if (waitingForAnswer || !text || (!focus && !priorAcknowledged)) return;
        waitingForAnswer = true;
        send.disabled = true;
        question.readOnly = true;
        pending ??= {
          officialReadingId, threadId, clientTurnId: crypto.randomUUID(), text,
          ...(priorAcknowledged ? {} : { firstSceneQuestion: focus }), signal,
        };
        status.textContent = '연결자가 구매한 풀이를 확인하고 있습니다.';
        try {
          const marker = await readerClient.askPurchasedReading(pending);
          if (signal.aborted || !(await resolveBearer())) return;
          pending = null;
          openAnswer(marker.safeMessageId, true);
        } catch (error) {
          if (signal.aborted) return;
          if (error?.retryable === false) pending = null;
          waitingForAnswer = false;
          question.readOnly = pending !== null;
          send.disabled = false;
          status.textContent = pending ? '질문 결과를 확인하지 못했습니다. 같은 질문을 다시 확인해 주세요.'
            : '현재 이 질문에 답할 수 없습니다. 선택한 부분을 확인해 주세요.';
        }
      }, { signal });
    } catch {
      if (signal.aborted) return;
      section.replaceChildren();
      status.textContent = '이 풀이의 상담을 지금 열 수 없습니다.';
      launch.disabled = false;
    }
  }, { signal });

  return () => {
    controller.abort();
    clearProtectedReaderChatRevealV1();
    panel.replaceChildren();
    panel.hidden = true;
  };
}
