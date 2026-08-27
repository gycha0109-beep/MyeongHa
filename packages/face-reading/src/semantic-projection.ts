import type {
  CharacterFaceGrounding,
  FaceClaim,
  ProductFaceReadingSemanticV3,
} from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface FaceGroundingProjectionInput {
  readonly groundingVersion: string;
  readonly reading: ProductFaceReadingSemanticV3;
  readonly claims: readonly FaceClaim[];
}

function claimIndex(claims: readonly FaceClaim[]): ReadonlyMap<string, FaceClaim> {
  const result = new Map<string, FaceClaim>();
  for (const claim of claims) {
    if (result.has(claim.claimRef)) {
      throw new FaceAuthorityValidationError(`Duplicate claimRef: ${claim.claimRef}`);
    }
    result.set(claim.claimRef, claim);
  }
  return result;
}

function semanticClaim(claim: FaceClaim): CharacterFaceGrounding['semanticClaims'][number] {
  return {
    key: claim.semanticKey,
    ...(claim.axis === undefined ? {} : { axis: claim.axis }),
    ...(claim.pattern === undefined ? {} : { pattern: claim.pattern }),
    claimRef: claim.claimRef,
  };
}

export function projectCharacterFaceGrounding(
  input: FaceGroundingProjectionInput,
): CharacterFaceGrounding {
  const byRef = claimIndex(input.claims);
  const requestedRefs = new Set<string>([
    ...input.reading.verdict.claimRefs,
    ...Object.values(input.reading.modules).flatMap((module) => module?.claimRefs ?? []),
    ...input.reading.lenses.flatMap((lens) => lens.claimRefs),
  ]);

  const selected: FaceClaim[] = [];
  for (const ref of requestedRefs) {
    const claim = byRef.get(ref);
    if (claim === undefined) {
      throw new FaceAuthorityValidationError(`Semantic reading references missing claim: ${ref}`);
    }
    selected.push(claim);
  }

  return {
    groundingVersion: input.groundingVersion,
    faceReadingRef: input.reading.readingRef,
    faceEngineVersion: input.reading.engineVersion,
    methodologyPackRef: input.reading.methodologyPackRef,
    semanticClaims: selected.map(semanticClaim),
    unavailableSections: input.reading.unavailableSections,
    prohibitedInferences: input.reading.prohibitedInferences,
  };
}

export function assertNoConsumerProseInSemanticReading(
  value: ProductFaceReadingSemanticV3,
): void {
  const serialized = JSON.stringify(value);
  const forbiddenKeys = ['headline', 'summary', 'paragraph', 'text', 'narrative', 'copy'];
  for (const key of forbiddenKeys) {
    const pattern = new RegExp(`"${key}"\\s*:`, 'iu');
    if (pattern.test(serialized)) {
      throw new FaceAuthorityValidationError(`Semantic face reading contains consumer-prose field: ${key}`);
    }
  }
}
