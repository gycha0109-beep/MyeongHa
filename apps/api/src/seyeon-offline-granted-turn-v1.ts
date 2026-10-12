import type {
  SeyeonExactModelPersonalSourceSelectionV1,
} from './seyeon-exact-model-personal-source-selection-v1.js';

/**
 * OFFLINE-ONLY positive Grant orchestration contract.
 *
 * The current production chat path remains zero-personal-only. The injected
 * authority MUST implement a real durable pre-model Pin, same-transaction
 * current-Grant Commit, and serialized current-Grant Reveal before this can
 * ever be wired to a public route. A successful unit test is not DB authority.
 */
export const SEYEON_OFFLINE_GRANTED_TURN_VERSION_V1 =
  'seyeon-offline-granted-turn-v1' as const;

const SHA = /^sha256:v1:[a-f0-9]{64}$/u;

type Identity = Readonly<{
  subjectId: string;
  threadId: string;
  turnId: string;
  attemptId: string;
  characterId: 'seyeon';
}>;

export interface SeyeonOfflineGrantedTurnPinV1 {
  readonly attemptId: string;
  readonly selectedSourcesDigest: string;
  readonly pinRef: string;
}

export interface SeyeonOfflineGrantedTurnCommitV1 {
  readonly attemptId: string;
  readonly pinRef: string;
  readonly commitRef: string;
}

export interface SeyeonOfflineGrantedTurnAuthorityV1 {
  /**
   * Must atomically persist the exact, immutable selection BEFORE any model
   * dispatch; a mere checksum returned by the app does not confer authority.
   */
  pinBeforeModel(input: Readonly<{
    identity: Identity;
    selection: SeyeonExactModelPersonalSourceSelectionV1;
  }>): Promise<SeyeonOfflineGrantedTurnPinV1>;
  /**
   * Must lock and recheck the exact original Record/Grant/digests in the SAME
   * database transaction that commits the assistant turn. New Grant IDs may
   * not authorize a former attempt.
   */
  commitWithGrantRecheck(input: Readonly<{
    identity: Identity;
    pin: SeyeonOfflineGrantedTurnPinV1;
    generatedText: string;
  }>): Promise<SeyeonOfflineGrantedTurnCommitV1>;
  /**
   * Must load the committed text and recheck CURRENT original Grant rights
   * at the owner-approved Reveal linearization point. No streaming.
   * Null means HOLD; never return unauthorized text.
   */
  revealCommitted(input: Readonly<{
    identity: Identity;
    commit: SeyeonOfflineGrantedTurnCommitV1;
  }>): Promise<string | null>;
  /**
   * Replay accepts only identifiers: load original pinned sources and check
   * current rights AT REVEAL. Never trust a client-provided historical proof.
   */
  replayWithCurrentGrantRecheck(input: Readonly<{
    subjectId: string;
    threadId: string;
    turnId: string;
    characterId: 'seyeon';
  }>): Promise<string | null>;
}

export type SeyeonOfflineGrantedTurnResultV1 =
  | Readonly<{ state: 'revealed'; text: string }>
  | Readonly<{ state: 'held'; text?: never }>;

const HELD = Object.freeze({ state: 'held' as const });

function validText(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 8000 && value.trim() === value;
}

function validIdentity(value: Identity): boolean {
  return value !== null && typeof value === 'object' &&
    validText(value.subjectId) && validText(value.threadId) &&
    validText(value.turnId) && validText(value.attemptId) &&
    value.characterId === 'seyeon';
}

function validSelection(
  s: SeyeonExactModelPersonalSourceSelectionV1,
): boolean {
  if (!s || s.version !== 'seyeon-exact-model-personal-source-selection-v1' ||
      s.persistedBeforeModel !== false || s.permitsAtomicCommit !== false ||
      s.permitsHttpReveal !== false ||
      !SHA.test(s.selectedSourcesDigest) ||
      !Array.isArray(s.selectedSources) ||
      !Number.isSafeInteger(s.selectedPersonalRecordCount) ||
      s.selectedPersonalRecordCount <= 0 ||
      s.selectedPersonalRecordCount !== s.selectedSources.length) {
    return false;
  }
  const seen = new Set<string>();
  for (const source of s.selectedSources) {
    if (!source || (source.recordKind !== 'memory' && source.recordKind !== 'life_fact') ||
        !validText(source.recordId) || !validText(source.grantId) ||
        !validText(source.recordType) || !validText(source.schemaVersion) ||
        !SHA.test(source.rawRecordDigest) ||
        !SHA.test(source.projectedMemoryDigest)) return false;
    const key = source.recordKind + ':' + source.recordId;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function validPin(
  pin: SeyeonOfflineGrantedTurnPinV1,
  identity: Identity,
  selection: SeyeonExactModelPersonalSourceSelectionV1,
): boolean {
  return pin !== null && typeof pin === 'object' &&
    pin.attemptId === identity.attemptId &&
    pin.selectedSourcesDigest === selection.selectedSourcesDigest &&
    validText(pin.pinRef);
}

function validCommit(
  commit: SeyeonOfflineGrantedTurnCommitV1,
  identity: Identity,
  pin: SeyeonOfflineGrantedTurnPinV1,
): boolean {
  return commit !== null && typeof commit === 'object' &&
    commit.attemptId === identity.attemptId &&
    commit.pinRef === pin.pinRef && validText(commit.commitRef);
}

/**
 * Synthetic-offline integration seam; the model callback is supplied only by
 * a test runner. Production native providers must NOT be passed here.
 * Every failure, including an unavailable authority, returns no content.
 */
export async function runSeyeonOfflineGrantedTurnV1(input: Readonly<{
  identity: Identity;
  selection: SeyeonExactModelPersonalSourceSelectionV1;
  authority: SeyeonOfflineGrantedTurnAuthorityV1;
  generateSyntheticText: () => Promise<string>;
}>): Promise<SeyeonOfflineGrantedTurnResultV1> {
  if (!validIdentity(input.identity) || !validSelection(input.selection)) {
    return HELD;
  }
  try {
    const pin = await input.authority.pinBeforeModel({
      identity: input.identity,
      selection: input.selection,
    });
    if (!validPin(pin, input.identity, input.selection)) return HELD;
    const generatedText = await input.generateSyntheticText();
    if (!validText(generatedText)) return HELD;
    const commit = await input.authority.commitWithGrantRecheck({
      identity: input.identity,
      pin,
      generatedText,
    });
    if (!validCommit(commit, input.identity, pin)) return HELD;
    const revealed = await input.authority.revealCommitted({
      identity: input.identity,
      commit,
    });
    return validText(revealed)
      ? Object.freeze({ state: 'revealed' as const, text: revealed })
      : HELD;
  } catch {
    // Do not leak model text, record IDs, or SQL errors to clients/logs.
    return HELD;
  }
}

export async function replaySeyeonOfflineGrantedTurnV1(input: Readonly<{
  subjectId: string;
  threadId: string;
  turnId: string;
  authority: Pick<SeyeonOfflineGrantedTurnAuthorityV1, 'replayWithCurrentGrantRecheck'>;
}>): Promise<SeyeonOfflineGrantedTurnResultV1> {
  if (!validText(input.subjectId) || !validText(input.threadId) ||
      !validText(input.turnId)) return HELD;
  try {
    const revealed = await input.authority.replayWithCurrentGrantRecheck({
      subjectId: input.subjectId,
      threadId: input.threadId,
      turnId: input.turnId,
      characterId: 'seyeon',
    });
    return validText(revealed)
      ? Object.freeze({ state: 'revealed' as const, text: revealed })
      : HELD;
  } catch {
    return HELD;
  }
}
