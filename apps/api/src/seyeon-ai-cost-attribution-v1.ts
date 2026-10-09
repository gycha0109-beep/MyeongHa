import {
  summarizeSeyeonAiCostsV1,
  type SeyeonAiCostEventV1,
} from './seyeon-ai-usage-cost-v1.js';

export const SEYEON_AI_COST_ATTRIBUTION_VERSION_V1 =
  'seyeon-ai-cost-attribution-v1' as const;

export type SeyeonAiAttributionStageV1 =
  | 'preflight'
  | 'interpretation'
  | 'dialogue_render'
  | 'semantic_review'
  | 'event_extraction';

/**
 * An explicit server-only association of a provider call to one canonical
 * subject and turn. The provider does not receive subject/turn identifiers.
 * The event must come from the provider meter; it must not be constructed from
 * a client request. No text, prompts or response payloads are retained.
 */
export interface SeyeonAiAttributedCallV1 {
  readonly schemaVersion: typeof SEYEON_AI_COST_ATTRIBUTION_VERSION_V1;
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId: string | null;
  readonly postTurnOutboxEventId: string | null;
  readonly stage: SeyeonAiAttributionStageV1;
  readonly event: SeyeonAiCostEventV1;
}

const allowedPurpose: Readonly<Record<SeyeonAiAttributionStageV1, string>> =
  Object.freeze({
    preflight: 'preflight',
    interpretation: 'interpretation',
    dialogue_render: 'dialogue_render',
    semantic_review: 'semantic_review',
    event_extraction: 'event_extraction',
  });

function serverId(value: string, field: string): string {
  if (typeof value !== 'string' || value.length < 1 ||
      value.length > 256 || !/^[a-zA-Z0-9_.:\/-]+$/u.test(value)) {
    throw new Error('Se-yeon cost attribution invalid ' + field + '.');
  }
  return value;
}

export function attributeSeyeonAiCostCallV1(input: {
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly attemptId?: string;
  readonly postTurnOutboxEventId?: string;
  readonly stage: SeyeonAiAttributionStageV1;
  readonly event: SeyeonAiCostEventV1;
}): SeyeonAiAttributedCallV1 {
  const { event, stage } = input;
  if (event.schemaVersion !== 'seyeon-ai-cost-v1' ||
      allowedPurpose[stage] === undefined ||
      event.purpose !== allowedPurpose[stage]) {
    throw new Error('Se-yeon cost attribution stage/purpose mismatch.');
  }
  if (stage === 'event_extraction' &&
      (input.postTurnOutboxEventId === undefined ||
       input.attemptId !== undefined)) {
    throw new Error('Post-turn cost must reference an outbox event, not a chat attempt.');
  }
  if (stage !== 'event_extraction' &&
      (input.attemptId === undefined ||
       input.postTurnOutboxEventId !== undefined)) {
    throw new Error('Inline AI cost must reference its execution attempt.');
  }
  return Object.freeze({
    schemaVersion: SEYEON_AI_COST_ATTRIBUTION_VERSION_V1,
    subjectId: serverId(input.subjectId, 'subjectId'),
    threadId: serverId(input.threadId, 'threadId'),
    turnId: serverId(input.turnId, 'turnId'),
    attemptId: input.attemptId === undefined
      ? null : serverId(input.attemptId, 'attemptId'),
    postTurnOutboxEventId: input.postTurnOutboxEventId === undefined
      ? null : serverId(input.postTurnOutboxEventId, 'postTurnOutboxEventId'),
    stage,
    event,
  });
}

/**
 * A provider call ID has only one canonical attribution even on replay.
 * Repeated identical snapshots are deduplicated; conflicting attribution or
 * usage for an already observed call ID is a hard error.
 */
export function summarizeSeyeonAttributedTurnCostsV1(input: {
  readonly subjectId: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly calls: readonly SeyeonAiAttributedCallV1[];
}) {
  const subjectId = serverId(input.subjectId, 'subjectId');
  const threadId = serverId(input.threadId, 'threadId');
  const turnId = serverId(input.turnId, 'turnId');
  const byCall = new Map<string, SeyeonAiAttributedCallV1>();
  for (const call of input.calls) {
    if (call.subjectId !== subjectId || call.threadId !== threadId ||
        call.turnId !== turnId) {
      throw new Error('AI cost call belongs to a different canonical turn.');
    }
    const prior = byCall.get(call.event.callId);
    if (prior !== undefined) {
      if (JSON.stringify(prior) !== JSON.stringify(call)) {
        throw new Error('AI cost call ID has conflicting attribution.');
      }
      continue;
    }
    byCall.set(call.event.callId, call);
  }
  const summary = summarizeSeyeonAiCostsV1(
    [...byCall.values()].map((call) => call.event),
  );
  return Object.freeze({
    schemaVersion: SEYEON_AI_COST_ATTRIBUTION_VERSION_V1,
    subjectId, threadId, turnId,
    ...summary,
    attempts: new Set(
      [...byCall.values()].map((call) => call.attemptId).filter(
        (id): id is string => id !== null,
      ),
    ).size,
  });
}
