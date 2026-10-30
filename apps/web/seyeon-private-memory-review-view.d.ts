// Watchtower-Track: security
import type {
  SeyeonOriginalUserMessageSourceV1,
  SeyeonPrivateMemoryAcceptedReceiptV1,
  SeyeonPrivateMemoryProposalReceiptV1,
} from './seyeon-private-memory-review-client.js';

export interface ServerVerifiedOriginalMessageOfferV1
  extends SeyeonOriginalUserMessageSourceV1 {
  readonly sourceAuthority: 'server_original_message';
  readonly characterId: 'seyeon';
  readonly redacted: false;
}

export interface SeyeonPrivateMemoryReviewViewClientV1 {
  prepareOriginalUserMessage(source: SeyeonOriginalUserMessageSourceV1):
    Promise<Readonly<SeyeonPrivateMemoryProposalReceiptV1>>;
  acceptPreparedPrivate(receipt: SeyeonPrivateMemoryProposalReceiptV1, memberConfirmed: boolean):
    Promise<Readonly<SeyeonPrivateMemoryAcceptedReceiptV1>>;
}

export function mountSeyeonPrivateMemoryReviewV1(options: {
  container: HTMLElement;
  originalSource: ServerVerifiedOriginalMessageOfferV1;
  client?: SeyeonPrivateMemoryReviewViewClientV1;
}): HTMLElement | null;
