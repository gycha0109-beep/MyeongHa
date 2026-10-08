import { describe, expect, it } from 'vitest';
import { createMobileChatPendingTurnStoreV1 } from '../apps/mobile/src/features/chat/mobile-chat-pending-turn-store.js';
import { createMobileChatTurnIdV1 } from '../apps/mobile/src/features/chat/mobile-chat-turn-id.js';

const thread = '123e4567-e89b-42d3-a456-426614174000';
const ownerA = 'a-member';
const ownerB = 'another-member';
const request = { clientTurnId: '223e4567-e89b-42d3-a456-426614174000', text: '메시지'.repeat(1800) };

function createStore() {
  const values = new Map<string, string>();
  const store = createMobileChatPendingTurnStoreV1({
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async (key) => { values.delete(key); },
  });
  return { values, store };
}

describe('mobile secure pending turn replay', () => {
  it('roundtrips up to 8000 chars in small SecureStore chunks', async () => {
    const { store, values } = createStore();
    await store.write(thread, ownerA, request);
    expect(await store.read(thread, ownerA)).toEqual(request);
    expect([...values.values()].every((part) => part.length < 2000)).toBe(true);
    expect(await store.read(thread, ownerB)).toBeNull();
    await store.clear(thread, ownerB);
    expect(await store.read(thread, ownerA)).toEqual(request);
    await store.clear(thread, ownerA);
    expect(await store.read(thread, ownerA)).toBeNull();
    expect(values.size).toBe(0);
  });

  it('fails closed for interrupted writes and never exposes another Member draft', async () => {
    const { store, values } = createStore();
    await store.write(thread, ownerA, request);
    const chunkKey = [...values.keys()].find((key) => key.endsWith('.part.1'));
    if (!chunkKey) throw new Error('missing chunk');
    values.delete(chunkKey);
    expect(await store.read(thread, ownerA)).toBeNull();
    expect(await store.read(thread, ownerB)).toBeNull();
  });

  it('generates valid distinct opaque v4 replay identifiers', () => {
    const ids = Array.from({ length: 100 }, createMobileChatTurnIdV1);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
  });
});
