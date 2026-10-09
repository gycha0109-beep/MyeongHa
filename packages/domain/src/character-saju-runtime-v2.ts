import { resolveCharacterVoiceAuthorityV1 } from '../../character-content/src/index.js';
import { SAJU_DOMAINS, type SajuDomain } from '../../contracts/src/index.js';
import { hashProtectedSajuTextV1, type CharacterRuntimeContextV1, type CharacterSajuRuntimeContextV1, type ProtectedSajuTextRefV1 } from './character-runtime-context.js';
import { admitCharacterSajuGroundingRefV1, type CharacterSajuGroundingRefV1 } from './character-saju-grounding-admission.js';
import type { CharacterSajuOfficialStandardEligibilityV2 } from './character-saju-eligibility-v2.js';

type ProtectedSajuV2 = Omit<CharacterSajuRuntimeContextV1, 'capability'>;
export interface CharacterSajuRuntimeContextV2 extends ProtectedSajuV2 {
  readonly eligibility: CharacterSajuOfficialStandardEligibilityV2;
}
export type CharacterRuntimeContextV2 = Readonly<Omit<CharacterRuntimeContextV1, 'schemaVersion' | 'saju'> & {
  readonly schemaVersion: 'v2';
  readonly saju: CharacterSajuRuntimeContextV2;
}>;
export interface CharacterSajuRuntimeContextWithGroundingV2 extends CharacterSajuRuntimeContextV2 {
  readonly groundingRef: CharacterSajuGroundingRefV1;
}
export type CharacterRuntimeContextWithGroundingV2 = Readonly<Omit<CharacterRuntimeContextV2, 'saju'> & {
  readonly saju: CharacterSajuRuntimeContextWithGroundingV2;
}>;

export class CharacterSajuRuntimeAdmissionErrorV2 extends TypeError {
  constructor() {
    super('Official standard Saju V2 runtime admission failed.');
    this.name = 'CharacterSajuRuntimeAdmissionErrorV2';
  }
}
const officialV2Contexts = new WeakSet<object>();
const officialV2GroundedContexts = new WeakSet<object>();
function deny(): never { throw new CharacterSajuRuntimeAdmissionErrorV2(); }

function assertProtectedText(ref: ProtectedSajuTextRefV1, readingRef: string): void {
  if (typeof ref !== 'object' || ref === null ||
      typeof ref.segmentId !== 'string' || !ref.segmentId.trim() ||
      typeof ref.sourceRef !== 'string' || !ref.sourceRef.trim() ||
      ref.sourceReadingRef !== readingRef ||
      typeof ref.text !== 'string' || !ref.text.trim() ||
      ref.contentHash !== hashProtectedSajuTextV1(ref.text)) deny();
}

/**
 * Domain assembly is internal, NOT a grant or a public admission endpoint.
 * The API bridge must consume the A3-alpha server-issued WeakMap proof first.
 * There is no invented CharacterCapabilityContent for a non-specialist Reader.
 */
export function assembleCharacterRuntimeContextFromOfficialStandardV2(input: {
  readonly baseContext: CharacterRuntimeContextV1;
  readonly saju: ProtectedSajuV2;
  readonly eligibility: CharacterSajuOfficialStandardEligibilityV2;
}): CharacterRuntimeContextV2 {
  const { baseContext, saju, eligibility } = input;
  if (!baseContext || baseContext.saju !== null ||
      !saju || Object.prototype.hasOwnProperty.call(saju, 'capability') ||
      Object.prototype.hasOwnProperty.call(saju, 'eligibility') ||
      !eligibility || eligibility.source !== 'official_standard_product_rule' ||
      eligibility.readerCharacterId !== baseContext.characterId ||
      eligibility.readerContentBundleId !== baseContext.contentBundleId ||
      eligibility.readingRef !== saju.readingRef ||
      eligibility.admittedDomain !== saju.domain ||
      !SAJU_DOMAINS.includes(saju.domain as SajuDomain) ||
      ![eligibility.subjectId, eligibility.threadId, eligibility.contentReleaseId,
        eligibility.productId, eligibility.policyRevision,
        eligibility.officialArtifactResponseHash].every((v) => typeof v === 'string' && !!v.trim()) ||
      !['complete', 'partial', 'insufficient'].includes(saju.coverageState) ||
      !Array.isArray(saju.protectedSegments) || !Array.isArray(saju.disclosures) ||
      !Array.isArray(saju.ambiguity) ||
      saju.ambiguity.some((v) => typeof v !== 'string') ||
      (saju.coverageState === 'insufficient' &&
        (saju.protectedSegments.length !== 0 || saju.disclosures.length !== 0))) deny();

  for (const ref of [...saju.protectedSegments, ...saju.disclosures]) {
    assertProtectedText(ref, saju.readingRef);
  }
  const voiceAuthority = Object.freeze(resolveCharacterVoiceAuthorityV1({
    characterId: baseContext.characterId,
    contentVersion: baseContext.contentVersion,
    speech: baseContext.speech,
    persona: baseContext.persona,
  }, 'saju_product'));
  const context: CharacterRuntimeContextV2 = Object.freeze({
    ...baseContext, schemaVersion: 'v2' as const, voiceAuthority,
    saju: Object.freeze({
      readingRef: saju.readingRef,
      domain: saju.domain,
      coverageState: saju.coverageState,
      protectedSegments: Object.freeze(saju.protectedSegments.map((v) => Object.freeze({ ...v }))),
      disclosures: Object.freeze(saju.disclosures.map((v) => Object.freeze({ ...v }))),
      ambiguity: Object.freeze([...saju.ambiguity]),
      eligibility: Object.freeze({ ...eligibility }),
    }),
  });
  officialV2Contexts.add(context);
  return context;
}

export function admitCharacterRuntimeSajuGroundingV2(input: {
  readonly context: CharacterRuntimeContextV2;
  readonly groundingRef: unknown;
}): CharacterRuntimeContextWithGroundingV2 {
  if (!officialV2Contexts.has(input.context)) return deny();
  const groundingRef = admitCharacterSajuGroundingRefV1({
    candidate: input.groundingRef,
    expectedReadingRef: input.context.saju.readingRef,
    expectedDomain: input.context.saju.domain,
  });
  const grounded: CharacterRuntimeContextWithGroundingV2 = Object.freeze({
    ...input.context,
    saju: Object.freeze({ ...input.context.saju, groundingRef }),
  });
  officialV2GroundedContexts.add(grounded);
  return grounded;
}

/** Structural clones, wrong Reading/Domain, and manually injected V2 contexts fail closed. */
export function assertCharacterRuntimeSajuGroundingV2(input: {
  readonly context: CharacterRuntimeContextWithGroundingV2;
  readonly requestedDomain: SajuDomain;
}): CharacterSajuGroundingRefV1 {
  const { context, requestedDomain } = input;
  if (!context || !officialV2GroundedContexts.has(context) ||
      context.schemaVersion !== 'v2' ||
      context.saju.eligibility.source !== 'official_standard_product_rule' ||
      context.saju.eligibility.admittedDomain !== requestedDomain ||
      context.saju.eligibility.readingRef !== context.saju.readingRef ||
      context.saju.eligibility.readerCharacterId !== context.characterId ||
      context.saju.eligibility.readerContentBundleId !== context.contentBundleId ||
      context.saju.domain !== requestedDomain ||
      context.saju.groundingRef.readingRef !== context.saju.readingRef ||
      context.saju.groundingRef.readingDomain !== requestedDomain) deny();
  return context.saju.groundingRef;
}
