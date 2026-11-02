import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getActiveBearer: vi.fn(async () => ({ kind: 'member', token: 'signed-member-token' })),
  invalidateMemberSession: vi.fn(),
}));

vi.mock('../apps/web/product-auth.js', () => auth);
vi.mock('../apps/web/ui-i18n.js', () => ({
  getUiLocale: () => 'ko-KR',
  translateStaticUi: (source: string) => source,
}));

const THREAD = '11111111-1111-4111-8111-111111111111';
const MARKER = '22222222-2222-4222-8222-222222222222';
const READING = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const BODY = 'S7 private paid answer; no Chat, Memory or storage copy';
const ACK_TOKEN = 'a'.repeat(43);

class FakeElement extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  textContent = '';
  className = '';
  type = '';
  hidden = false;
  disabled = false;
  isConnected = true;
  onclick: (() => void) | null = null;
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  getAttribute(key: string) { return this.attributes.get(key) ?? null; }
  append(...children: FakeElement[]) { this.children.push(...children); }
}

let page: typeof import('../apps/web/paid-reader-chat-reveal.js');
let browser: EventTarget;
let documentStub: EventTarget & {
  hidden: boolean;
  createElement: () => FakeElement;
  querySelectorAll: () => FakeElement[];
};
let paintCallbacks: Array<() => void> = [];

function eventForStorage(key: string | null) {
  const event = new Event('storage');
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

function mount() {
  const card = new FakeElement();
  page.appendProtectedReaderChatRevealV1(card as unknown as HTMLElement, {
    threadId: THREAD,
    safeMessageId: MARKER,
  });
  expect(card.children).toHaveLength(4);
  return {
    button: card.children[0]!,
    retry: card.children[2]!,
    body: card.children[3]!,
  };
}

function responseForGet(url: unknown, init: unknown) {
  expect(url).toBe('/api/chat/' + THREAD + '/paid-readings/' + MARKER);
  const headers = (init as { headers: Record<string, string> }).headers;
  const requestId = headers['X-Reader-Delivery-Request-Id'];
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/u);
  return Response.json({
    ok: true,
    data: {
      schemaVersion: 'official-reader-paid-chat-message-v1',
      threadId: THREAD,
      safeMessageId: MARKER,
      officialReadingId: READING,
      readerCharacterId: 'seyeon',
      committedAt: '2026-10-25T00:00:00.000Z',
      body: BODY,
      delivery: {
        deliveryRequestId: requestId,
        deliveryAttemptId: ATTEMPT,
        responsePreparedAt: '2026-10-25T00:00:01.000Z',
        acknowledgementToken: ACK_TOKEN,
        replayed: false,
      },
    },
  });
}

beforeAll(async () => {
  browser = new EventTarget();
  documentStub = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: () => new FakeElement(),
    querySelectorAll: () => [] as FakeElement[],
  });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', documentStub);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    paintCallbacks.push(cb);
    return paintCallbacks.length;
  });
  page = await import('../apps/web/paid-reader-chat-reveal.js');
});

beforeEach(() => {
  paintCallbacks = [];
  auth.getActiveBearer.mockResolvedValue({ kind: 'member', token: 'signed-member-token' });
  auth.getActiveBearer.mockClear();
  auth.invalidateMemberSession.mockClear();
});

afterEach(() => {
  page.clearProtectedReaderChatRevealV1();
  vi.stubGlobal('fetch', undefined);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('S7 web protected text and original receipt are erased on Member authority change', () => {
  it('clears the displayed paid body immediately on same-tab signout before ACK is sent', async () => {
    const fetchImpl = vi.fn(async (url: unknown, init: unknown) => responseForGet(url, init));
    vi.stubGlobal('fetch', fetchImpl);
    const { button, body, retry } = mount();
    button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => {
      expect(body.hidden).toBe(false);
      expect(body.textContent).toBe(BODY);
    });
    expect(paintCallbacks).toHaveLength(1);
    browser.dispatchEvent(new Event('myeongha:auth-changed'));
    expect(body.hidden).toBe(true);
    expect(body.textContent).toBe('');
    expect(retry.onclick).toBeNull();
    paintCallbacks.splice(0).forEach(cb => cb());
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('aborts an in-flight protected GET and discards its late response after cross-tab Member replacement', async () => {
    let resolveGet!: (response: Response) => void;
    const fetchImpl = vi.fn((url: unknown, init: unknown) => {
      expect(url).toBe('/api/chat/' + THREAD + '/paid-readings/' + MARKER);
      return new Promise<Response>(resolve => { resolveGet = resolve; });
    });
    vi.stubGlobal('fetch', fetchImpl);
    const { button, body } = mount();
    button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    browser.dispatchEvent(eventForStorage('myeongha.memberSession.v1'));
    resolveGet(responseForGet('/api/chat/' + THREAD + '/paid-readings/' + MARKER,
      fetchImpl.mock.calls[0]?.[1]));
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(body.hidden).toBe(true);
    expect(body.textContent).toBe('');
    expect(paintCallbacks).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the currently authorized card open on unrelated localStorage changes', async () => {
    const fetchImpl = vi.fn(async (url: unknown, init: unknown) => responseForGet(url, init));
    vi.stubGlobal('fetch', fetchImpl);
    const { button, body } = mount();
    button.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(body.textContent).toBe(BODY));
    browser.dispatchEvent(eventForStorage('unrelated.storage.key'));
    expect(body.hidden).toBe(false);
    browser.dispatchEvent(eventForStorage(null));
    expect(body.textContent).toBe('');
  });
});
