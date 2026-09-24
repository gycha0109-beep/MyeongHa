import {
  WebApiEnvelopeError,
  readApiErrorCode,
  unwrapApiSuccessEnvelope,
} from './api-envelope.js';
import {
  getActiveBearer,
  invalidateGuestSession,
  invalidateMemberSession,
} from './product-auth.js';

export const CHAT_OPEN_ENDPOINT_V1 = '/api/chat';

export class ChatOpenClientErrorV1 extends Error {
  constructor(code, message, retryable = false, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ChatOpenClientErrorV1';
    this.code = code;
    this.retryable = retryable;
  }
}

function requireCharacterId(value) {
  if (typeof value !== 'string') {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_REQUEST_INVALID',
      'Server-authoritative Character identity must be a string.',
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_REQUEST_INVALID',
      'Server-authoritative Character identity is outside the supported bounds.',
    );
  }
  return normalized;
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function invalidateRejectedBearer(bearer, invalidators) {
  if (bearer.kind === 'member') {
    invalidators.member(bearer.token);
    return;
  }
  if (bearer.kind === 'guest') invalidators.guest(bearer.token);
}

function mapFailure(response, payload) {
  const publicCode = readApiErrorCode(payload);
  if (response.status === 401 || publicCode === 'AUTH_REQUIRED') {
    return new ChatOpenClientErrorV1(
      'CHAT_OPEN_SESSION_REQUIRED',
      'Chat open requires a current session.',
    );
  }
  if (response.status === 403 || publicCode === 'FORBIDDEN') {
    return new ChatOpenClientErrorV1(
      'CHAT_OPEN_MEMBER_REQUIRED',
      'Chat open requires a Member session.',
    );
  }
  if (response.status === 404 || publicCode === 'NOT_FOUND') {
    return new ChatOpenClientErrorV1(
      'CHAT_OPEN_CHARACTER_UNAVAILABLE',
      'The server-authoritative Character is unavailable for Chat.',
    );
  }
  if (response.status === 409 || publicCode === 'CONTENT_INCOMPATIBLE') {
    return new ChatOpenClientErrorV1(
      'CHAT_OPEN_CONTENT_INCOMPATIBLE',
      'The current Character thread is incompatible.',
    );
  }
  if (response.status === 503 || publicCode === 'CAPABILITY_UNAVAILABLE') {
    return new ChatOpenClientErrorV1(
      'CHAT_OPEN_CONTENT_UNAVAILABLE',
      'Chat content is temporarily unavailable.',
      true,
    );
  }
  if (response.status === 400 || publicCode === 'INVALID_REQUEST') {
    return new ChatOpenClientErrorV1(
      'CHAT_OPEN_REQUEST_INVALID',
      'Chat open request is invalid.',
    );
  }
  return new ChatOpenClientErrorV1(
    'CHAT_OPEN_REQUEST_FAILED',
    'Chat open request failed.',
    response.status === 408 || response.status === 429 || response.status >= 500,
  );
}

async function readPayload(response) {
  try {
    return await response.json();
  } catch (error) {
    if (!response.ok) return null;
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_MALFORMED_RESPONSE',
      'Chat open API returned invalid JSON.',
      false,
      error,
    );
  }
}

function parseSuccessData(data, requestedCharacterId) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_MALFORMED_RESPONSE',
      'Chat open API returned malformed data.',
    );
  }
  const keys = Object.keys(data);
  if (
    keys.length !== 3 ||
    !keys.includes('threadId') ||
    !keys.includes('characterId') ||
    !keys.includes('created')
  ) {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_MALFORMED_RESPONSE',
      'Chat open API returned an unexpected data shape.',
    );
  }
  if (!isUuid(data.threadId)) {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_MALFORMED_RESPONSE',
      'Chat open API returned an invalid thread identity.',
    );
  }
  if (data.characterId !== requestedCharacterId) {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_MALFORMED_RESPONSE',
      'Chat open API returned a different Character identity.',
    );
  }
  if (typeof data.created !== 'boolean') {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_MALFORMED_RESPONSE',
      'Chat open API returned an invalid creation flag.',
    );
  }
  return Object.freeze({
    threadId: data.threadId,
    characterId: data.characterId,
    created: data.created,
  });
}

export function buildChatThreadUrlV1(threadId, path = 'chat.html') {
  if (!isUuid(threadId)) {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_REQUEST_INVALID',
      'Chat thread identity is invalid.',
    );
  }
  const params = new URLSearchParams();
  params.set('threadId', threadId);
  return path + '?' + params.toString();
}

export function createChatOpenClientV1(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveBearer = options.resolveBearer ?? getActiveBearer;
  const endpoint = options.endpoint ?? CHAT_OPEN_ENDPOINT_V1;
  const invalidators = {
    member: options.invalidateMember ?? invalidateMemberSession,
    guest: options.invalidateGuest ?? invalidateGuestSession,
  };

  if (typeof fetchImpl !== 'function') {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_TRANSPORT_UNAVAILABLE',
      'Chat open transport is unavailable.',
    );
  }
  if (typeof resolveBearer !== 'function') {
    throw new ChatOpenClientErrorV1(
      'CHAT_OPEN_SESSION_REQUIRED',
      'Chat open session resolver is unavailable.',
    );
  }

  async function openCanonicalCharacter(characterIdInput) {
    const characterId = requireCharacterId(characterIdInput);

    let bearer;
    try {
      bearer = await resolveBearer();
    } catch (error) {
      throw new ChatOpenClientErrorV1(
        'CHAT_OPEN_SESSION_REQUIRED',
        'Chat open session could not be resolved.',
        false,
        error,
      );
    }
    if (
      !bearer ||
      (bearer.kind !== 'member' && bearer.kind !== 'guest') ||
      typeof bearer.token !== 'string' ||
      bearer.token.trim().length === 0
    ) {
      throw new ChatOpenClientErrorV1(
        'CHAT_OPEN_SESSION_REQUIRED',
        'Chat open requires a current session.',
      );
    }

    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + bearer.token,
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ characterId }),
      });
    } catch (error) {
      throw new ChatOpenClientErrorV1(
        'CHAT_OPEN_REQUEST_FAILED',
        'Chat open transport failed.',
        true,
        error,
      );
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      const failure = mapFailure(response, payload);
      if (failure.code === 'CHAT_OPEN_SESSION_REQUIRED') {
        invalidateRejectedBearer(bearer, invalidators);
      }
      throw failure;
    }

    let data;
    try {
      data = unwrapApiSuccessEnvelope(payload);
    } catch (error) {
      if (error instanceof WebApiEnvelopeError) {
        throw new ChatOpenClientErrorV1(
          'CHAT_OPEN_MALFORMED_RESPONSE',
          error.message,
          false,
          error,
        );
      }
      throw error;
    }
    return parseSuccessData(data, characterId);
  }

  return Object.freeze({
    endpoint,
    openForCanonicalCharacter(input) {
      return openCanonicalCharacter(input?.characterId);
    },
    openForServerCharacter(input) {
      return openCanonicalCharacter(input?.readerCharacterId);
    },
  });
}
