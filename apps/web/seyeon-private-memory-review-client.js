// Watchtower-Track: security
// UC-06/UC-07: a server-owned Dialogue Planner proposal is reviewed by the
// Member. The browser NEVER creates a Memory candidate from a chat Message.
import { getUiLocaleRequestHeadersV1 } from './ui-i18n.js';
import { unwrapApiSuccessEnvelope } from './api-envelope.js';
import { ensureActiveBearer, invalidateMemberSession } from './product-auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHOICES = Object.freeze(['session_only', 'character_only', 'current_characters', 'discard']);

export class SeyeonPrivateMemoryReviewErrorV1 extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SeyeonPrivateMemoryReviewErrorV1';
    this.code = code;
  }
}

export function isServerPlannerMemoryProposalV1(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 6
    && value.sourceAuthority === 'server_dialogue_planner'
    && value.characterId === 'seyeon'
    && value.proposalState === 'pending'
    && (value.proposalKind === 'memory' || value.proposalKind === 'life_fact')
    && typeof value.proposalId === 'string' && UUID.test(value.proposalId)
    && typeof value.summary === 'string' && value.summary.trim() === value.summary
    && value.summary.length > 0 && value.summary.length <= 4000;
}

function isMember(session) {
  return session?.kind === 'member' && typeof session.token === 'string'
    && session.token.trim() !== '';
}

function exactReceipt(data, proposalId, choice) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || data.proposalId !== proposalId || data.decision !== choice
      || data.status !== 'resolved'
      || typeof data.persisted !== 'boolean'
      || !Number.isSafeInteger(data.grantCount) || data.grantCount < 0
      || Object.hasOwn(data, 'grantId') || Object.hasOwn(data, 'personalContent')) return false;
  if (choice === 'session_only' || choice === 'discard') {
    return data.persisted === false && data.grantCount === 0;
  }
  if (choice === 'character_only') return data.persisted === true && data.grantCount === 1;
  return data.persisted === true && data.grantCount >= 1;
}

export function createSeyeonPrivateMemoryReviewClientV1(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const resolveBearer = options.resolveBearer ?? ensureActiveBearer;
  const root = options.proposalEndpoint ?? '/api/memory/proposals';
  const attempted = new Set();

  if (typeof fetchImpl !== 'function') {
    throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_TRANSPORT_UNAVAILABLE', 'No transport.');
  }

  return Object.freeze({
    async decidePlannerProposal(proposal, choice, confirmed) {
      if (!isServerPlannerMemoryProposalV1(proposal) || !CHOICES.includes(choice)) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_INVALID_PROPOSAL', 'Server proposal required.');
      }
      if (confirmed !== true || attempted.has(proposal.proposalId)) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_NOT_APPROVED', 'Explicit one-time choice required.');
      }
      let session;
      try { session = await resolveBearer(); } catch {}
      if (!isMember(session)) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_MEMBER_REQUIRED', 'Member session required.');
      }

      // A lost ACK cannot trigger another write without server reconciliation.
      attempted.add(proposal.proposalId);
      let response;
      try {
        response = await fetchImpl(`${root}/${encodeURIComponent(proposal.proposalId)}/decision`, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...getUiLocaleRequestHeadersV1(),
            Authorization: `Bearer ${session.token}`,
          },
          // Only the chosen scope is sent. The server owns the proposal's
          // factual content, membership snapshot, and any Grant generation.
          body: JSON.stringify({ choice: {
            mode: choice,
            ...(choice === 'character_only' ? { characterId: 'seyeon' } : {}),
          } }),
        });
      } catch (cause) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_UNCONFIRMED', 'Decision outcome unknown.', cause);
      }
      if (response.status === 401) {
        invalidateMemberSession(session.token);
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_MEMBER_REQUIRED', 'Expired Member session.');
      }
      if (response.status !== 200) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_UNCONFIRMED', 'Server did not confirm decision.');
      }
      let data;
      try { data = unwrapApiSuccessEnvelope(await response.json()); }
      catch (cause) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_UNCONFIRMED', 'Invalid receipt.', cause);
      }
      let latest;
      try { latest = await resolveBearer(); } catch {}
      if (!isMember(latest) || latest.token !== session.token) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_SESSION_CHANGED', 'Member identity changed.');
      }
      if (!exactReceipt(data, proposal.proposalId, choice)) {
        throw new SeyeonPrivateMemoryReviewErrorV1('MEMORY_DECISION_UNCONFIRMED', 'No exact server decision receipt.');
      }
      return Object.freeze({
        proposalId: proposal.proposalId,
        decision: choice,
        status: 'resolved',
        persisted: data.persisted,
        grantCount: data.grantCount,
      });
    },
  });
}
// No server producer/decision route is mounted in S0: these controls remain
// unavailable until a verified Planner proposal and exact server ACK exist.
