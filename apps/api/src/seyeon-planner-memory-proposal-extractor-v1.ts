// Watchtower-Track: security
// UC-06: Se-yeon's Dialogue Planner identifies one user-asserted fact.
// A model may propose; it NEVER creates an approved Memory/Grant or establishes
// fact truth. The quote must be exact original user text, not an AI rewrite.
import {
  SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  type SeyeonStructuredProviderPortV2,
  type SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';
import type { ServerSeyeonPlannerFactCandidateV1 }
  from './postgres-seyeon-planner-memory-proposal-producer-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

export const SEYEON_PLANNER_MEMORY_EXTRACTION_V1 = Object.freeze({
  purpose: 'memory_proposal_extraction',
  defaultModelAdmission: 'DENY',
  defaultDbWriteAdmission: 'DENY',
  automaticLongTermMemory: false,
  decisionAuthority: 'explicit_member_choice',
} as const);

export type SeyeonPlannerMemoryExtractionResultV1 =
  | Readonly<{ decision: 'none' }>
  | Readonly<{ decision: 'propose'; candidate: ServerSeyeonPlannerFactCandidateV1 }>;

export class SeyeonPlannerMemoryExtractionHoldV1 extends Error {
  readonly code = 'SEYEON_PLANNER_MEMORY_EXTRACTION_HOLD' as const;
  constructor() {
    super('Planner output lacks exact user-grounded fact evidence.');
    this.name = 'SeyeonPlannerMemoryExtractionHoldV1';
  }
}

const RESPONSE_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      required: ['decision'],
      properties: { decision: { const: 'none' } },
    },
    {
      type: 'object', additionalProperties: false,
      required: ['decision','claimAuthority','summary','userEvidenceQuote'],
      properties: {
        decision: { const: 'propose' },
        claimAuthority: { const: 'user_asserted' },
        summary: { type: 'string', minLength: 1, maxLength: 4000 },
        userEvidenceQuote: { type: 'string', minLength: 4, maxLength: 1000 },
      },
    },
  ],
});

export async function extractSeyeonPlannerMemoryCandidateV1(input: Readonly<{
  /** Trusted post-turn worker must supply only committed original evidence. */
  userMessageId: string;
  userText: string;
  assistantMessageId: string;
  assistantText: string;
  provider: SeyeonStructuredProviderPortV2;
}>): Promise<SeyeonPlannerMemoryExtractionResultV1> {
  if (!UUID.test(input.userMessageId) || !UUID.test(input.assistantMessageId) ||
      input.userMessageId === input.assistantMessageId ||
      typeof input.userText !== 'string' || input.userText.length < 1 ||
      typeof input.assistantText !== 'string' || input.assistantText.length < 1 ||
      input.userText.length > 20000 || input.assistantText.length > 20000 ||
      !input.provider || typeof input.provider.generate !== 'function') {
    throw new SeyeonPlannerMemoryExtractionHoldV1();
  }
  const request: SeyeonStructuredProviderRequestV2 = Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'memory_proposal_extraction',
    instructions: [
      'You are Se-yeon Dialogue Planner, NOT Memory storage or fact authority.',
      'Look at this ONE committed original user turn and Se-yeon reply.',
      'Propose at most one useful explicitly user-asserted life fact or personal detail',
      'the Character may naturally ask permission to remember; otherwise return none.',
      'Never force a proposal, infer biography, actions, emotion, intent, private attributes,',
      'or convert assistant words into user fact. Do not propose if user requested',
      'not to remember. The proposal is only user-asserted, not independently verified.',
      'summary must be a short third-person fact, NOT a copy of the entire User Message.',
      'userEvidenceQuote MUST be a verbatim continuous substring of userText.',
      'No private facts, external claims, Grant decisions, or persistent writes.',
      'The user independently chooses a scope later. Nothing is auto-remembered.',
    ].join(' '),
    input: Object.freeze({
      userMessageId: input.userMessageId,
      userText: input.userText,
      assistantMessageId: input.assistantMessageId,
      assistantText: input.assistantText,
    }),
    responseSchema: RESPONSE_SCHEMA,
  });
  const raw: unknown = await input.provider.generate(request);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SeyeonPlannerMemoryExtractionHoldV1();
  }
  const v = raw as Record<string, unknown>;
  if (v.decision === 'none' && Object.keys(v).length === 1) {
    return Object.freeze({ decision: 'none' as const });
  }
  if (Object.keys(v).length !== 4 ||
      v.decision !== 'propose' || v.claimAuthority !== 'user_asserted' ||
      typeof v.summary !== 'string' ||
      v.summary.length < 1 || v.summary.length > 4000 ||
      v.summary.trim() !== v.summary || CONTROL.test(v.summary) ||
      typeof v.userEvidenceQuote !== 'string' ||
      v.userEvidenceQuote.length < 4 ||
      v.userEvidenceQuote.length > 1000 ||
      v.userEvidenceQuote.trim() !== v.userEvidenceQuote ||
      CONTROL.test(v.userEvidenceQuote) ||
      !input.userText.includes(v.userEvidenceQuote) ||
      v.summary === input.userText ||
      v.summary === v.userEvidenceQuote) {
    throw new SeyeonPlannerMemoryExtractionHoldV1();
  }
  return Object.freeze({
    decision: 'propose' as const,
    candidate: Object.freeze({
      summary: v.summary,
      userEvidenceQuote: v.userEvidenceQuote,
    }),
  });
}
