import type {
  CharacterRuntimeContextAssemblyInputV1,
} from './character-chat-orchestration.js';
import {
  assembleCharacterRuntimeContextFromServerAuthorizedSajuV1,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/character-runtime-context.js';
import {
  resolveCharacterStandardReadingKnowledgeV1,
  type CharacterStandardReadingAccessAuthorityPortV1,
  type CharacterStandardReadingArtifactAuthorityPortV1,
  type CharacterStandardReadingKnowledgeSourceV1,
} from './character-standard-reading-knowledge.js';
import {
  projectOfficialStandardReadingToProtectedCharacterSajuContextV1,
} from './character-standard-reading-protected-context.js';
import type {
  OfficialReaderPrivateCurrentPurchaseAuthorityPortV1,
} from './official-reader-private-exact-verified-purchase-guard-v1.js';

export type CharacterStandardReadingChatBaseContextInputV1 = Omit<
  CharacterRuntimeContextAssemblyInputV1,
  'saju'
>;

export interface PrepareCharacterStandardReadingChatContextInputV1 {
  readonly resolvedSubjectId?: string;
  readonly readerCharacterId: unknown;
  readonly readingId: unknown;
  readonly effectiveAt: unknown;
  readonly accessAuthorityPort: CharacterStandardReadingAccessAuthorityPortV1;
  readonly artifactAuthorityPort: CharacterStandardReadingArtifactAuthorityPortV1;
  readonly contextInput: CharacterStandardReadingChatBaseContextInputV1;
  /** Private S1-locked Commerce Receipt/Grant check; no fallback. */
  readonly currentVerifiedPurchaseAuthorityPort?:
    OfficialReaderPrivateCurrentPurchaseAuthorityPortV1;
}

export interface CharacterStandardReadingChatContextPlanV1 {
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly contextInput: CharacterRuntimeContextAssemblyInputV1;
}

export class CharacterStandardReadingChatContextErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingChatContextErrorV1';
  }
}

type PrivateReaderContextPlanRecordV1 = {
  readonly authorityPort: OfficialReaderPrivateCurrentPurchaseAuthorityPortV1;
  readonly scope: Readonly<{
    subjectId: string;
    readingId: string;
    readerCharacterId: string;
    readerContentBundleId: string;
  }>;
  used: boolean;
};
const preparedOfficialReadingChatPlansV1 =
  new WeakMap<object, PrivateReaderContextPlanRecordV1>();

function verifiedPurchaseScope(input: Readonly<{
  resolvedSubjectId?: string;
  readingId: unknown;
  readerCharacterId: unknown;
  contentBundleId: unknown;
}>): PrivateReaderContextPlanRecordV1['scope'] {
  if (typeof input.resolvedSubjectId !== 'string'
      || input.resolvedSubjectId.trim().length === 0
      || typeof input.readingId !== 'string' || input.readingId.trim().length === 0
      || typeof input.readerCharacterId !== 'string'
      || input.readerCharacterId.trim().length === 0
      || typeof input.contentBundleId !== 'string'
      || input.contentBundleId.trim().length === 0) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reader protected context requires an exact canonical purchase scope.',
    );
  }
  return Object.freeze({
    subjectId: input.resolvedSubjectId,
    readingId: input.readingId,
    readerCharacterId: input.readerCharacterId,
    readerContentBundleId: input.contentBundleId,
  });
}

async function assertCurrentPaidContext(
  authorityPort: OfficialReaderPrivateCurrentPurchaseAuthorityPortV1 | undefined,
  scope: PrivateReaderContextPlanRecordV1['scope'],
): Promise<void> {
  if (!authorityPort || typeof authorityPort.assertCurrentVerifiedPurchase !== 'function') {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reader current verified purchase authority is missing.',
    );
  }
  try {
    await authorityPort.assertCurrentVerifiedPurchase(scope);
  } catch {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reader current verified purchase is unavailable.',
    );
  }
}

function assertNoCallerSajuContext(
  input: CharacterStandardReadingChatBaseContextInputV1,
): void {
  if (Object.prototype.hasOwnProperty.call(input, 'saju')) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading Chat context does not accept caller-supplied Saju context.',
    );
  }
}

/**
 * Server-only composition boundary for Reader follow-up Chat.
 *
 * The caller supplies current server-resolved Subject / Reader / Reading identities
 * plus non-Saju Character context. Reader access and the raw Official Reading are
 * independently re-resolved from server authority, then the exact Official Reading
 * is projected through the protected Character Saju seam.
 *
 * This function deliberately returns a context-assembly input rather than bypassing
 * the existing Production Saju execution gate. Public Chat activation remains a
 * separate authority decision.
 */
