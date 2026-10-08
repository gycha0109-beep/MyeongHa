import type { SeyeonChatTurnSendRequestV1 } from '@myeongha/api-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHUNK_LENGTH = 256;
const MAX_CHUNKS = 32;
const KEY_PREFIX = 'myeongha.chat.turn.v1.';

export interface MobileChatPendingTurnStoreV1 {
  read(threadId: string, ownerId: string): Promise<SeyeonChatTurnSendRequestV1 | null>;
  write(threadId: string, ownerId: string, request: SeyeonChatTurnSendRequestV1): Promise<void>;
  clear(threadId: string, ownerId: string): Promise<void>;
}

export interface MobileChatPendingTurnStorageAdapterV1 {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

function prefix(threadId: string): string {
  if (!UUID.test(threadId)) throw new Error('Invalid Chat thread.');
  return `${KEY_PREFIX}${threadId}`;
}

function validRequest(value: unknown): value is SeyeonChatTurnSendRequestV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.clientTurnId === 'string' && UUID.test(v.clientTurnId)
    && typeof v.text === 'string' && v.text.trim().length > 0
    && v.text.length <= 8000;
}

export function createMobileChatPendingTurnStoreV1(
  storage: MobileChatPendingTurnStorageAdapterV1,
): MobileChatPendingTurnStoreV1 {
  async function read(threadId: string, ownerId: string) {
    const base = prefix(threadId);
    const raw = await storage.getItemAsync(`${base}.meta`);
    if (raw === null) return null;
    try {
      const meta: unknown = JSON.parse(raw);
      if (!meta || typeof meta !== 'object') return null;
      const data = meta as Record<string, unknown>;
      // Never expose another Member's locally saved Chat draft.
      if (data.ownerId !== ownerId) return null;
      if (typeof data.clientTurnId !== 'string' || !UUID.test(data.clientTurnId)) return null;
      const count = data.count;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const item = await storage.getItemAsync(`${base}.part.${i}`);
        if (item === null) return null;
        const parsed: unknown = JSON.parse(item);
        if (typeof parsed !== 'string') return null;
        chunks.push(parsed);
      }
      const request = { clientTurnId: data.clientTurnId, text: chunks.join('') };
      return validRequest(request) ? Object.freeze(request) : null;
    } catch {
      return null;
    }
  }

  async function write(threadId: string, ownerId: string, request: SeyeonChatTurnSendRequestV1) {
    const base = prefix(threadId);
    if (!ownerId || !validRequest(request)) throw new Error('Invalid pending Chat turn.');
    const count = Math.ceil(request.text.length / CHUNK_LENGTH);
    if (count > MAX_CHUNKS) throw new Error('Chat draft exceeds secure storage limit.');
    // A manifest is written last, so an interrupted save never exposes partial text.
    await storage.deleteItemAsync(`${base}.meta`);
    for (let i = 0; i < count; i++) {
      await storage.setItemAsync(
        `${base}.part.${i}`,
        JSON.stringify(request.text.slice(i * CHUNK_LENGTH, (i + 1) * CHUNK_LENGTH)),
      );
    }
    await storage.setItemAsync(
      `${base}.meta`,
      JSON.stringify({ ownerId, clientTurnId: request.clientTurnId, count }),
    );
  }

  async function clear(threadId: string, ownerId: string) {
    const base = prefix(threadId);
    const raw = await storage.getItemAsync(`${base}.meta`);
    if (raw === null) return;
    let count = 0;
    try {
      const meta = JSON.parse(raw) as Record<string, unknown>;
      if (meta.ownerId !== ownerId) return;
      if (typeof meta.count === 'number' && Number.isInteger(meta.count) && meta.count >= 1 && meta.count <= MAX_CHUNKS) count = meta.count;
    } catch { return; }
    await storage.deleteItemAsync(`${base}.meta`);
    for (let i = 0; i < count; i++) {
      await storage.deleteItemAsync(`${base}.part.${i}`);
    }
  }

  return Object.freeze({ read, write, clear });
}
