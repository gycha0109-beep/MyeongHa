import type {
  SeyeonProductionPersonalRecordProjectorV1,
} from './seyeon-production-context-v1.js';

/**
 * First explicit, versioned Character Memory codec.
 *
 * Architectural source: memory_items contains user-approved conversation or
 * character-relationship recall, not life_facts or birth-profile authority.
 *
 * This module defines a usable projection CONTRACT, not permission to read
 * personal data, not a DB Grant, and not an enablement of Production Projectors.
 */
export const SEYEON_CONVERSATION_RECALL_MEMORY_TYPE_V1 =
  'conversation_recall' as const;
export const SEYEON_CONVERSATION_RECALL_MEMORY_SCHEMA_V1 =
  'v1' as const;
export const SEYEON_CONVERSATION_RECALL_PROJECTOR_VERSION_V1 =
  'seyeon-conversation-recall-projector-v1' as const;

export interface SeyeonConversationRecallPayloadV1 {
  readonly summary: string;
}

export class SeyeonConversationRecallPayloadErrorV1 extends Error {
  readonly code = 'SEYEON_CONVERSATION_RECALL_PAYLOAD_INVALID' as const;
  constructor() {
    super('The approved conversation-recall memory payload is invalid.');
    this.name = 'SeyeonConversationRecallPayloadErrorV1';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL = /[\u0000-\u001f\u007f]/u;

/**
 * No implicit text conversion, no extra fields, no inferred personal facts.
 * Admission still requires the DB-authoritative original Grant and G1 Pin.
 */
export function parseSeyeonConversationRecallPayloadV1(
  payload: unknown,
): Readonly<SeyeonConversationRecallPayloadV1> {
  if (payload === null || typeof payload !== 'object' ||
      Array.isArray(payload)) {
    throw new SeyeonConversationRecallPayloadErrorV1();
  }
  const row = payload as Record<string, unknown>;
  if (Object.keys(row).length !== 1 ||
      !Object.hasOwn(row, 'summary') ||
      typeof row.summary !== 'string' ||
      row.summary.length < 1 || row.summary.length > 4000 ||
      row.summary !== row.summary.trim() || CONTROL.test(row.summary)) {
    throw new SeyeonConversationRecallPayloadErrorV1();
  }
  return Object.freeze({ summary: row.summary });
}

/**
 * Intentionally exported but NOT added to
 * SEYEON_PRODUCTION_PERSONAL_RECORD_PROJECTORS_V1 (still []).
 * Runtime activation and DB registration are separate decisions.
 */
export const SEYEON_CONVERSATION_RECALL_PROJECTOR_V1:
  SeyeonProductionPersonalRecordProjectorV1 &
  Readonly<{ projectorVersion: typeof SEYEON_CONVERSATION_RECALL_PROJECTOR_VERSION_V1 }> =
  Object.freeze({
    recordKind: 'memory' as const,
    recordType: SEYEON_CONVERSATION_RECALL_MEMORY_TYPE_V1,
    schemaVersion: SEYEON_CONVERSATION_RECALL_MEMORY_SCHEMA_V1,
    projectorVersion: SEYEON_CONVERSATION_RECALL_PROJECTOR_VERSION_V1,
    project(input: Readonly<{ recordId: string; payload: unknown }>) {
      if (typeof input.recordId !== 'string' || !UUID.test(input.recordId)) {
        throw new SeyeonConversationRecallPayloadErrorV1();
      }
      const memory = parseSeyeonConversationRecallPayloadV1(input.payload);
      return Object.freeze({
        summary: memory.summary,
        claimKind: 'character_interpretation' as const,
        // One source at initial admission: fixed neutral ranking, not a
        // score suggested by untrusted JSON, the user, or a model.
        relevance: 0.5,
        salience: 0.5,
      });
    },
  });
