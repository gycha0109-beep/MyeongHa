// Watchtower-Track: security
// A candidate original UserMessage may become a *review offer* only AFTER
// current Member/G3 Reveal authorization. No historical Message is disclosed
// here, and this function never authorizes G3 or a character Grant.
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SQL = `select thread_id::text as "threadId",
  turn_id::text as "turnId",
  message_id::text as "messageId"
  from seyeon_private.qry_seyeon_original_message_offer_v1(
    $1::uuid,$2::uuid,$3::uuid)`;

export const SEYEON_ORIGINAL_MEMORY_OFFER_V1 = Object.freeze({
  dbFunction:'seyeon_private.qry_seyeon_original_message_offer_v1',
  productionMounted:false,
  currentHistoryRevealAuthorized:false,
  consumer:'already-revealed-owner-scoped-original-message',
} as const);

export class SeyeonOriginalMemoryOfferHoldV1 extends Error {
  readonly code = 'SEYEON_ORIGINAL_MEMORY_OFFER_UNAVAILABLE' as const;
  constructor() {
    super('A verified original-message review offer is unavailable.');
    this.name='SeyeonOriginalMemoryOfferHoldV1';
  }
}

export interface SeyeonOriginalMessageOfferReadV1 {
  readonly subjectId: string;
  readonly threadId: string;
  readonly messageId: string;
  /** A server-verified Member's already revealed original chat row. */
  readonly revealedSource: Readonly<{
    threadId: string;
    messageId: string;
    senderType: 'user';
    characterId: 'seyeon';
    redacted: false;
    historyWithheld: false;
    memberReadAllowed: true;
  }>;
  /** Server policy/G3 proof; never built from an HTTP query/header/body. */
  readonly approvedHistoryReveal?: () => boolean | Promise<boolean>;
}

export interface SeyeonOriginalMessageOfferV1 {
  readonly sourceAuthority: 'server_original_message';
  readonly characterId: 'seyeon';
  readonly redacted: false;
  readonly threadId: string;
  readonly turnId: string;
  readonly messageId: string;
}

export async function readSeyeonOriginalMessageReviewOfferV1(
  client: PostgresTransactionQueryV1,
  input: SeyeonOriginalMessageOfferReadV1,
): Promise<Readonly<SeyeonOriginalMessageOfferV1> | null> {
  if (![input.subjectId,input.threadId,input.messageId].every(x =>
        typeof x==='string' && UUID.test(x)) ||
      input.revealedSource?.threadId!==input.threadId ||
      input.revealedSource?.messageId!==input.messageId ||
      input.revealedSource?.senderType!=='user' ||
      input.revealedSource?.characterId!=='seyeon' ||
      input.revealedSource?.redacted!==false ||
      input.revealedSource?.historyWithheld!==false ||
      input.revealedSource?.memberReadAllowed!==true) {
    throw new SeyeonOriginalMemoryOfferHoldV1();
  }
  let approved=false;
  try {
    approved=input.approvedHistoryReveal!==undefined &&
      await input.approvedHistoryReveal()===true;
  } catch {}
  if (!approved) throw new SeyeonOriginalMemoryOfferHoldV1();

  // This query is callable only by the S0 Chat runtime owner. A missing,
  // ineligible, deleted or unapproved DB source yields NO offer.
  const result = await client.query<{
    threadId:unknown;turnId:unknown;messageId:unknown;
  }>(SQL,[input.subjectId,input.threadId,input.messageId]);
  if (result.rows.length===0) return null;
  const row=result.rows[0];
  if (result.rows.length!==1 || row?.threadId!==input.threadId ||
      row?.messageId!==input.messageId ||
      typeof row.turnId!=='string' || !UUID.test(row.turnId)) {
    throw new SeyeonOriginalMemoryOfferHoldV1();
  }
  return Object.freeze({
    sourceAuthority:'server_original_message',
    characterId:'seyeon',
    redacted:false,
    threadId:input.threadId,
    turnId:row.turnId,
    messageId:input.messageId,
  });
}
