/**
 * Payment-track server contract for one-off chat credits.
 *
 * No User-credit ledger, saleable Product Offer or production checkout is
 * established by this module. The caller supplies only server-verified Subject
 * identity and a DB-owned spendable balance or atomic reservation result.
 * Never substitute AI provider cost telemetry or aggregated total balance.
 */
export const COMMERCE_CHAT_CREDIT_POLICY_V1 = Object.freeze({
  schemaVersion: 'commerce-chat-credit-policy-v1',
  creditsPerDeliveredAiReply: 10,
  topUp: Object.freeze({
    amountMinor: 1900,
    currency: 'KRW',
    creditQuantity: 300,
    nominalReplyCount: 30,
    saleable: false,
    productOfferId: null,
    checkoutRoute: null,
  }),
  newSignupReward: Object.freeze({ credits: 50, validDays: 30 }),
  firstEligiblePaidReadingReward: Object.freeze({ credits: 150, validDays: 90 }),
  betaSubscriptionEnabled: false,
  creditIsRelationshipCurrency: false,
} as const);

export const COMMERCE_CHAT_CREDIT_ERROR_CODES_V1 = Object.freeze({
  insufficient: 'CREDIT_INSUFFICIENT',
  authorityUnavailable: 'CREDIT_AUTHORITY_UNAVAILABLE',
  reservationConflict: 'CREDIT_RESERVATION_CONFLICT',
} as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ChatCreditAvailabilityV1 = Readonly<{
  /** Spendable, unexpired, unlocked amount read by the canonical DB authority. */
  availableCredits: number;
  /** Informational only. May include expired/locked and must NOT authorize send. */
  totalCredits: number;
}>;

export interface ChatCreditAvailableBalancePortV1 {
  readCurrentSpendable(input: Readonly<{
    verifiedSubjectId: string;
  }>): Promise<ChatCreditAvailabilityV1>;
}

export type ChatCreditAtomicReservationOutcomeV1 =
  | Readonly<{ kind: 'reserved'; reservationId: string }>
  | Readonly<{ kind: 'already_reserved'; reservationId: string }>
  | Readonly<{ kind: 'committed_replay'; committedTurnId: string }>
  | Readonly<{ kind: 'insufficient'; availableCredits: number; totalCredits: number }>
  | Readonly<{ kind: 'conflict' }>;

export interface ChatCreditAtomicReservationPortV1 {
  /**
   * MUST atomically check spendable (unexpired, unreserved) credits and reserve
   * exactly 10 for this canonical Subject+Thread+clientTurnId under a DB lock
   * and uniqueness constraint. Replay must return the same reservation, never
   * take a second charge. Settlement/reversal belongs to the delivered-turn
   * owner and the existing credit ledger; this interface does NOT settle.
   */
  reserveForReply(input: Readonly<{
    verifiedSubjectId: string;
    threadId: string;
    clientTurnId: string;
    requiredCredits: 10;
  }>): Promise<ChatCreditAtomicReservationOutcomeV1>;
}

export type ChatCreditGateResultV1 =
  | Readonly<{ kind: 'reservation'; reservationId: string; requiredCredits: 10 }>
  | Readonly<{ kind: 'committed_replay'; committedTurnId: string }>
  | Readonly<{ kind: 'insufficient'; availableCredits: number; totalCredits: number }>
  | Readonly<{ kind: 'conflict' }>;

function validCredits(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validatedBalance(balance: ChatCreditAvailabilityV1): ChatCreditAvailabilityV1 {
  if (!balance || !validCredits(balance.availableCredits) ||
      !validCredits(balance.totalCredits)) {
    throw new Error('Canonical credit authority returned an invalid balance.');
  }
  return Object.freeze({
    availableCredits: balance.availableCredits,
    totalCredits: balance.totalCredits,
  });
}

function verifiedUuid(name: string, value: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error('Invalid server-verified ' + name + '.');
  }
  return value.toLowerCase();
}

/** Display-only. An authoritative paid Product Offer is NOT provisioned yet. */
export function chatCreditTopUpOfferForUiV1() {
  return COMMERCE_CHAT_CREDIT_POLICY_V1.topUp;
}

/**
 * Optional advisory read for an authenticated, server-resolved Subject.
 * Even a positive result is NOT send authority: two concurrent callers can
 * spend the same visible balance. Only reserveChatReplyCreditsV1 may admit.
 */
export async function readChatCreditAvailabilityV1(input: Readonly<{
  verifiedSubjectId: string;
  balancePort: ChatCreditAvailableBalancePortV1;
}>): Promise<Readonly<ChatCreditAvailabilityV1 & {
  requiredCredits: 10;
  insufficient: boolean;
}>> {
  const subjectId = verifiedUuid('Subject', input.verifiedSubjectId);
  const balance = validatedBalance(
    await input.balancePort.readCurrentSpendable({ verifiedSubjectId: subjectId }),
  );
  return Object.freeze({
    ...balance,
    requiredCredits: COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
    insufficient:
      balance.availableCredits < COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
  });
}

/** Admission only through an implementation with DB-atomic reserve/replay. */
export async function reserveChatReplyCreditsV1(input: Readonly<{
  verifiedSubjectId: string;
  threadId: string;
  clientTurnId: string;
  port: ChatCreditAtomicReservationPortV1;
}>): Promise<ChatCreditGateResultV1> {
  const verifiedSubjectId = verifiedUuid('Subject', input.verifiedSubjectId);
  const threadId = verifiedUuid('Thread', input.threadId);
  const clientTurnId = verifiedUuid('clientTurnId', input.clientTurnId);
  const outcome = await input.port.reserveForReply({
    verifiedSubjectId,
    threadId,
    clientTurnId,
    requiredCredits: COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
  });
  if (outcome.kind === 'insufficient') {
    return Object.freeze({ kind: 'insufficient', ...validatedBalance(outcome) });
  }
  if (outcome.kind === 'reserved' || outcome.kind === 'already_reserved') {
    const reservationId = verifiedUuid('credit reservation', outcome.reservationId);
    return Object.freeze({ kind: 'reservation', reservationId, requiredCredits: 10 });
  }
  if (outcome.kind === 'committed_replay') {
    return Object.freeze({
      kind: 'committed_replay',
      committedTurnId: verifiedUuid('committed turn', outcome.committedTurnId),
    });
  }
  if (outcome.kind === 'conflict') return Object.freeze({ kind: 'conflict' });
  throw new Error('Canonical credit reserve authority returned an invalid outcome.');
}

/**
 * Stable UI handoff, not an endpoint. The server owns both IDs; clients may
 * preserve input text locally, but a return context is NEVER an auth token.
 * Intentionally no checkout URL until a verified saleable Offer exists.
 */
export function createChatCreditInsufficientResponseV1(input: Readonly<{
  requestId: string;
  threadId: string;
  clientTurnId: string;
  availableCredits: number;
  totalCredits: number;
}>): Response {
  if (typeof input.requestId !== 'string' || !input.requestId.trim() ||
      input.requestId.length > 128) throw new Error('Invalid server request id.');
  const threadId = verifiedUuid('Thread', input.threadId);
  const clientTurnId = verifiedUuid('clientTurnId', input.clientTurnId);
  const balance = validatedBalance(input);
  if (balance.availableCredits >= 10) {
    throw new Error('Credit insufficient response requires a verified shortage.');
  }
  return Response.json({
    ok: false,
    error: {
      code: COMMERCE_CHAT_CREDIT_ERROR_CODES_V1.insufficient,
      messageKey: 'chat.credit_insufficient',
      retryable: false,
    },
    data: {
      ...balance,
      requiredCredits: COMMERCE_CHAT_CREDIT_POLICY_V1.creditsPerDeliveredAiReply,
      topUp: chatCreditTopUpOfferForUiV1(),
      resume: { threadId, clientTurnId },
    },
    meta: { apiContractVersion: 'v0.9', requestId: input.requestId },
  }, {
    status: 402,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
  });
}
