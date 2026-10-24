/**
 * L3-A: Content-free evidence for each external Seyeon AI dispatch attempt.
 *
 * DO NOT stringify arbitrary input, emit keys, hashes, subject IDs, text
 * lengths, private source IDs, prompt fragments or raw model replies.
 * The schema contains ONLY fixed category literals and coarse count buckets.
 */
export const SEYEON_EXTERNAL_EGRESS_EVIDENCE_V1 = Object.freeze({
  schemaVersion: 'myeongha-seyeon-egress-evidence-v1',
  payloadLogged: false,
  includesIdentifyingValues: false,
  intendedRetention: 'existing-operational-logs-unchanged',
} as const);

type Bucket = 'none' | '1-5' | '6-20' | '21+' | 'unknown';
type Stage = 'turn_interpretation' | 'dialogue_render' | 'semantic_review' | 'unknown';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function countBucket(value: unknown): Bucket {
  if (!Array.isArray(value)) return 'unknown';
  if (value.length === 0) return 'none';
  if (value.length <= 5) return '1-5';
  if (value.length <= 20) return '6-20';
  return '21+';
}

export type SeyeonExternalEgressEvidenceV1 = Readonly<{
  schemaVersion: typeof SEYEON_EXTERNAL_EGRESS_EVIDENCE_V1.schemaVersion;
  stage: Stage;
  destinationClass: 'openai_direct' | 'vercel_ai_gateway';
  storeFalseRequested: true;
  contentLogged: false;
  privateDataPossible: true;
  conversationCountBucket: Bucket;
  memoryCountBucket: Bucket;
  hasRendererPacket: boolean;
  hasGeneratedDraft: boolean;
}>;

export function buildSeyeonExternalEgressEvidenceV1(input: Readonly<{
  purpose: unknown;
  destination: 'openai_direct' | 'vercel_ai_gateway';
  providerInput: unknown;
}>): SeyeonExternalEgressEvidenceV1 {
  const stage: Stage = input.purpose === 'turn_interpretation' ||
    input.purpose === 'dialogue_render' || input.purpose === 'semantic_review'
      ? input.purpose : 'unknown';
  const root = isRecord(input.providerInput) ? input.providerInput : {};
  const context = isRecord(root.context) ? root.context : null;
  // For render/review the packet can contain user text and source excerpts.
  // Never introspect it: recording source names can become identifying.
  return Object.freeze({
    schemaVersion: SEYEON_EXTERNAL_EGRESS_EVIDENCE_V1.schemaVersion,
    stage,
    destinationClass: input.destination,
    storeFalseRequested: true,
    contentLogged: false,
    privateDataPossible: true,
    conversationCountBucket: context === null ? 'unknown'
      : countBucket(context.recentConversation),
    memoryCountBucket: context === null ? 'unknown'
      : countBucket(context.retrievedMemories),
    hasRendererPacket: isRecord(root.packet),
    hasGeneratedDraft: Object.prototype.hasOwnProperty.call(root, 'rendererDraft'),
  });
}