export async function prepareCharacterStandardReadingChatContextV1(
  input: PrepareCharacterStandardReadingChatContextInputV1,
): Promise<CharacterStandardReadingChatContextPlanV1> {
  assertNoCallerSajuContext(input.contextInput);
  const purchaseScope = verifiedPurchaseScope({
    ...(input.resolvedSubjectId === undefined
      ? {} : { resolvedSubjectId: input.resolvedSubjectId }),
    readingId: input.readingId,
    readerCharacterId: input.readerCharacterId,
    contentBundleId: input.contextInput.contentBundleId,
  });
  // Resolve no protected Saju source under a historical Grant whose
  // verified PortOne Receipt has already been cancelled. This also blocks
  // a same-Reading sibling purchase pinned to a DIFFERENT Reader Bundle.
  await assertCurrentPaidContext(
    input.currentVerifiedPurchaseAuthorityPort,
    purchaseScope,
  );

  const source = await resolveCharacterStandardReadingKnowledgeV1({
    ...(input.resolvedSubjectId === undefined
      ? {}
      : { resolvedSubjectId: input.resolvedSubjectId }),
    readerCharacterId: input.readerCharacterId,
    readingId: input.readingId,
    effectiveAt: input.effectiveAt,
    accessAuthorityPort: input.accessAuthorityPort,
    artifactAuthorityPort: input.artifactAuthorityPort,
  });

  if (input.contextInput.character.characterId !== source.readerCharacterId) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading Reader does not match the active Character context.',
    );
  }
  if (input.contextInput.contentBundleId !== source.readerContentBundleId) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading Reader content bundle does not match the active Character context.',
    );
  }

  if (
    !input.contextInput.character.capabilities.some(
      (capability) => capability.domain === source.sajuDomain,
    )
  ) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Active Character content does not authorize the Official Reading domain.',
    );
  }

  if (source.subjectId !== purchaseScope.subjectId
      || source.readingId !== purchaseScope.readingId
      || source.readerCharacterId !== purchaseScope.readerCharacterId
      || source.readerContentBundleId !== purchaseScope.readerContentBundleId) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading source and verified purchase scope differ.',
    );
  }
  await assertCurrentPaidContext(input.currentVerifiedPurchaseAuthorityPort,purchaseScope);
  const saju =
    projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source);

  const plan = Object.freeze({
    source,
    contextInput: Object.freeze({
      ...input.contextInput,
      saju,
    }),
  });

  preparedOfficialReadingChatPlansV1.set(plan, {
    authorityPort: input.currentVerifiedPurchaseAuthorityPort!,
    scope: purchaseScope,
    used: false,
  });
  return plan;
}

/**
 * Production-safe assembly seam for a plan minted by the server-only Official
 * Reading authority composer above. Structural lookalikes are rejected.
 *
 * This does not expose a public Chat send route; it only proves that Production
 * runtime assembly can consume the exact server-retrieved protected Reading
 * without weakening the direct Saju injection guard.
 */
export async function assemblePreparedCharacterStandardReadingRuntimeContextV1(
  plan: CharacterStandardReadingChatContextPlanV1,
): Promise<CharacterRuntimeContextV1> {
  const record = preparedOfficialReadingChatPlansV1.get(plan);
  if (!record || record.used) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading runtime context plan was not minted by server authority.',
    );
  }

  // Consume before the awaited fresh S1 check: an old plan cannot be
  // replayed after refund or reused in another turn to re-inject text.
  record.used = true;
  await assertCurrentPaidContext(record.authorityPort,record.scope);
  const saju = plan.contextInput.saju;
  if (
    saju === undefined ||
    saju.readingRef !== plan.source.readingId ||
    saju.domain !== plan.source.sajuDomain ||
    plan.contextInput.character.characterId !== plan.source.readerCharacterId ||
    plan.source.subjectId !== record.scope.subjectId ||
    plan.source.readingId !== record.scope.readingId ||
    plan.source.readerCharacterId !== record.scope.readerCharacterId ||
    plan.source.readerContentBundleId !== record.scope.readerContentBundleId ||
    plan.contextInput.contentBundleId !== record.scope.readerContentBundleId
  ) {
    throw new CharacterStandardReadingChatContextErrorV1(
      'Official Reading runtime context plan provenance is inconsistent.',
    );
  }

  return assembleCharacterRuntimeContextFromServerAuthorizedSajuV1(
    plan.contextInput,
  );
}
