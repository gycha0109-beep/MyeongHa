// Watchtower-Track: character-memory
// Independent production-execution core for the four additional Characters.
// This code intentionally has NO public route, Provider credentials or DB
// adapter. A Character becomes executable only after source-backed publication,
// audited per-Character model/guard ports and transactional receipt ownership.
import type {
  TrustedFiveCharacterChatTurnV1,
  FiveCharacterChatTurnExecutorV1,
} from './five-character-chat-turn-gateway-v1.js';
import type { FiveCharacterChatTargetV1 } from './five-character-chat-executor-selection-v1.js';

export const FOUR_INDEPENDENT_CHAT_TARGETS_V1 = Object.freeze([
  'baekheon', 'yeoul', 'rahyeon', 'taegyeom',
] as const);
export type FourIndependentChatTargetV1 =
  Exclude<FiveCharacterChatTargetV1, 'seyeon'>;

export class FourCharacterProductionExecutionHeldV1 extends Error {
  readonly code = 'FOUR_CHARACTER_PRODUCTION_EXECUTION_HELD' as const;
  constructor() {
    super('Independent Character execution requires exact published source and durable admission.');
    this.name = 'FourCharacterProductionExecutionHeldV1';
  }
}

/** Fetched by a trusted immutable Production publication reader, not Browser JSON. */
export interface PublishedFourCharacterModelSourceV1 {
  readonly characterId: FourIndependentChatTargetV1;
  readonly releaseId: string;
  readonly bundleId: string;
  readonly contentVersion: string;
  readonly assetManifestHash: string;
  readonly cueSchemaVersion: string;
  readonly bibleSourceRef: string;
  readonly runtimeSourceRef: string;
  readonly sourceDigest: string;
  readonly canonicalContext: string;
  readonly status: 'published';
}

export interface FourCharacterGeneratedDraftV1 {
  readonly characterId: FourIndependentChatTargetV1;
  readonly bodyText: string;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly usage: Readonly<Record<string, number>>;
}

export interface FourCharacterValidatedReplyV1 {
  readonly characterId: FourIndependentChatTargetV1;
  readonly bodyText: string;
  readonly outputGuardVersion: string;
  readonly groundingRefs: readonly string[];
  readonly approved: true;
}

export interface FourCharacterAtomicReservationV1 {
  readonly status: 'reserved' | 'replayed' | 'in_flight';
  readonly subjectId: string;
  readonly threadId: string;
  readonly characterId: FourIndependentChatTargetV1;
  readonly releaseId: string;
  readonly bundleId: string;
  readonly turnId: string;
  readonly attemptId: string;
  /** The database Cost Governor reserves bounded inference before Provider. */
  readonly costReservationId: string;
}

export interface FourCharacterIssuedReceiptV1 {
  readonly status: 'issued_pending_ack';
  readonly subjectId: string;
  readonly threadId: string;
  readonly characterId: FourIndependentChatTargetV1;
  readonly turnId: string;
  readonly attemptId: string;
  readonly assistantMessageId: string;
  readonly deliveryReceiptId: string;
}

