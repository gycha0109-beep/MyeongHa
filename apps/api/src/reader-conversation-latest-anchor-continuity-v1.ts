import { createHash } from 'node:crypto';
import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedStandardChatPreflightV2,
  type CharacterStandardReadingChatTurnPreflightV2,
} from './character-standard-reading-chat-turn-preflight-v2.js';
import {
  assertServerPreparedStandardChatGroundingV2,
  type CharacterStandardChatGroundingV2,
} from './character-standard-reading-chat-grounding-v2.js';
import {
  classifyCharacterStandardFollowupQuestionScopeV1,
  inspectCharacterStandardFollowupSignalsV1,
  assertServerPreparedStandardFollowupQuestionScopeV1,
  type CharacterStandardFollowupQuestionScopeDecisionV1,
} from './character-standard-reading-chat-question-scope-v1.js';
import type {
  ValidatedStandardFollowupAnchorAuthorityPortV1,
} from './character-standard-reading-chat-followup-evidence-v1.js';
import type {
  ReaderContextNonMemoryReadAuthorityPortV1,
  ReaderRecentMessageAuthorityRowV1,
} from './reader-context-non-memory-read.js';

export const READER_LATEST_ANCHOR_CONTINUITY_VERSION_V1 =
  'reader-latest-anchor-continuity-v1' as const;

export type ReaderLatestAnchorContinuityDecisionV1 =
  | Readonly<{
      schemaVersion: typeof READER_LATEST_ANCHOR_CONTINUITY_VERSION_V1;
      mode: 'last_validated_official_answer_candidate';
      questionScope: Exclude<CharacterStandardFollowupQuestionScopeDecisionV1, {mode: 'hold'}>;
      subjectId: string;
      threadId: string;
      readerCharacterId: string;
      readingRef: string;
      assistantMessageId: string;
      selectedSourceUnitIds: readonly string[];
      lastTurnMetadataDigest: string;
      permitsModelInjection: false;
      permitsCommit: false;
      permitsHttpReveal: false;
      addedModelCalls: 0;
    }>
  | Readonly<{
      schemaVersion: typeof READER_LATEST_ANCHOR_CONTINUITY_VERSION_V1;
      mode: 'hold';
      reason: 'SOURCE_UNAVAILABLE' | 'LATEST_ASSISTANT_UNAVAILABLE' |
        'ANCHOR_NOT_LAST_ASSISTANT' | 'SOURCE_CHANGED' |
        'FOLLOWUP_SCOPE_REJECTED';
      permitsModelInjection: false;
      permitsCommit: false;
      permitsHttpReveal: false;
      addedModelCalls: 0;
    }>;

function hold(
  reason: Extract<ReaderLatestAnchorContinuityDecisionV1, {mode:'hold'}>['reason'],
): ReaderLatestAnchorContinuityDecisionV1 {
  return Object.freeze({
    schemaVersion: READER_LATEST_ANCHOR_CONTINUITY_VERSION_V1,
    mode: 'hold' as const, reason,
    permitsModelInjection: false as const,
    permitsCommit: false as const,
    permitsHttpReveal: false as const,
    addedModelCalls: 0 as const,
  });
}

export type ReaderLatestAssistantObservationV1 =
  | Readonly<{
      mode: 'latest_assistant_metadata';
      assistantMessageId: string;
      metadataDigest: string;
      permitsSourceAuthority: false;
    }>
  | Readonly<{
      mode: 'hold';
      reason: 'SOURCE_UNAVAILABLE' | 'LATEST_ASSISTANT_UNAVAILABLE';
      permitsSourceAuthority: false;
    }>;

function validId(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 &&
    x.length <= 256 && x.trim() === x;
}

/**
 * Read-only examination of a DB-origin transcript projection. Never derives
 * semantic evidence from body text, nor issues an approved Saju focus.
 * Sorts by authoritative sequence (not array order); rejects duplicates.
 */
export function inspectReaderLatestAssistantObservationV1(input: Readonly<{
  rows: readonly ReaderRecentMessageAuthorityRowV1[];
  expectedReaderCharacterId: string;
}>): ReaderLatestAssistantObservationV1 {
  if (!Array.isArray(input.rows) || input.rows.length === 0 ||
      input.rows.length > 32 || !validId(input.expectedReaderCharacterId)) {
    return Object.freeze({mode:'hold',reason:'SOURCE_UNAVAILABLE',permitsSourceAuthority:false});
  }
  const seenIds = new Set<string>();
  const seenSequences = new Set<number>();
  const metadata: Array<{
    messageId:string; sequenceNo:number;
    senderType:'user'|'character'; characterId:string|null;
  }> = [];
  for (const row of input.rows) {
    if (!row || !validId(row.messageId) ||
        !Number.isSafeInteger(row.sequenceNo) || row.sequenceNo < 0 ||
        seenIds.has(row.messageId) || seenSequences.has(row.sequenceNo) ||
        !['user','character'].includes(row.senderType) ||
        (row.senderType === 'character' && row.characterId !== input.expectedReaderCharacterId) ||
        (row.senderType === 'user' && row.characterId !== null) ||
        typeof row.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(row.createdAt)) ||
        typeof row.text !== 'string') {
      return Object.freeze({mode:'hold',reason:'SOURCE_UNAVAILABLE',permitsSourceAuthority:false});
    }
    seenIds.add(row.messageId);
    seenSequences.add(row.sequenceNo);
    metadata.push({
      messageId:row.messageId,
      sequenceNo:row.sequenceNo,
      senderType:row.senderType as 'user'|'character',
      characterId:row.characterId,
    });
  }
  metadata.sort((a,b)=>b.sequenceNo-a.sequenceNo);
  const latestAssistant=metadata.find(row=>row.senderType==='character');
  if (!latestAssistant) {
    return Object.freeze({
      mode:'hold',reason:'LATEST_ASSISTANT_UNAVAILABLE',
      permitsSourceAuthority:false,
    });
  }
  return Object.freeze({
    mode:'latest_assistant_metadata' as const,
    assistantMessageId:latestAssistant.messageId,
    metadataDigest:'sha256:v1:'+createHash('sha256')
      .update(canonicalJson(metadata)).digest('hex'),
    permitsSourceAuthority:false as const,
  });
}

