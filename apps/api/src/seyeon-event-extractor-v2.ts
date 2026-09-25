import {
  SEYEON_EXPERIMENTAL_EVENT_KINDS_V2,
  guardSeyeonEventExtractionCandidateV2,
  validateSeyeonEventExtractionContextV2,
  type SeyeonEventExtractionCandidateV2,
  type SeyeonEventExtractionContextV2,
} from '../../../packages/domain/src/index.js';
import {
  SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
  type SeyeonStructuredProviderPortV2,
  type SeyeonStructuredProviderRequestV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_EVENT_EXTRACTOR_PROVIDER_VERSION_V2 =
  'seyeon-event-extractor-provider-exp-v2' as const;

const EVENT_EXTRACTION_RESPONSE_SCHEMA_V2 = Object.freeze({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'decision', 'reason'],
      properties: {
        schemaVersion: {
          const: 'seyeon-event-extraction-candidate-exp-v2',
        },
        decision: { const: 'none' },
        reason: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion',
        'decision',
        'reason',
        'eventKind',
        'sourceMessageRefs',
        'causalPredecessorEventIds',
        'facts',
        'characterInterpretation',
        'salience',
        'confidence',
        'dedupeBasis',
      ],
      properties: {
        schemaVersion: {
          const: 'seyeon-event-extraction-candidate-exp-v2',
        },
        decision: { const: 'event' },
        reason: { type: 'string', minLength: 1, maxLength: 1200 },
        eventKind: { enum: SEYEON_EXPERIMENTAL_EVENT_KINDS_V2 },
        sourceMessageRefs: {
          type: 'array',
          minItems: 1,
          maxItems: 16,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 512 },
        },
        causalPredecessorEventIds: {
          type: 'array',
          maxItems: 8,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 512 },
        },
        facts: {
          type: 'array',
          minItems: 1,
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['factKey', 'statement', 'sourceRefs'],
            properties: {
              factKey: { type: 'string', minLength: 1, maxLength: 128 },
              statement: { type: 'string', minLength: 1, maxLength: 1200 },
              sourceRefs: {
                type: 'array',
                minItems: 1,
                maxItems: 8,
                uniqueItems: true,
                items: { type: 'string', minLength: 1, maxLength: 512 },
              },
            },
          },
        },
        characterInterpretation: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['statement', 'confidence', 'sourceRefs'],
              properties: {
                statement: { type: 'string', minLength: 1, maxLength: 1200 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                sourceRefs: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 8,
                  uniqueItems: true,
                  items: { type: 'string', minLength: 1, maxLength: 512 },
                },
              },
            },
          ],
        },
        salience: { type: 'number', minimum: 0.35, maximum: 1 },
        confidence: { type: 'number', minimum: 0.5, maximum: 1 },
        dedupeBasis: { type: 'string', minLength: 1, maxLength: 256 },
      },
    },
  ],
} as const);

export function buildSeyeonEventExtractorRequestV2(
  context: SeyeonEventExtractionContextV2,
): SeyeonStructuredProviderRequestV2 {
  validateSeyeonEventExtractionContextV2(context);
  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'event_extraction' as const,
    instructions:
      'Post-turn event extraction for Se-yeon. Most ordinary turns must return decision=none. Create an event only for durable relationship meaning consistent with Se-yeon Runtime R12/R15: promises, remembered Se-yeon details, receiving/requesting help, meaningful self-disclosure, admitted waiting, specialness invalidation, conflict/repair, or return after absence. Keep objective facts separate from Se-yeon interpretation. Cite only current turn message IDs for new facts. Use causalPredecessorEventIds only from context.priorEvents when the new event depends on prior relationship history. PROMISE_KEPT/PROMISE_BROKEN require a prior PROMISE_MADE; RECONCILIATION_EVENT requires a prior conflict predecessor. Do not infer hidden user emotion, thought, intent, or unperformed action. The event vocabulary is experimental and must not be treated as canonical DB taxonomy.',
    input: Object.freeze({
      extractorVersion: SEYEON_EVENT_EXTRACTOR_PROVIDER_VERSION_V2,
      context,
    }),
    responseSchema: EVENT_EXTRACTION_RESPONSE_SCHEMA_V2,
  });
}

export async function extractSeyeonEventCandidateV2(input: {
  readonly context: SeyeonEventExtractionContextV2;
  readonly provider: SeyeonStructuredProviderPortV2;
}): Promise<SeyeonEventExtractionCandidateV2> {
  let rawOutput: unknown;
  try {
    rawOutput = await input.provider.generate(
      buildSeyeonEventExtractorRequestV2(input.context),
    );
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Se-yeon event extractor provider failed: ${error.message}`
        : 'Se-yeon event extractor provider failed.',
      { cause: error },
    );
  }

  return guardSeyeonEventExtractionCandidateV2({
    rawOutput,
    context: input.context,
  });
}