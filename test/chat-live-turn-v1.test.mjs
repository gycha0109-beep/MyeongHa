import { describe, expect, it } from 'vitest';
import { presentAcknowledgedChatTurnV1, presentChatLiveTurnV1 } from '../apps/web/chat-live-turn.js';

function fakeStream() {
  const document = {
    createElement(tagName) {
      const element = {
        tagName,
        className: '',
        dataset: {},
        children: [],
        textContent: '',
        attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        append(...children) {
          this.children.push(...children);
          for (const child of children) child.parent = this;
        },
        remove() {
          if (!this.parent) return;
          this.parent.children = this.parent.children.filter(child => child !== this);
          this.parent = null;
        },
      };
      return element;
    },
  };
  const stream = document.createElement('div');
  stream.ownerDocument = document;
  stream.scrollHeight = 300;
  return stream;
}

describe('live chat bubbles for an actual pending Se-yeon reply', () => {
  it('shows the submitted user message and reply-in-progress, then removes both', () => {
    const stream = fakeStream();
    const remove = presentChatLiveTurnV1(stream, { message: '아까 그 얘기 이어서 해요.' });
    expect(stream.children).toHaveLength(2);
    expect(stream.children[0].dataset.sender).toBe('user');
    expect(stream.children[0].children[1].children[0].textContent)
      .toBe('아까 그 얘기 이어서 해요.');
    expect(stream.children[1].dataset.sender).toBe('character');
    expect(stream.children[1].children[1].children[0].textContent).toBe('세연');
    expect(stream.scrollTop).toBe(300);
    remove();
    expect(stream.children).toHaveLength(0);
    remove();
    expect(stream.children).toHaveLength(0);
  });

  it('does not show a pending reply for an empty input', () => {
    const stream = fakeStream();
    const clear = presentChatLiveTurnV1(stream, { message: '  ' });
    expect(stream.children).toHaveLength(0);
    clear();
  });
});


describe('acknowledged live conversation in current page', () => {
  it('keeps multiple real user/Se-yeon pairs visible in turn order', () => {
    const stream = fakeStream();
    const first = { turnId: 'one', userText: '저번 얘기 기억나요?', assistantText: '어느 얘기였죠?' };
    const second = { turnId: 'two', userText: '그 질문에 답해 주세요.', assistantText: '그 부분은 이렇게 생각해요.' };
    expect(presentAcknowledgedChatTurnV1(stream, first)).toBe(true);
    expect(presentAcknowledgedChatTurnV1(stream, second)).toBe(true);
    expect(stream.children).toHaveLength(4);
    expect(stream.children.map(x => x.dataset.sender))
      .toEqual(['user', 'character', 'user', 'character']);
    const texts = stream.children.map(x => x.children[1].children[1].textContent);
    expect(texts).toEqual([
      first.userText, first.assistantText, second.userText, second.assistantText,
    ]);
    expect(stream.scrollTop).toBe(300);
    expect(stream.children.every(x => x.dataset.pending !== 'true')).toBe(true);
    expect(stream.children[1].dataset.messageCharacterId).toBe('seyeon');
  });

  it('does not duplicate a turn when the ACK is replayed', () => {
    const stream = fakeStream();
    const turn = { turnId: 'same-turn', userText: '안녕', assistantText: '안녕하세요.' };
    expect(presentAcknowledgedChatTurnV1(stream, turn)).toBe(true);
    expect(presentAcknowledgedChatTurnV1(stream, turn)).toBe(false);
    expect(stream.children).toHaveLength(2);
  });

  it('replaces temporary placeholders without losing already acknowledged pairs', () => {
    const stream = fakeStream();
    expect(presentAcknowledgedChatTurnV1(stream, {
      turnId: 'one', userText: '첫 번째', assistantText: '첫 답장',
    })).toBe(true);
    const removePending = presentChatLiveTurnV1(stream, { message: '두 번째' });
    expect(stream.children).toHaveLength(4);
    expect(presentAcknowledgedChatTurnV1(stream, {
      turnId: 'two', userText: '두 번째', assistantText: '두 번째 답장',
    })).toBe(true);
    removePending();
    expect(stream.children).toHaveLength(4);
    expect(stream.children.map(x => x.dataset.acknowledgedTurn))
      .toEqual(['one', 'one', 'two', 'two']);
  });

  it('never renders a reply without a complete acknowledged turn', () => {
    const stream = fakeStream();
    expect(presentAcknowledgedChatTurnV1(stream, {
      turnId: 'x', userText: '메시지', assistantText: ' ',
    })).toBe(false);
    expect(presentAcknowledgedChatTurnV1(stream, {
      turnId: '', userText: '메시지', assistantText: '답장',
    })).toBe(false);
    expect(stream.children).toHaveLength(0);
  });
});