export interface FourCharacterProductionExecutionPortsV1 {
  /** Must fetch only the exact active, independently published content Pin. */
  readonly publication: Readonly<{
    readPublishedSource(input: Readonly<{
      /** Canonical Member owner and immutable existing conversation binding. */
      subjectId: string;
      threadId: string;
      characterId: FourIndependentChatTargetV1;
      releaseId: string;
      bundleId: string;
      contentVersion: string;
    }>): Promise<PublishedFourCharacterModelSourceV1 | null>;
  }>;
  readonly transaction: Readonly<{
    /** Atomic Member-owned user receive, idempotency and cost quota reservation. */
    reserveAttempt(input: Readonly<{
      subjectId: string;
      threadId: string;
      clientTurnId: string;
      characterId: FourIndependentChatTargetV1;
      releaseId: string;
      bundleId: string;
      sourceDigest: string;
      userText: string;
    }>): Promise<FourCharacterAtomicReservationV1>;
    /** This DB transaction owns generated/validated persistence, cost
     * settlement and secure receipt issuance. No response reveal is allowed.
     */
    commitValidatedAndIssue(input: Readonly<{
      reservation: FourCharacterAtomicReservationV1;
      source: PublishedFourCharacterModelSourceV1;
      generated: FourCharacterGeneratedDraftV1;
      validated: FourCharacterValidatedReplyV1;
    }>): Promise<FourCharacterIssuedReceiptV1>;
    /** Failure is recorded without exposing Provider text or raw exceptions. */
    failAttempt(input: Readonly<{
      reservation: FourCharacterAtomicReservationV1;
      failureCode: 'CHARACTER_EXECUTION_FAILED';
    }>): Promise<void>;
  }>;
  /** Character-specific Provider; never shared with Se-yeon's Persona provider. */
  readonly provider: Readonly<{
    generate(input: Readonly<{
      turn: TrustedFiveCharacterChatTurnV1;
      source: PublishedFourCharacterModelSourceV1;
      reservation: FourCharacterAtomicReservationV1;
    }>): Promise<FourCharacterGeneratedDraftV1>;
  }>;
  /** Source-aware Persona, claim, privacy and output validation. */
  readonly outputGuard: Readonly<{
    validate(input: Readonly<{
      turn: TrustedFiveCharacterChatTurnV1;
      source: PublishedFourCharacterModelSourceV1;
      generated: FourCharacterGeneratedDraftV1;
    }>): Promise<FourCharacterValidatedReplyV1>;
  }>;
}

export interface FourCharacterProductionExecutionResultV1 {
  readonly disposition: 'committed_pending_delivery';
  readonly characterId: FourIndependentChatTargetV1;
  readonly turnId: string;
  readonly assistantMessageId: string;
  readonly deliveryReceiptId: string;
  /** No assistant text is returned before current-rights reveal and browser ACK. */
}

function requiredText(value: unknown, maxLength = 32768): string {
  if (typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.length > maxLength) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return value;
}

function assertPublishedSource(
  source: PublishedFourCharacterModelSourceV1 | null,
  turn: TrustedFiveCharacterChatTurnV1,
): asserts source is PublishedFourCharacterModelSourceV1 {
  if (source === null ||
      source.status !== 'published' ||
      source.characterId !== turn.characterId ||
      source.releaseId !== turn.pinnedReleaseId ||
      source.bundleId !== turn.pinnedBundleId ||
      source.contentVersion !== turn.bundleManifest.manifest.contentVersion ||
      source.assetManifestHash !== turn.bundleManifest.manifest.assetManifestHash ||
      source.cueSchemaVersion !== turn.bundleManifest.manifest.cueSchemaVersion) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  requiredText(source.bibleSourceRef, 512);
  requiredText(source.runtimeSourceRef, 512);
  requiredText(source.sourceDigest, 256);
  requiredText(source.canonicalContext);
}

function assertReservation(
  reservation: FourCharacterAtomicReservationV1,
  turn: TrustedFiveCharacterChatTurnV1,
): void {
  if (reservation.status !== 'reserved' ||
      reservation.subjectId !== turn.subjectId ||
      reservation.threadId !== turn.threadId ||
      reservation.characterId !== turn.characterId ||
      reservation.releaseId !== turn.pinnedReleaseId ||
      reservation.bundleId !== turn.pinnedBundleId) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  requiredText(reservation.turnId, 256);
  requiredText(reservation.attemptId, 256);
  requiredText(reservation.costReservationId, 256);
}

function assertReceipt(
  receipt: FourCharacterIssuedReceiptV1,
  reservation: FourCharacterAtomicReservationV1,
): void {
  if (receipt.status !== 'issued_pending_ack' ||
      receipt.subjectId !== reservation.subjectId ||
      receipt.threadId !== reservation.threadId ||
      receipt.characterId !== reservation.characterId ||
      receipt.turnId !== reservation.turnId ||
      receipt.attemptId !== reservation.attemptId) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  requiredText(receipt.assistantMessageId, 256);
  requiredText(receipt.deliveryReceiptId, 256);
}

