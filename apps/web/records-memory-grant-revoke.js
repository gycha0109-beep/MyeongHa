import { getUiLocaleRequestHeadersV1 } from './ui-i18n.js';
import { unwrapApiSuccessEnvelope } from './api-envelope.js';
import { ensureActiveBearer, invalidateMemberSession } from './product-auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class MemoryGrantRevokeError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MemoryGrantRevokeError';
    this.code = code;
  }
}

function sameSession(a, b) {
  return a?.kind === 'member' && b?.kind === 'member' && a.token === b.token;
}

function validateAck(payload, memoryItemId, statusCode) {
  if (payload.memoryItemId !== memoryItemId || payload.characterId !== 'seyeon') {
    throw new MemoryGrantRevokeError(
      'MEMORY_REVOKE_UNCONFIRMED',
      'The server returned an unrelated Memory Grant acknowledgement.',
    );
  }
  if (statusCode === 202 && payload.status === 'pending' &&
      payload.newUseBlocked === true &&
      !Object.prototype.hasOwnProperty.call(payload, 'revokedGrantCount') &&
      !Object.prototype.hasOwnProperty.call(payload, 'replayed')) {
    return Object.freeze({
      status: 'pending', memoryItemId,
      characterId: 'seyeon', newUseBlocked: true,
    });
  }
  if (statusCode !== 200 || payload.status !== 'committed' ||
      !Number.isSafeInteger(payload.revokedGrantCount) ||
      payload.revokedGrantCount < 0 ||
      typeof payload.replayed !== 'boolean' ||
      payload.replayed !== (payload.revokedGrantCount === 0)) {
    throw new MemoryGrantRevokeError(
      'MEMORY_REVOKE_UNCONFIRMED',
      'The server did not confirm a valid Memory Grant revocation state.',
    );
  }
  return Object.freeze({
    status: 'committed', memoryItemId,
    characterId: 'seyeon',
    revokedGrantCount: payload.revokedGrantCount,
    replayed: payload.replayed,
  });
}

export function createRecordsMemoryGrantRevokeClient(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveBearer = options.resolveBearer ?? ensureActiveBearer;
  const endpointRoot = options.memoriesEndpoint ?? '/api/memories';
  if (typeof fetchImpl !== 'function') {
    throw new MemoryGrantRevokeError('MEMORY_REVOKE_TRANSPORT_UNAVAILABLE', 'No fetch transport.');
  }
  return Object.freeze({
    async revokeSeyeonMemoryGrant(memoryItemId) {
      if (typeof memoryItemId !== 'string' || !UUID.test(memoryItemId)) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_INVALID_ID', 'Invalid memory item identifier.');
      }
      const session = await resolveBearer();
      if (session?.kind !== 'member' || typeof session.token !== 'string' || !session.token.trim()) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_MEMBER_REQUIRED', 'A current Member session is required.');
      }
      const endpoint = `${endpointRoot}/${encodeURIComponent(memoryItemId)}/grants/seyeon/revoke`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            ...getUiLocaleRequestHeadersV1(),
            Authorization: `Bearer ${session.token}`,
          },
          credentials: 'same-origin',
          cache: 'no-store',
        });
      } catch (error) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_UNCONFIRMED', 'The revocation outcome is unknown.', error);
      }
      if (response.status === 401) {
        invalidateMemberSession(session.token);
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_MEMBER_REQUIRED', 'The Member session expired.');
      }
      if (response.status === 403) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_MEMBER_REQUIRED', 'Member access required.');
      }
      if (response.status !== 200 && response.status !== 202) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_UNCONFIRMED', 'The revocation outcome is not confirmed.');
      }
      let data;
      try {
        data = unwrapApiSuccessEnvelope(await response.json());
      } catch (error) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_UNCONFIRMED', 'The server response is not a valid commit receipt.', error);
      }
      const ack = validateAck(data, memoryItemId, response.status);
      const latest = await resolveBearer();
      if (!sameSession(session, latest)) {
        throw new MemoryGrantRevokeError('MEMORY_REVOKE_SESSION_CHANGED', 'The active Member session changed.');
      }
      return ack;
    },
  });
}
