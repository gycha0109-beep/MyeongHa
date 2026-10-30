// Watchtower-Track: security
// Private storage is not permission for Se-yeon to use a Memory.
import { getUiLocaleRequestHeadersV1 } from './ui-i18n.js';
import { unwrapApiSuccessEnvelope } from './api-envelope.js';
import { ensureActiveBearer, invalidateMemberSession } from './product-auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class MemoryGrantConsentError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'MemoryGrantConsentError';
    this.code = code;
  }
}

function sameMember(first, second) {
  return first?.kind === 'member'
    && second?.kind === 'member'
    && first.token === second.token;
}

export function createRecordsMemoryGrantConsentClient(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveBearer = options.resolveBearer ?? ensureActiveBearer;
  const endpointRoot = options.memoriesEndpoint ?? '/api/memories';

  if (typeof fetchImpl !== 'function') {
    throw new MemoryGrantConsentError('MEMORY_CONSENT_TRANSPORT_UNAVAILABLE', 'No consent transport.');
  }

  return Object.freeze({
    async grantSeyeonOriginalMemory(memoryItemId) {
      if (typeof memoryItemId !== 'string' || !UUID.test(memoryItemId)) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_INVALID_ID', 'Invalid memory identity.');
      }
      const session = await resolveBearer();
      if (!sameMember(session, session) || typeof session.token !== 'string' || !session.token.trim()) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_MEMBER_REQUIRED', 'Current Member identity is required.');
      }
      const endpoint = `${endpointRoot}/${encodeURIComponent(memoryItemId)}/grants/seyeon`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...getUiLocaleRequestHeadersV1(),
            Authorization: `Bearer ${session.token}`,
          },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            grantChoice: { mode: 'character_only', characterId: 'seyeon' },
          }),
        });
      } catch (cause) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_UNCONFIRMED', 'The consent outcome is unknown.', cause);
      }
      if (response.status === 401) {
        invalidateMemberSession(session.token);
        throw new MemoryGrantConsentError('MEMORY_CONSENT_MEMBER_REQUIRED', 'The Member session expired.');
      }
      if (response.status === 403) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_MEMBER_REQUIRED', 'Member access required.');
      }
      if (response.status !== 200) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_UNCONFIRMED', 'The server did not confirm consent.');
      }

      let data;
      try {
        data = unwrapApiSuccessEnvelope(await response.json());
      } catch (cause) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_UNCONFIRMED', 'Invalid grant acknowledgement.', cause);
      }
      if (!data || data.memoryItemId !== memoryItemId || data.characterId !== 'seyeon'
          || data.currentlyGranted !== true || data.grantState !== 'active') {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_UNCONFIRMED', 'Unrelated grant acknowledgement.');
      }

      const latest = await resolveBearer();
      if (!sameMember(session, latest)) {
        throw new MemoryGrantConsentError('MEMORY_CONSENT_SESSION_CHANGED', 'The Member session changed.');
      }
      // This is acknowledgement of the command, not authoritative current use.
      // The Records UI must re-read the DB lifecycle independently.
      return Object.freeze({
        memoryItemId, characterId: 'seyeon',
        currentlyGranted: true, grantState: 'active',
      });
    },
  });
}
