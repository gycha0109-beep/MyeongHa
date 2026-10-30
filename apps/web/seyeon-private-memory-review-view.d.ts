// Watchtower-Track: security
import type {
  MemoryDecisionChoiceV1,
  ServerPlannerMemoryProposalV1,
  SeyeonMemoryDecisionReceiptV1,
} from './seyeon-private-memory-review-client.js';

export interface SeyeonMemoryProposalReviewViewClientV1 {
  decidePlannerProposal(
    proposal: ServerPlannerMemoryProposalV1,
    choice: MemoryDecisionChoiceV1,
    confirmed: boolean,
  ): Promise<Readonly<SeyeonMemoryDecisionReceiptV1>>;
}

export function mountSeyeonPrivateMemoryReviewV1(options: {
  container: HTMLElement;
  plannerProposal: ServerPlannerMemoryProposalV1;
  client?: SeyeonMemoryProposalReviewViewClientV1;
}): HTMLElement | null;