export function createFourCharacterProductionChatExecutorV1(
  characterId: FourIndependentChatTargetV1,
  ports: FourCharacterProductionExecutionPortsV1,
): FiveCharacterChatTurnExecutorV1<FourCharacterProductionExecutionResultV1> {
  if (!FOUR_INDEPENDENT_CHAT_TARGETS_V1.some(id => id === characterId)) {
    throw new FourCharacterProductionExecutionHeldV1();
  }
  return async turn => {
    // Recheck against the trusted gateway; never infer target from prompt text.
    if (turn.characterId !== characterId ||
        turn.threadBinding.threadId !== turn.threadId ||
        turn.threadBinding.activeContentReleaseId !== turn.pinnedReleaseId ||
        turn.threadBinding.activeContentBundleId !== turn.pinnedBundleId ||
        turn.threadBinding.participantCharacterIds.length !== 1 ||
        turn.threadBinding.participantCharacterIds[0] !== characterId ||
        turn.bundleManifest.contentBundleId !== turn.pinnedBundleId ||
        !turn.bundleManifest.manifest.characterIds.includes(characterId)) {
      throw new FourCharacterProductionExecutionHeldV1();
    }
    requiredText(turn.text, 8000);
    const source = await ports.publication.readPublishedSource({
      subjectId: turn.subjectId,
      threadId: turn.threadId,
      characterId,
      releaseId: turn.pinnedReleaseId,
      bundleId: turn.pinnedBundleId,
      contentVersion: turn.bundleManifest.manifest.contentVersion,
    });
    assertPublishedSource(source, turn);

    // No AI Provider call before DB-backed Member receive and cost reservation.
    const reservation = await ports.transaction.reserveAttempt({
      subjectId: turn.subjectId,
      threadId: turn.threadId,
      clientTurnId: turn.clientTurnId,
      characterId,
      releaseId: source.releaseId,
      bundleId: source.bundleId,
      sourceDigest: source.sourceDigest,
      userText: turn.text,
    });
    assertReservation(reservation, turn);
    try {
      const generated = await ports.provider.generate({ turn, source, reservation });
      if (generated.characterId !== characterId) {
        throw new FourCharacterProductionExecutionHeldV1();
      }
      requiredText(generated.bodyText, 8000);
      requiredText(generated.providerKey, 256);
      requiredText(generated.modelKey, 256);
      if (!generated.usage ||
          Object.values(generated.usage).some(value =>
            !Number.isSafeInteger(value) || value < 0)) {
        throw new FourCharacterProductionExecutionHeldV1();
      }

      const validated = await ports.outputGuard.validate({
        turn, source, generated,
      });
      if (validated.approved !== true ||
          validated.characterId !== characterId) {
        throw new FourCharacterProductionExecutionHeldV1();
      }
      requiredText(validated.bodyText, 8000);
      requiredText(validated.outputGuardVersion, 256);
      if (!Array.isArray(validated.groundingRefs) ||
          validated.groundingRefs.some(ref =>
            typeof ref !== 'string' || !ref.trim())) {
        throw new FourCharacterProductionExecutionHeldV1();
      }
      const receipt = await ports.transaction.commitValidatedAndIssue({
        reservation, source, generated, validated,
      });
      assertReceipt(receipt, reservation);
      return Object.freeze({
        disposition: 'committed_pending_delivery' as const,
        characterId,
        turnId: receipt.turnId,
        assistantMessageId: receipt.assistantMessageId,
        deliveryReceiptId: receipt.deliveryReceiptId,
      });
    } catch {
      // Neither Provider error details nor generated body may cross the
      // execution boundary. Only a fixed failure code reaches transport.
      // The durable DB implementation must make this idempotent and settle
      // reserved cost even when the Provider or Output Guard rejects.
      try {
        await ports.transaction.failAttempt({
          reservation, failureCode: 'CHARACTER_EXECUTION_FAILED',
        });
      } catch {
        throw new FourCharacterProductionExecutionHeldV1();
      }
      throw new FourCharacterProductionExecutionHeldV1();
    }
  };
}
