import type { CharacterRuntimeContextV1 } from '../../../packages/domain/src/character-runtime-context.js';
import { assembleCharacterRuntimeContextFromOfficialStandardV2, type CharacterRuntimeContextV2 } from '../../../packages/domain/src/character-saju-runtime-v2.js';
import type { CharacterSajuOfficialStandardEligibilityV2 } from '../../../packages/domain/src/character-saju-eligibility-v2.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';
import type { OfficialReadingReaderAdmissionScopeV1 } from './official-reading-reader-admission-v1.js';
import { consumeCharacterSajuOfficialStandardEligibilityV2 } from './character-saju-official-eligibility-v2.js';
import { projectOfficialStandardReadingToProtectedCharacterSajuContextV1 } from './character-standard-reading-protected-context.js';

/**
 * Server-only A3-beta bridge; still dormant, no public Reader/Chat activation.
 * The currentScope must be freshly re-resolved from server authority.
 */
export function assembleOfficialStandardReaderRuntimeV2(input: {
  readonly proof: CharacterSajuOfficialStandardEligibilityV2;
  readonly currentScope: OfficialReadingReaderAdmissionScopeV1;
  readonly source: CharacterStandardReadingKnowledgeSourceV1;
  readonly baseContext: CharacterRuntimeContextV1;
}): CharacterRuntimeContextV2 {
  const { source, currentScope, proof, baseContext } = input;
  if (source.subjectId !== currentScope.subjectId ||
      source.readingId !== currentScope.readingId ||
      source.readerCharacterId !== currentScope.readerCharacterId ||
      source.readerContentBundleId !== currentScope.readerContentBundleId ||
      source.productId !== currentScope.productId ||
      source.productSpecVersion !== currentScope.productSpecVersion ||
      source.sajuDomain !== currentScope.sajuDomain ||
      source.readingContractVersion !== currentScope.readingContractVersion ||
      source.responseHash !== currentScope.officialArtifactResponseHash ||
      baseContext.characterId !== currentScope.readerCharacterId ||
      baseContext.contentBundleId !== currentScope.readerContentBundleId ||
      baseContext.saju !== null) {
    throw new TypeError('A3-beta Official Reader runtime source/scope mismatch.');
  }
  const saju = projectOfficialStandardReadingToProtectedCharacterSajuContextV1(source);
  consumeCharacterSajuOfficialStandardEligibilityV2({ proof, currentScope });
  return assembleCharacterRuntimeContextFromOfficialStandardV2({
    baseContext, saju, eligibility: proof,
  });
}
