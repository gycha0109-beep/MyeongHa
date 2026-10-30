// Watchtower-Track: security
// Explicit two-step Member choice for a DB-owned original-message proposal.
// No chat transcript, user summary, personal payload, or Grant is cached.
import { getUiLocaleRequestHeadersV1 } from './ui-i18n.js';
import { unwrapApiSuccessEnvelope } from './api-envelope.js';
import { ensureActiveBearer, invalidateMemberSession } from './product-auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SOURCE_FIELDS = Object.freeze(['threadId', 'turnId', 'messageId']);

export class SeyeonPrivateMemoryReviewErrorV1 extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SeyeonPrivateMemoryReviewErrorV1';
    this.code = code;
  }
}

function isMember(session) {
  return session?.kind === 'member' && typeof session.token === 'string' &&
    session.token.trim() !== '';
}

function matchesSession(first, next) {
  return isMember(first) && isMember(next) && first.token === next.token;
}

function exactOriginalSource(source) {
  return source !== null && typeof source === 'object' &&
    !Array.isArray(source) &&
    Object.keys(source).length === SOURCE_FIELDS.length &&
    SOURCE_FIELDS.every((field) => typeof source[field] === 'string' && UUID.test(source[field]));
}

function validProposalAck(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data) &&
    typeof data.proposalId === 'string' && UUID.test(data.proposalId) &&
    data.proposalKind === 'memory' && data.proposalState === 'pending' &&
    data.shareState === 'private_not_accepted' &&
    !Object.hasOwn(data, 'memoryItemId') &&
    !Object.hasOwn(data, 'grantId') &&
    !Object.hasOwn(data, 'currentlyGranted');
}

function validPrivateAcceptAck(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data) &&
    typeof data.memoryItemId === 'string' && UUID.test(data.memoryItemId) &&
    data.grantCount === 0 && data.replayed === false &&
    !Object.hasOwn(data, 'grantId') &&
    !Object.hasOwn(data, 'characterId') &&
    !Object.hasOwn(data, 'currentlyGranted');
}

export function createSeyeonPrivateMemoryReviewClientV1(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveBearer = options.resolveBearer ?? ensureActiveBearer;
  const chatEndpoint = options.chatEndpoint ?? '/api/chat';
  const proposalEndpoint = options.proposalEndpoint ?? '/api/memory/proposals';
  const preparations = new WeakMap();
  if (typeof fetchImpl !== 'function') {
    throw new SeyeonPrivateMemoryReviewErrorV1(
      'SEYEON_MEMORY_REVIEW_TRANSPORT_UNAVAILABLE', 'Member memory transport is unavailable.',
    );
  }

  async function currentMember() {
    let bearer;
    try { bearer = await resolveBearer(); }
    catch (cause) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        'SEYEON_MEMORY_REVIEW_MEMBER_REQUIRED', 'Current Member identity is unavailable.', cause,
      );
    }
    if (!isMember(bearer)) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        'SEYEON_MEMORY_REVIEW_MEMBER_REQUIRED', 'Current Member identity is required.',
      );
    }
    return bearer;
  }

  async function sendExactMemberPost(path, body, session, errorCode, expectedStatus) {
    let response;
    try {
      response = await fetchImpl(path, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...getUiLocaleRequestHeadersV1(),
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        errorCode, 'The Memory operation could not be confirmed.', cause,
      );
    }
    if (response.status === 401) {
      invalidateMemberSession(session.token);
      throw new SeyeonPrivateMemoryReviewErrorV1(
        'SEYEON_MEMORY_REVIEW_MEMBER_REQUIRED', 'The Member session expired.',
      );
    }
    if (response.status === 403) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        'SEYEON_MEMORY_REVIEW_MEMBER_REQUIRED', 'Member authorization is required.',
      );
    }
    if (response.status !== expectedStatus) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        errorCode, 'The server has not confirmed the Memory operation.',
      );
    }
    let data;
    try { data = unwrapApiSuccessEnvelope(await response.json()); }
    catch (cause) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        errorCode, 'The server receipt could not be verified.', cause,
      );
    }
    const latest = await currentMember();
    if (!matchesSession(session, latest)) {
      throw new SeyeonPrivateMemoryReviewErrorV1(
        'SEYEON_MEMORY_REVIEW_SESSION_CHANGED', 'The Member session changed.',
      );
    }
    return data;
  }

  return Object.freeze({
    async prepareOriginalUserMessage(source) {
      if (!exactOriginalSource(source)) {
        throw new SeyeonPrivateMemoryReviewErrorV1(
          'SEYEON_MEMORY_REVIEW_SOURCE_INVALID', 'Exact original source IDs are required.',
        );
      }
      const session = await currentMember();
      const path = `${chatEndpoint}/${encodeURIComponent(source.threadId)}/turns/${encodeURIComponent(source.turnId)}/messages/${encodeURIComponent(source.messageId)}/memory-proposal`;
      const data = await sendExactMemberPost(path, {
        proposalChoice: 'private_original_message',
      }, session, 'SEYEON_MEMORY_PROPOSAL_UNCONFIRMED', 201);
      if (!validProposalAck(data)) {
        throw new SeyeonPrivateMemoryReviewErrorV1(
          'SEYEON_MEMORY_PROPOSAL_UNCONFIRMED', 'A private pending proposal was not proven.',
        );
      }
      const receipt = Object.freeze({
        proposalId: data.proposalId,
        proposalKind: 'memory',
        proposalState: 'pending',
        shareState: 'private_not_accepted',
      });
      preparations.set(receipt, { memberToken: session.token, attempted: false });
      return receipt;
    },

    async acceptPreparedPrivate(receipt, memberConfirmed) {
      // A proposal is NOT accepted by the first click. No acceptance without
      // the exact receipt from THIS client and a separate explicit choice.
      const state = receipt !== null && typeof receipt === 'object'
        ? preparations.get(receipt) : undefined;
      if (memberConfirmed !== true || state === undefined || state.attempted ||
          !validProposalAck(receipt)) {
        throw new SeyeonPrivateMemoryReviewErrorV1(
          'SEYEON_PRIVATE_MEMORY_NOT_APPROVED', 'Separate Member acceptance is required.',
        );
      }
      const session = await currentMember();
      if (session.token !== state.memberToken) {
        throw new SeyeonPrivateMemoryReviewErrorV1(
          'SEYEON_MEMORY_REVIEW_SESSION_CHANGED', 'The approving Member changed.',
        );
      }
      // POST is intentionally at-most-once per verified in-document proposal
      // receipt. A network/DB ambiguity requires owner reconciliation, never
      // optimistic auto retry with a newly allocated accepted Memory ID.
      state.attempted = true;
      const path = `${proposalEndpoint}/${encodeURIComponent(receipt.proposalId)}/accept`;
      const data = await sendExactMemberPost(path, {
        grantChoice: { mode: 'private' },
      }, session, 'SEYEON_PRIVATE_MEMORY_ACCEPT_UNCONFIRMED', 200);
      if (!validPrivateAcceptAck(data)) {
        throw new SeyeonPrivateMemoryReviewErrorV1(
          'SEYEON_PRIVATE_MEMORY_ACCEPT_UNCONFIRMED', 'Private zero-Grant acceptance was not proven.',
        );
      }
      return Object.freeze({
        memoryItemId: data.memoryItemId,
        grantCount: 0,
        shareState: 'private_not_shared',
      });
    },
  });
}
