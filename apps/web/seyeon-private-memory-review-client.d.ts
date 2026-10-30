export class SeyeonPrivateMemoryReviewErrorV1 extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown);
}

export interface SeyeonOriginalUserMessageSourceV1 {
  readonly threadId: string;
  readonly turnId: string;
  readonly messageId: string;
}

export interface SeyeonPrivateMemoryProposalReceiptV1 {
  readonly proposalId: string;
  readonly proposalKind: 'memory';
  readonly proposalState: 'pending';
  readonly shareState: 'private_not_accepted';
}

export interface SeyeonPrivateMemoryAcceptedReceiptV1 {
  readonly memoryItemId: string;
  readonly grantCount: 0;
  readonly shareState: 'private_not_shared';
}

export interface SeyeonPrivateMemoryReviewClientOptionsV1 {
  readonly fetchImpl?: (endpoint: string, init?: RequestInit) => Promise<Response>;
  readonly resolveBearer?: () => Promise<{ kind: string; token: string } | null> |
    { kind: string; token: string } | null;
  readonly chatEndpoint?: string;
  readonly proposalEndpoint?: string;
}

export function createSeyeonPrivateMemoryReviewClientV1(
  options?: SeyeonPrivateMemoryReviewClientOptionsV1,
): Readonly<{
  prepareOriginalUserMessage(
    source: SeyeonOriginalUserMessageSourceV1,
  ): Promise<Readonly<SeyeonPrivateMemoryProposalReceiptV1>>;
  acceptPreparedPrivate(
    receipt: SeyeonPrivateMemoryProposalReceiptV1,
    memberConfirmed: boolean,
  ): Promise<Readonly<SeyeonPrivateMemoryAcceptedReceiptV1>>;
}>;
