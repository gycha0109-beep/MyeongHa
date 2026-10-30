// Watchtower-Track: security
export class SeyeonPrivateMemoryReviewErrorV1 extends Error {
  readonly code: string;
  constructor(code: string, message: string, cause?: unknown);
}

export type MemoryDecisionChoiceV1 =
  | 'session_only' | 'character_only' | 'current_characters' | 'discard';

export interface ServerPlannerMemoryProposalV1 {
  readonly sourceAuthority: 'server_dialogue_planner';
  readonly characterId: 'seyeon';
  readonly proposalId: string;
  readonly proposalKind: 'memory' | 'life_fact';
  readonly proposalState: 'pending';
  readonly summary: string;
}

export interface SeyeonMemoryDecisionReceiptV1 {
  readonly proposalId: string;
  readonly decision: MemoryDecisionChoiceV1;
  readonly status: 'resolved';
  readonly persisted: boolean;
  readonly grantCount: number;
}

export interface SeyeonPrivateMemoryReviewClientOptionsV1 {
  readonly fetchImpl?: (endpoint: string, init?: RequestInit) => Promise<Response>;
  readonly resolveBearer?: () => Promise<{ kind: string; token: string } | null> |
    { kind: string; token: string } | null;
  readonly proposalEndpoint?: string;
}

export function isServerPlannerMemoryProposalV1(
  value: unknown,
): value is Readonly<ServerPlannerMemoryProposalV1>;

export function createSeyeonPrivateMemoryReviewClientV1(
  options?: SeyeonPrivateMemoryReviewClientOptionsV1,
): Readonly<{
  decidePlannerProposal(
    proposal: ServerPlannerMemoryProposalV1,
    choice: MemoryDecisionChoiceV1,
    confirmed: boolean,
  ): Promise<Readonly<SeyeonMemoryDecisionReceiptV1>>;
}>;
