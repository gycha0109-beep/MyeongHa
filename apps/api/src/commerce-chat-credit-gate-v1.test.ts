import { describe, expect, it, vi } from 'vitest';
import {
  COMMERCE_CHAT_CREDIT_ERROR_CODES_V1,
  COMMERCE_CHAT_CREDIT_POLICY_V1,
  chatCreditTopUpOfferForUiV1,
  createChatCreditInsufficientResponseV1,
  readChatCreditAvailabilityV1,
  reserveChatReplyCreditsV1,
} from './commerce-chat-credit-gate-v1.js';

const subject = '11111111-1111-4111-8111-111111111111';
const thread = '22222222-2222-4222-8222-222222222222';
const turn = '33333333-3333-4333-8333-333333333333';
const reservation = '44444444-4444-4444-8444-444444444444';

describe('payment-track chat credit handoff (no live checkout)', () => {
  it('pins the confirmed one-off policy without activating SKU or beta subscription', () => {
    expect(COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply).toBe(10);
    expect(chatCreditTopUpOfferForUiV1()).toEqual({
      amountMinor: 1900, currency: 'KRW', creditQuantity: 300,
      nominalReplyCount: 30, saleable: false, productOfferId: null, checkoutRoute: null,
    });
    expect(COMMERCE_CHAT_CREDIT_POLICY_V1.newSignupReward).toEqual({ credits: 50, validDays: 30 });
    expect(COMMERCE_CHAT_CREDIT_POLICY_V1.firstEligiblePaidReadingReward).toEqual({
      credits: 150, validDays: 90,
    });
    expect(COMMERCE_CHAT_CREDIT_POLICY_V1.betaSubscriptionEnabled).toBe(false);
    expect(COMMERCE_CHAT_CREDIT_POLICY_V1.creditIsRelationshipCurrency).toBe(false);
  });

  it('uses server-authoritative SPENDABLE credits, not a larger historical total', async () => {
    const reader = vi.fn(async () => ({ availableCredits: 9, totalCredits: 309 }));
    const state = await readChatCreditAvailabilityV1({
      verifiedSubjectId: subject,
      balancePort: { readCurrentSpendable: reader },
    });
    expect(reader).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledWith({ verifiedSubjectId: subject });
    expect(state).toEqual({
      availableCredits: 9, totalCredits: 309, requiredCredits: 10,
      insufficient: true,
    });
  });

  it('requires 10 spendable credits exactly, not 9', async () => {
    const at10 = await readChatCreditAvailabilityV1({
      verifiedSubjectId: subject,
      balancePort: { readCurrentSpendable: async () =>
        ({ availableCredits: 10, totalCredits: 10 }) },
    });
    expect(at10.insufficient).toBe(false);
    // Advisory read is never a reserved turn or charge authority.
    expect(at10).not.toHaveProperty('reservationId');
  });

  it('requires an atomic Subject+Thread+clientTurnId reservation before permitting AI work', async () => {
    const reserve = vi.fn(async () => ({ kind: 'reserved' as const, reservationId: reservation }));
    const state = await reserveChatReplyCreditsV1({
      verifiedSubjectId: subject.toUpperCase(), threadId: thread,
      clientTurnId: turn, port: { reserveForReply: reserve },
    });
    expect(reserve).toHaveBeenCalledOnce();
    expect(reserve).toHaveBeenCalledWith({
      verifiedSubjectId: subject, threadId: thread, clientTurnId: turn,
      requiredCredits: 10,
    });
    expect(state).toEqual({ kind: 'reservation', reservationId: reservation, requiredCredits: 10 });
  });

  it('preserves replay identity and never instructs a second reservation', async () => {
    const rerequest = await reserveChatReplyCreditsV1({
      verifiedSubjectId: subject, threadId: thread, clientTurnId: turn,
      port: { reserveForReply: async () =>
        ({ kind: 'already_reserved', reservationId: reservation }) },
    });
    expect(rerequest).toEqual({ kind: 'reservation', reservationId: reservation, requiredCredits: 10 });

    const committed = await reserveChatReplyCreditsV1({
      verifiedSubjectId: subject, threadId: thread, clientTurnId: turn,
      port: { reserveForReply: async () =>
        ({ kind: 'committed_replay', committedTurnId: turn }) },
    });
    expect(committed).toEqual({ kind: 'committed_replay', committedTurnId: turn });
  });

  it('returns a stable shortage and conflict without AI admission', async () => {
    const denied = await reserveChatReplyCreditsV1({
      verifiedSubjectId: subject, threadId: thread, clientTurnId: turn,
      port: { reserveForReply: async () =>
        ({ kind: 'insufficient', availableCredits: 0, totalCredits: 50 }) },
    });
    expect(denied).toEqual({ kind: 'insufficient', availableCredits: 0, totalCredits: 50 });
    const conflict = await reserveChatReplyCreditsV1({
      verifiedSubjectId: subject, threadId: thread, clientTurnId: turn,
      port: { reserveForReply: async () => ({ kind: 'conflict' }) },
    });
    expect(conflict).toEqual({ kind: 'conflict' });
  });

  it('fails closed on unknown/invalid authority balances, UUIDs and reservations', async () => {
    await expect(readChatCreditAvailabilityV1({
      verifiedSubjectId: subject,
      balancePort: { readCurrentSpendable: async () =>
        ({ availableCredits: Number.NaN, totalCredits: 200 }) },
    })).rejects.toThrow('invalid balance');
    await expect(readChatCreditAvailabilityV1({
      verifiedSubjectId: 'injected-subject',
      balancePort: { readCurrentSpendable: async () =>
        ({ availableCredits: 9, totalCredits: 10 }) },
    })).rejects.toThrow('server-verified');
    await expect(reserveChatReplyCreditsV1({
      verifiedSubjectId: subject, threadId: thread, clientTurnId: turn,
      port: { reserveForReply: async () =>
        ({ kind: 'reserved', reservationId: 'fake-id' }) },
    })).rejects.toThrow('credit reservation');
  });

  it('returns only a no-store 402 handoff, not a usable checkout path', async () => {
    const response = createChatCreditInsufficientResponseV1({
      requestId: 'req-1', threadId: thread, clientTurnId: turn,
      availableCredits: 9, totalCredits: 50,
    });
    expect(response.status).toBe(402);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe(COMMERCE_CHAT_CREDIT_ERROR_CODES_V1.insufficient);
    expect(payload.error.retryable).toBe(false);
    expect(payload.data).toEqual({
      availableCredits: 9, totalCredits: 50, requiredCredits: 10,
      topUp: chatCreditTopUpOfferForUiV1(),
      resume: { threadId: thread, clientTurnId: turn },
    });
    expect(JSON.stringify(payload)).not.toContain('providerCredential');
  });

  it('never emits CREDIT_INSUFFICIENT with >=10 spendable credits', () => {
    expect(() => createChatCreditInsufficientResponseV1({
      requestId: 'req-2', threadId: thread, clientTurnId: turn,
      availableCredits: 10, totalCredits: 10,
    })).toThrow('verified shortage');
  });
});
