// Watchtower-Track: character-memory
// Authenticated owner-only client. Never caches personal memory in localStorage.
import { unwrapApiSuccessEnvelope, readApiErrorCode } from '../../api-envelope.js';
import { getActiveBearer, invalidateMemberSession } from '../../product-auth.js';
import { getUiLocaleRequestHeadersV1 } from '../../ui-i18n.js';

export type SharedMemoryItemV1 = Readonly<{
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}>;
export class SharedMemoryClientErrorV1 extends Error {
  constructor(readonly code: string, readonly status: number | null = null) {
    super('Shared memory request failed: ' + code);
    this.name = 'SharedMemoryClientErrorV1';
  }
}
const ENDPOINT = '/api/me/shared-memory' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireItem(value: unknown): SharedMemoryItemV1 {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id)
      || typeof value.text !== 'string' || value.text.trim().length === 0
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
  }
  return { id: value.id, text: value.text, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
function requireItems(data: unknown): readonly SharedMemoryItemV1[] {
  if (!isRecord(data) || !Array.isArray(data.items) || data.items.length > 50) {
    throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
  }
  const items = data.items.map(requireItem);
  if (new Set(items.map(item => item.id)).size !== items.length) {
    throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
  }
  return items;
}

export function createSharedMemoryClientV1(input: Readonly<{
  fetchImpl?: typeof fetch;
  endpoint?: string;
  resolveBearer?: typeof getActiveBearer;
}> = {}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const endpoint = input.endpoint ?? ENDPOINT;
  const resolveBearer = input.resolveBearer ?? getActiveBearer;
  async function send(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<unknown> {
    const bearer = await resolveBearer();
    if (bearer?.kind !== 'member' || !bearer.token) throw new SharedMemoryClientErrorV1('MEMBER_REQUIRED');
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method,
        headers: {
          Accept: 'application/json',
          ...getUiLocaleRequestHeadersV1(),
          Authorization: 'Bearer ' + bearer.token,
          ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
        credentials: 'same-origin',
        cache: 'no-store',
      });
    } catch {
      throw new SharedMemoryClientErrorV1('NETWORK_ERROR');
    }
    if (response.status === 401) {
      invalidateMemberSession(bearer.token);
      throw new SharedMemoryClientErrorV1('MEMBER_REQUIRED', 401);
    }
    let envelope: unknown;
    try { envelope = await response.json(); }
    catch { throw new SharedMemoryClientErrorV1('INVALID_RESPONSE', response.status); }
    if (!response.ok) {
      throw new SharedMemoryClientErrorV1(readApiErrorCode(envelope) ?? 'REQUEST_FAILED', response.status);
    }
    try { return unwrapApiSuccessEnvelope(envelope); }
    catch { throw new SharedMemoryClientErrorV1('INVALID_RESPONSE', response.status); }
  }
  return Object.freeze({
    async read(): Promise<readonly SharedMemoryItemV1[]> {
      return requireItems(await send('GET'));
    },
    async add(text: string): Promise<SharedMemoryItemV1> {
      const data = await send('POST', { text });
      if (!isRecord(data)) throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
      return requireItem(data.item);
    },
    async edit(id: string, text: string, updatedAt: string): Promise<SharedMemoryItemV1> {
      if (!UUID.test(id)) throw new SharedMemoryClientErrorV1('INVALID_REQUEST');
      // Match the canonical PostgreSQL UUID returned by the owner-scoped PATCH.
      const canonicalId = id.toLowerCase();
      const data = await send('PATCH', { id: canonicalId, text, updatedAt });
      if (!isRecord(data)) throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
      const item = requireItem(data.item);
      if (item.id !== canonicalId) throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
      return item;
    },
    async remove(id: string): Promise<void> {
      if (!UUID.test(id)) throw new SharedMemoryClientErrorV1('INVALID_REQUEST');
      // The server returns PostgreSQL's canonical lowercase UUID representation.
      const canonicalId = id.toLowerCase();
      const data = await send('DELETE', { id: canonicalId });
      if (!isRecord(data) || data.deleted !== true || data.id !== canonicalId) {
        throw new SharedMemoryClientErrorV1('INVALID_RESPONSE');
      }
    },
  });
}