/**
 * RR-08 stale-anaphora boundary: even a valid latest *official* anchor may
 * be semantically stale when an unrelated Reader message followed it.
 *
 * Reuses the already-authorized latest Validated Official Anchor lookup and
 * the existing Reader recent-message read authority; no new DB query/port.
 * Caller must hold both server-minted RR-05 preflight and Saju grounding.
 *
 * This is a non-authorizing continuation candidate, NOT a transactional Pin,
 * commit/reveal proof, provider input, or positive AI security adjudication.
 */
export async function prepareReaderLatestAnchorContinuityV1(input: Readonly<{
  preflight: CharacterStandardReadingChatTurnPreflightV2;
  grounded: CharacterStandardChatGroundingV2;
  anchorAuthorityPort: ValidatedStandardFollowupAnchorAuthorityPortV1;
  recentMessageAuthorityPort: Pick<ReaderContextNonMemoryReadAuthorityPortV1,'readRecentMessages'>;
}>): Promise<ReaderLatestAnchorContinuityDecisionV1> {
  try {
    assertServerPreparedStandardChatPreflightV2(input.preflight);
    assertServerPreparedStandardChatGroundingV2(input.grounded);
  } catch {
    return hold('SOURCE_UNAVAILABLE');
  }

  const scope=input.grounded.scope;
  if (input.preflight.scope.subjectId!==scope.subjectId ||
      input.preflight.scope.threadId!==scope.threadId ||
      input.preflight.scope.readerCharacterId!==scope.readerCharacterId ||
      input.preflight.scope.readingId!==scope.readingId ||
      input.preflight.scope.officialArtifactResponseHash!==scope.officialArtifactResponseHash ||
      input.preflight.receivePlan.normalizedRequest.threadId!==scope.threadId) {
    return hold('SOURCE_UNAVAILABLE');
  }

  // Existing RR-05 syntax and security-signal inspection is only a negative
  // prefilter. Do not read a private transcript for novel Saju scope,
  // prompt injection or unsupported questions.
  const assessment=inspectCharacterStandardFollowupSignalsV1(
    input.preflight.receivePlan.normalizedRequest.text,
    scope.sajuDomain,
  );
  if (assessment.intent!=='admitted' || assessment.securitySignals.length!==0) {
    return hold('FOLLOWUP_SCOPE_REJECTED');
  }

  const read=async ():Promise<ReaderLatestAssistantObservationV1>=>{
    try {
      const rows=await input.recentMessageAuthorityPort.readRecentMessages({
        subjectId:scope.subjectId,threadId:scope.threadId,limit:32,
      });
      return inspectReaderLatestAssistantObservationV1({
        rows,expectedReaderCharacterId:scope.readerCharacterId,
      });
    }catch {
      return Object.freeze({
        mode:'hold' as const, reason:'SOURCE_UNAVAILABLE' as const,
        permitsSourceAuthority:false as const,
      });
    }
  };

  const before=await read();
  if (before.mode==='hold') return hold(before.reason);

  let question:CharacterStandardFollowupQuestionScopeDecisionV1;
  try {
    question=await classifyCharacterStandardFollowupQuestionScopeV1({
      preflight:input.preflight,
      grounded:input.grounded,
      anchorAuthorityPort:input.anchorAuthorityPort,
    });
  }catch {
    return hold('FOLLOWUP_SCOPE_REJECTED');
  }
  if (question.mode==='hold') return hold('FOLLOWUP_SCOPE_REJECTED');
  try {
    assertServerPreparedStandardFollowupQuestionScopeV1(question);
  }catch{
    return hold('FOLLOWUP_SCOPE_REJECTED');
  }

  const evidence=question.evidence;
  if (evidence.subjectId!==scope.subjectId ||
      evidence.threadId!==scope.threadId ||
      evidence.readerCharacterId!==scope.readerCharacterId ||
      evidence.readingRef!==scope.readingId ||
      evidence.officialArtifactResponseHash!==scope.officialArtifactResponseHash ||
      evidence.groundingHash!==input.grounded.grounding.groundingHash) {
    return hold('SOURCE_UNAVAILABLE');
  }
  if (before.assistantMessageId!==evidence.assistantMessageId) {
    return hold('ANCHOR_NOT_LAST_ASSISTANT');
  }

  const after=await read();
  if (after.mode==='hold' ||
      after.assistantMessageId!==before.assistantMessageId ||
      after.metadataDigest!==before.metadataDigest) {
    return hold('SOURCE_CHANGED');
  }

  return Object.freeze({
    schemaVersion:READER_LATEST_ANCHOR_CONTINUITY_VERSION_V1,
    mode:'last_validated_official_answer_candidate' as const,
    questionScope:question,
    subjectId:scope.subjectId,threadId:scope.threadId,
    readerCharacterId:scope.readerCharacterId,
    readingRef:scope.readingId,
    assistantMessageId:evidence.assistantMessageId,
    selectedSourceUnitIds:Object.freeze([...evidence.selectedUnitIds]),
    lastTurnMetadataDigest:after.metadataDigest,
    permitsModelInjection:false as const,
    permitsCommit:false as const,
    permitsHttpReveal:false as const,
    addedModelCalls:0 as const,
  });
}
