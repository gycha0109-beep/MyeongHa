import { describe, expect, it } from 'vitest';
import { presentChatLiveTurnV1 } from '../apps/web/chat-live-turn.js';

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
