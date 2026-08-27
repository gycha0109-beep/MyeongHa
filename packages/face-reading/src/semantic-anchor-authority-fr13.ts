import type {
  FaceAuthorityRegistry,
  FaceMethodologyPackDefinition,
} from './contracts.js';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_FR12,
  FACE_RESEARCH_PACK_FR12,
} from './twelve-palaces-authority-fr12.js';
import {
  FR13_ANCHOR_CONFLICTS,
  FR13_ANCHOR_SOURCE_PASSAGES,
  TRADITIONAL_FACE_ANCHORS_FR13,
  validateTraditionalFaceAnchorRegistryFR13,
  type TraditionalFaceAnchorDefinitionV1,
} from './semantic-anchor-registry-fr13.js';
import { FaceAuthorityValidationError } from './validation.js';

export interface FaceSemanticAnchorRegistrySnapshotFR13 {
  readonly registryId: string;
  readonly version: string;
  readonly authorityState: 'research_only';
  readonly definitions: readonly TraditionalFaceAnchorDefinitionV1[];
}

export interface FaceMethodologyPackWithSemanticAnchorPinFR13
  extends FaceMethodologyPackDefinition {
  readonly semanticAnchorRegistryRef: string;
}

export const FACE_SEMANTIC_ANCHOR_REGISTRY_FR13: FaceSemanticAnchorRegistrySnapshotFR13 = Object.freeze({
  registryId: 'anchors.face.research_fr13',
  version: '0.1.0',
  authorityState: 'research_only' as const,
  definitions: TRADITIONAL_FACE_ANCHORS_FR13,
});

export const FACE_RESEARCH_PACK_FR13: FaceMethodologyPackWithSemanticAnchorPinFR13 = {
  ...FACE_RESEARCH_PACK_FR12,
  version: '0.4.0',
  semanticAnchorRegistryRef: `${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.registryId}@${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.version}`,
};

export const FACE_AUTHORITY_RESEARCH_REGISTRY_FR13: FaceAuthorityRegistry = {
  ...FACE_AUTHORITY_RESEARCH_REGISTRY_FR12,
  passages: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_FR12.passages,
    ...FR13_ANCHOR_SOURCE_PASSAGES,
  ],
  conflicts: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_FR12.conflicts,
    ...FR13_ANCHOR_CONFLICTS,
  ],
  methodologyPacks: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_FR12.methodologyPacks,
    FACE_RESEARCH_PACK_FR13,
  ],
};

export function validateFaceSemanticAnchorAuthorityFR13(): void {
  validateTraditionalFaceAnchorRegistryFR13(FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.definitions);
  if (FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.registryId.trim().length === 0) {
    throw new FaceAuthorityValidationError('FR-13 semantic anchor registryId is required.');
  }
  if (FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.version.trim().length === 0) {
    throw new FaceAuthorityValidationError('FR-13 semantic anchor registry version is required.');
  }

  const passageRefs = new Set(
    FACE_AUTHORITY_RESEARCH_REGISTRY_FR13.passages.map((passage) => passage.passageId),
  );
  const conflictRefs = new Set(
    FACE_AUTHORITY_RESEARCH_REGISTRY_FR13.conflicts.map((conflict) => conflict.conflictId),
  );
  for (const anchor of FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.definitions) {
    for (const sourceRef of anchor.sourceRefs) {
      if (!passageRefs.has(sourceRef)) {
        throw new FaceAuthorityValidationError(
          `${anchor.anchorRef} semantic anchor sourceRef is unresolved: ${sourceRef}`,
        );
      }
    }
    for (const conflictRef of anchor.blockingConflictRefs ?? []) {
      if (!conflictRefs.has(conflictRef)) {
        throw new FaceAuthorityValidationError(
          `${anchor.anchorRef} semantic anchor blockingConflictRef is unresolved: ${conflictRef}`,
        );
      }
    }
  }

  const expectedRef = `${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.registryId}@${FACE_SEMANTIC_ANCHOR_REGISTRY_FR13.version}`;
  if (FACE_RESEARCH_PACK_FR13.semanticAnchorRegistryRef !== expectedRef) {
    throw new FaceAuthorityValidationError('FR-13 methodology pack must pin the exact semantic anchor registry version.');
  }
  if (FACE_RESEARCH_PACK_FR13.version !== '0.4.0') {
    throw new FaceAuthorityValidationError('FR-13 methodology pack version must remain 0.4.0.');
  }
}
