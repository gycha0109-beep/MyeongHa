import type {
  ComparisonMode,
  FaceAuthorityConflictDefinition,
  FaceAuthorityRegistry,
  FaceClaim,
  FaceComparisonPolicy,
  FaceDefinitionLateralityContractV1,
  FaceLateralityInputSensitivityV1,
  FaceMethodologyPackDefinition,
  FaceObservationState,
  FacePairSwapInvariantOperationDefinitionV1,
  FacePairSwapInvariantTransformV1,
  FaceRuleDefinition,
  MyeongHaStaticFaceObservation,
  ReviewStatus,
  SharedFaceObservationBundleV3,
  SourcePassage,
} from './contracts.js';
import { LATERALITY_CONSUMPTION_POLICY_FR20 } from './laterality-consumption-policy-fr20.js';

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const FR21A_CONTRACT_KEYS = new Set(['schemaVersion', 'outputRequirement', 'inputs', 'pairOperationRef']);
const FR21A_INPUT_KEYS = new Set(['inputRef', 'sensitivity', 'consumerSlotRefs']);
const FR21A_PAIR_OPERATION_KEYS = new Set(['operationRef', 'pairGroupRef', 'reviewState', 'transform', 'formulaSpec', 'evidenceRefs']);
const FR21A_PAIR_TRANSFORM_KEYS = new Set(['kind', 'inputRefs']);
const FR21A_OUTPUT_REQUIREMENTS = new Set(['side_invariant', 'pair_swap_invariant', 'anatomical_side']);
const FR21A_INPUT_SENSITIVITIES = new Set(['side_invariant', 'image_side_only', 'pair_swap_invariant', 'anatomical_side']);
const FR21A_PAIR_TRANSFORMS = new Set(['absolute_difference', 'unordered_mean', 'unordered_min_max_span']);

export class FaceAuthorityValidationError extends Error {
  override readonly name = 'FaceAuthorityValidationError';
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
}

function stableKey(value: string, path: string): void {
  nonEmpty(value, path);
  if (!STABLE_KEY.test(value)) throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new FaceAuthorityValidationError(`${path} contains duplicate key: ${value}`);
    seen.add(value);
  }
}

function exactKeys(value: object, allowed: ReadonlySet<string>, path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new FaceAuthorityValidationError(`${path} contains unauthorized field: ${unexpected}`);
}

function assertRef(set: ReadonlySet<string>, value: string, path: string): void {
  if (!set.has(value)) throw new FaceAuthorityValidationError(`${path} references unknown key: ${value}`);
}

function sameStringSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  return [...actual].sort().join('|') === [...expected].sort().join('|');
}

function normalizeFormula(value: string): string {
  return value.replace(/\s+/gu, '');
}

function canonicalPairFormula(transform: FacePairSwapInvariantTransformV1): string {
  const [left, right] = transform.inputRefs;
  switch (transform.kind) {
    case 'absolute_difference': return `abs(${left}-${right})`;
    case 'unordered_mean': return `mean_unordered(${left},${right})`;
    case 'unordered_min_max_span': return `span_unordered(${left},${right})`;
  }
}

function passageStatusRank(status: SourcePassage['verificationStatus']): number {
  switch (status) {
    case 'unverified_ocr': return 0;
    case 'scan_checked': return 1;
    case 'double_checked': return 2;
  }
}

function validateReviewedSourceGate(
  authorityKey: string,
  status: ReviewStatus,
  sourceRefs: readonly string[],
  passages: ReadonlyMap<string, SourcePassage>,
): void {
  if (status === 'research') return;
  if (sourceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`${authorityKey} reviewed authority requires sourceRefs.`);
  }
  for (const ref of sourceRefs) {
    const passage = passages.get(ref);
    if (passage === undefined) {
      throw new FaceAuthorityValidationError(`${authorityKey} sourceRef must resolve to a passage: ${ref}`);
    }
    if (passageStatusRank(passage.verificationStatus) < passageStatusRank('scan_checked')) {
      throw new FaceAuthorityValidationError(`${authorityKey} ${status} authority requires scan_checked source passage: ${ref}`);
    }
  }
}

function assertProductionDependency(
  authorityKey: string,
  status: ReviewStatus,
  dependencyLabel: string,
  dependencyStatus: ReviewStatus | undefined,
): void {
  if (status !== 'production_authorized') return;
  if (dependencyStatus !== 'production_authorized') {
    throw new FaceAuthorityValidationError(
      `${authorityKey} cannot be production_authorized while ${dependencyLabel} status=${dependencyStatus ?? 'missing'}.`,
    );
  }
}

function validateRulePromotion(
  rule: FaceRuleDefinition,
  passages: ReadonlyMap<string, SourcePassage>,
  conflicts: readonly FaceAuthorityConflictDefinition[],
  methodologyStatuses: ReadonlyMap<string, ReviewStatus>,
  metricStatuses: ReadonlyMap<string, ReviewStatus>,
  operationalizationStatuses: ReadonlyMap<string, ReviewStatus>,
): void {
  validateReviewedSourceGate(rule.ruleId, rule.promotionStatus, rule.sourceRefs, passages);
  if (rule.promotionStatus !== 'production_authorized') return;

  assertProductionDependency(
    rule.ruleId,
    rule.promotionStatus,
    `methodology ${rule.methodologyRef}`,
    methodologyStatuses.get(rule.methodologyRef),
  );

  for (const input of rule.inputs) {
    if (input.sourceType === 'metric') {
      assertProductionDependency(rule.ruleId, rule.promotionStatus, `metric ${input.ref}`, metricStatuses.get(input.ref));
    }
    if (input.sourceType === 'operationalization') {
      assertProductionDependency(
        rule.ruleId,
        rule.promotionStatus,
        `operationalization ${input.ref}`,
        operationalizationStatuses.get(input.ref),
      );
    }
  }

  const blockingConflict = conflicts.find(
    (conflict) =>
      conflict.status === 'open' &&
      conflict.methodologyRefs.includes(rule.methodologyRef) &&
      conflict.affectedTiers.includes(rule.tier),
  );
  if (blockingConflict !== undefined) {
    throw new FaceAuthorityValidationError(
      `${rule.ruleId} production promotion blocked by unresolved authority conflict: ${blockingConflict.conflictId}`,
    );
  }
}

function validateMethodologyPack(
  pack: FaceMethodologyPackDefinition,
  comparisonPolicyIds: ReadonlySet<string>,
  regionMapIds: ReadonlySet<string>,
  methodologyIds: ReadonlySet<string>,
): void {
  stableKey(pack.packId, 'methodologyPack.packId');
  nonEmpty(pack.version, `${pack.packId}.version`);
  assertRef(comparisonPolicyIds, pack.comparisonPolicyRef, `${pack.packId}.comparisonPolicyRef`);
  for (const ref of pack.methodologyDefinitionRefs) assertRef(methodologyIds, ref, `${pack.packId}.methodologyDefinitionRefs`);
  for (const ref of pack.regionMapRefs) assertRef(regionMapIds, ref, `${pack.packId}.regionMapRefs`);
  if (!pack.forbiddenObservationInputs.includes('observations.colorAppearance')) {
    throw new FaceAuthorityValidationError(`${pack.packId} must forbid observations.colorAppearance for static v1.`);
  }
}

export function validateFacePairSwapInvariantOperationFR21A(
  operation: FacePairSwapInvariantOperationDefinitionV1,
): FacePairSwapInvariantOperationDefinitionV1 {
  exactKeys(operation, FR21A_PAIR_OPERATION_KEYS, `FR-21A pair operation ${operation.operationRef}`);
  stableKey(operation.operationRef, 'fr21a.operationRef');
  stableKey(operation.pairGroupRef, `fr21a.${operation.operationRef}.pairGroupRef`);
  if (operation.reviewState !== 'research_candidate' && operation.reviewState !== 'reviewed') {
    throw new FaceAuthorityValidationError(`FR-21A pair operation has unknown reviewState: ${String(operation.reviewState)}`);
  }
  exactKeys(operation.transform, FR21A_PAIR_TRANSFORM_KEYS, `FR-21A pair operation ${operation.operationRef}.transform`);
  if (!FR21A_PAIR_TRANSFORMS.has(operation.transform.kind)) {
    throw new FaceAuthorityValidationError(`FR-21A pair operation has unauthorized transform kind: ${String(operation.transform.kind)}`);
  }
  if (!Array.isArray(operation.transform.inputRefs) || operation.transform.inputRefs.length !== 2) {
    throw new FaceAuthorityValidationError(`FR-21A pair operation requires exactly two transform inputs: ${operation.operationRef}`);
  }
  const [first, second] = operation.transform.inputRefs;
  nonEmpty(first, `fr21a.${operation.operationRef}.transform.inputRefs[0]`);
  nonEmpty(second, `fr21a.${operation.operationRef}.transform.inputRefs[1]`);
  if (first === second) throw new FaceAuthorityValidationError(`FR-21A pair operation inputs must be distinct: ${operation.operationRef}`);

  const pairGroup = LATERALITY_CONSUMPTION_POLICY_FR20.pairGroups.find((group) => group.pairGroupRef === operation.pairGroupRef);
  if (pairGroup === undefined) {
    throw new FaceAuthorityValidationError(`FR-21A pair operation references unknown FR-20 pair group: ${operation.pairGroupRef}`);
  }

  nonEmpty(operation.formulaSpec, `fr21a.${operation.operationRef}.formulaSpec`);
  const canonical = canonicalPairFormula(operation.transform);
  if (normalizeFormula(operation.formulaSpec) !== normalizeFormula(canonical)) {
    throw new FaceAuthorityValidationError(
      `FR-21A pair operation formula does not match its structurally swap-invariant transform: ${operation.operationRef}`,
    );
  }
  if (operation.evidenceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`FR-21A pair operation requires evidenceRefs: ${operation.operationRef}`);
  }
  unique(operation.evidenceRefs, `fr21a.${operation.operationRef}.evidenceRefs`);
  return operation;
}

export function validateFaceDefinitionLateralityContractFR21A(input: {
  readonly authorityKey: string;
  readonly status: ReviewStatus;
  readonly expectedInputRefs: readonly string[];
  readonly contract?: FaceDefinitionLateralityContractV1 | undefined;
  readonly pairOperations?: readonly FacePairSwapInvariantOperationDefinitionV1[] | undefined;
  readonly expectedInputSensitivities?: ReadonlyMap<string, FaceLateralityInputSensitivityV1> | undefined;
  readonly extractorLandmarkRefs?: readonly number[] | undefined;
  readonly formula?: string | undefined;
}): void {
  const { authorityKey, status, expectedInputRefs, contract } = input;
  if (contract === undefined) {
    if (status === 'production_authorized') {
      throw new FaceAuthorityValidationError(`${authorityKey} production authority requires an explicit FR-21A laterality contract.`);
    }
    return;
  }

  exactKeys(contract, FR21A_CONTRACT_KEYS, `${authorityKey}.laterality`);
  if (contract.schemaVersion !== 'fr21a-v1') {
    throw new FaceAuthorityValidationError(`${authorityKey}.laterality has unknown schemaVersion: ${String(contract.schemaVersion)}`);
  }
  if (!FR21A_OUTPUT_REQUIREMENTS.has(contract.outputRequirement)) {
    throw new FaceAuthorityValidationError(`${authorityKey}.laterality has unknown outputRequirement: ${String(contract.outputRequirement)}`);
  }

  unique(expectedInputRefs, `${authorityKey}.expectedInputRefs`);
  unique(contract.inputs.map((binding) => binding.inputRef), `${authorityKey}.laterality.inputs`);
  if (!sameStringSet(contract.inputs.map((binding) => binding.inputRef), expectedInputRefs)) {
    throw new FaceAuthorityValidationError(`${authorityKey}.laterality must declare every direct definition input exactly once.`);
  }

  const classificationBySlot = new Map(
    LATERALITY_CONSUMPTION_POLICY_FR20.classifications.map((entry) => [entry.consumerSlot, entry] as const),
  );
  const pairGroups = LATERALITY_CONSUMPTION_POLICY_FR20.pairGroups;

  for (const binding of contract.inputs) {
    exactKeys(binding, FR21A_INPUT_KEYS, `${authorityKey}.laterality.input.${binding.inputRef}`);
    nonEmpty(binding.inputRef, `${authorityKey}.laterality.inputRef`);
    if (!FR21A_INPUT_SENSITIVITIES.has(binding.sensitivity)) {
      throw new FaceAuthorityValidationError(
        `${authorityKey}.laterality input ${binding.inputRef} has unknown sensitivity: ${String(binding.sensitivity)}`,
      );
    }
    const expectedSensitivity = input.expectedInputSensitivities?.get(binding.inputRef);
    if (expectedSensitivity !== undefined && expectedSensitivity !== binding.sensitivity) {
      throw new FaceAuthorityValidationError(
        `${authorityKey}.laterality input ${binding.inputRef} sensitivity=${binding.sensitivity} does not match upstream output=${expectedSensitivity}.`,
      );
    }

    const consumerSlots = binding.consumerSlotRefs ?? [];
    unique(consumerSlots, `${authorityKey}.laterality.input.${binding.inputRef}.consumerSlotRefs`);
    for (const slot of consumerSlots) {
      if (!classificationBySlot.has(slot as never)) {
        throw new FaceAuthorityValidationError(`${authorityKey}.laterality references unknown FR-20 consumer slot: ${slot}`);
      }
    }

    if (binding.sensitivity === 'side_invariant') {
      const invalid = consumerSlots.find((slot) => classificationBySlot.get(slot as never)?.individualSemanticClass !== 'side_invariant');
      if (invalid !== undefined) {
        throw new FaceAuthorityValidationError(`${authorityKey}.laterality cannot declare image-side slot ${invalid} as side_invariant.`);
      }
    }
    if (binding.sensitivity === 'image_side_only') {
      if (consumerSlots.length !== 1) {
        throw new FaceAuthorityValidationError(`${authorityKey}.laterality image_side_only input ${binding.inputRef} requires exactly one FR-20 slot.`);
      }
      const classification = classificationBySlot.get(consumerSlots[0] as never);
      if (classification?.individualSemanticClass !== 'image_side_only') {
        throw new FaceAuthorityValidationError(`${authorityKey}.laterality input ${binding.inputRef} is not an FR-20 image-side-only slot.`);
      }
    }
    if (binding.sensitivity === 'pair_swap_invariant' && consumerSlots.length > 0) {
      const matchingPair = pairGroups.find((group) => sameStringSet(group.memberSlots, consumerSlots));
      if (matchingPair === undefined) {
        throw new FaceAuthorityValidationError(`${authorityKey}.laterality pair_swap_invariant input ${binding.inputRef} has no matching FR-20 pair group.`);
      }
    }
    if (binding.sensitivity === 'anatomical_side' && status === 'production_authorized') {
      throw new FaceAuthorityValidationError(`${authorityKey} anatomical-side input is blocked while capture laterality authority is unresolved.`);
    }
  }

  if (status === 'production_authorized' && (input.extractorLandmarkRefs?.length ?? 0) > 0) {
    throw new FaceAuthorityValidationError(
      `${authorityKey} production metric cannot use provider-specific extractor landmark indices as semantic authority.`,
    );
  }

  if (contract.outputRequirement === 'anatomical_side' && status === 'production_authorized') {
    throw new FaceAuthorityValidationError(
      `${authorityKey} anatomical-side output is blocked while FR-19/FR-20 capture laterality authority is unresolved.`,
    );
  }

  const imageSideInputs = contract.inputs.filter((binding) => binding.sensitivity === 'image_side_only');
  const pairInputs = contract.inputs.filter((binding) => binding.sensitivity === 'pair_swap_invariant');
  const anatomicalInputs = contract.inputs.filter((binding) => binding.sensitivity === 'anatomical_side');

  if (contract.outputRequirement === 'side_invariant') {
    const nonInvariant = contract.inputs.find((binding) => binding.sensitivity !== 'side_invariant');
    if (nonInvariant !== undefined) {
      throw new FaceAuthorityValidationError(
        `${authorityKey} side_invariant output cannot silently collapse direct ${nonInvariant.sensitivity} input ${nonInvariant.inputRef}.`,
      );
    }
    if (contract.pairOperationRef !== undefined) {
      throw new FaceAuthorityValidationError(`${authorityKey} side_invariant output cannot carry a pairOperationRef.`);
    }
    return;
  }

  if (contract.outputRequirement === 'pair_swap_invariant') {
    if (anatomicalInputs.length > 0 && status === 'production_authorized') {
      throw new FaceAuthorityValidationError(`${authorityKey} cannot consume anatomical-side input before trusted capture laterality exists.`);
    }
    if (imageSideInputs.length === 0 && pairInputs.length === 0) {
      throw new FaceAuthorityValidationError(`${authorityKey} pair_swap_invariant output requires an actual pair-sensitive input.`);
    }

    if (imageSideInputs.length === 0) {
      if (contract.pairOperationRef !== undefined) {
        throw new FaceAuthorityValidationError(`${authorityKey} pairOperationRef is only valid when directly transforming image-side inputs.`);
      }
      return;
    }

    if (imageSideInputs.length !== 2 || contract.pairOperationRef === undefined) {
      throw new FaceAuthorityValidationError(
        `${authorityKey} direct image-side consumption requires exactly two pair members and a reviewed pair operation.`,
      );
    }
    const operations = input.pairOperations ?? [];
    const operation = operations.find((candidate) => candidate.operationRef === contract.pairOperationRef);
    if (operation === undefined) {
      throw new FaceAuthorityValidationError(`${authorityKey} references unknown FR-21A pair operation: ${contract.pairOperationRef}`);
    }
    validateFacePairSwapInvariantOperationFR21A(operation);
    if (status === 'production_authorized' && operation.reviewState !== 'reviewed') {
      throw new FaceAuthorityValidationError(`${authorityKey} production pair operation must be reviewed: ${operation.operationRef}`);
    }
    if (!sameStringSet(operation.transform.inputRefs, imageSideInputs.map((binding) => binding.inputRef))) {
      throw new FaceAuthorityValidationError(`${authorityKey} pair operation inputs do not match the direct image-side inputs.`);
    }

    const consumerSlots = imageSideInputs.flatMap((binding) => binding.consumerSlotRefs ?? []);
    const group = pairGroups.find((candidate) => candidate.pairGroupRef === operation.pairGroupRef);
    if (group === undefined || !sameStringSet(group.memberSlots, consumerSlots)) {
      throw new FaceAuthorityValidationError(`${authorityKey} pair operation group does not match the declared FR-20 pair members.`);
    }

    if (input.formula !== undefined && normalizeFormula(input.formula) !== normalizeFormula(operation.formulaSpec)) {
      throw new FaceAuthorityValidationError(
        `${authorityKey} formula uses ordered/different side semantics than the reviewed pair operation.`,
      );
    }
    return;
  }

  if (contract.pairOperationRef !== undefined) {
    throw new FaceAuthorityValidationError(`${authorityKey} anatomical_side output cannot use pairOperationRef as a laterality shortcut.`);
  }
}

export function validateFaceAuthorityRegistry(registry: FaceAuthorityRegistry): void {
  unique(registry.works.map((work) => work.workId), 'works');
  unique(registry.witnesses.map((witness) => witness.witnessId), 'witnesses');
  unique(registry.passages.map((passage) => passage.passageId), 'passages');
  unique(registry.methodologies.map((method) => `${method.methodologyId}@${method.version}`), 'methodologies');
  unique(registry.conflicts.map((conflict) => conflict.conflictId), 'conflicts');
  unique(registry.regionMaps.map((map) => `${map.regionMapId}@${map.version}`), 'regionMaps');
  unique(registry.metrics.map((metric) => `${metric.metricKey}@${metric.version}`), 'metrics');
  unique(registry.operationalizations.map((entry) => entry.operationalizationId), 'operationalizations');
  unique(registry.claimTypes.map((entry) => entry.claimType), 'claimTypes');
  unique(registry.rules.map((rule) => `${rule.ruleId}@${rule.version}`), 'rules');
  unique(registry.comparisonPolicies.map((policy) => `${policy.policyId}@${policy.version}`), 'comparisonPolicies');
  unique(registry.methodologyPacks.map((pack) => `${pack.packId}@${pack.version}`), 'methodologyPacks');
  const lateralityPairOperations = registry.lateralityPairOperations ?? [];
  unique(lateralityPairOperations.map((operation) => operation.operationRef), 'lateralityPairOperations');
  for (const operation of lateralityPairOperations) validateFacePairSwapInvariantOperationFR21A(operation);

  const workIds: ReadonlySet<string> = new Set<string>(registry.works.map((work) => work.workId));
  const witnessIds: ReadonlySet<string> = new Set<string>(registry.witnesses.map((witness) => witness.witnessId));
  const passageMap: ReadonlyMap<string, SourcePassage> = new Map<string, SourcePassage>(
    registry.passages.map((passage) => [passage.passageId, passage]),
  );
  const passageIds: ReadonlySet<string> = new Set<string>(passageMap.keys());
  const methodologyIds: ReadonlySet<string> = new Set<string>(
    registry.methodologies.map((method) => `${method.methodologyId}@${method.version}`),
  );
  const methodologyStatuses: ReadonlyMap<string, ReviewStatus> = new Map<string, ReviewStatus>(
    registry.methodologies.map((method) => [`${method.methodologyId}@${method.version}`, method.reviewStatus]),
  );
  const regionMapIds: ReadonlySet<string> = new Set<string>(
    registry.regionMaps.map((map) => `${map.regionMapId}@${map.version}`),
  );
  const regionMapStatuses: ReadonlyMap<string, ReviewStatus> = new Map<string, ReviewStatus>(
    registry.regionMaps.map((map) => [`${map.regionMapId}@${map.version}`, map.mappingStatus]),
  );
  const metricIds: ReadonlySet<string> = new Set<string>(
    registry.metrics.map((metric) => `${metric.metricKey}@${metric.version}`),
  );
  const metricStatuses: ReadonlyMap<string, ReviewStatus> = new Map<string, ReviewStatus>(
    registry.metrics.map((metric) => [`${metric.metricKey}@${metric.version}`, metric.reviewStatus]),
  );
  const metricDefinitions = new Map<string, FaceAuthorityRegistry['metrics'][number]>(
    registry.metrics.map((metric) => [`${metric.metricKey}@${metric.version}`, metric]),
  );
  const operationalizationIds: ReadonlySet<string> = new Set<string>(
    registry.operationalizations.map((entry) => entry.operationalizationId),
  );
  const operationalizationStatuses: ReadonlyMap<string, ReviewStatus> = new Map<string, ReviewStatus>(
    registry.operationalizations.map((entry) => [entry.operationalizationId, entry.reviewStatus]),
  );
  const operationalizationDefinitions = new Map<string, FaceAuthorityRegistry['operationalizations'][number]>(
    registry.operationalizations.map((entry) => [entry.operationalizationId, entry]),
  );
  const claimTypes = new Map(registry.claimTypes.map((entry) => [entry.claimType, entry] as const));
  const comparisonPolicyIds: ReadonlySet<string> = new Set<string>(
    registry.comparisonPolicies.map((policy) => `${policy.policyId}@${policy.version}`),
  );

  for (const work of registry.works) {
    stableKey(work.workId, 'work.workId');
    nonEmpty(work.canonicalTitle, `${work.workId}.canonicalTitle`);
  }

  for (const witness of registry.witnesses) {
    stableKey(witness.witnessId, 'witness.witnessId');
    assertRef(workIds, witness.workId, `${witness.witnessId}.workId`);
    nonEmpty(witness.editionLabel, `${witness.witnessId}.editionLabel`);
  }

  for (const passage of registry.passages) {
    stableKey(passage.passageId, 'passage.passageId');
    assertRef(witnessIds, passage.witnessId, `${passage.passageId}.witnessId`);
    nonEmpty(passage.originalText, `${passage.passageId}.originalText`);
  }

  for (const relation of registry.lineage) {
    assertRef(workIds, relation.fromWorkId, 'lineage.fromWorkId');
    assertRef(workIds, relation.toWorkId, 'lineage.toWorkId');
    if (relation.fromWorkId === relation.toWorkId) {
      throw new FaceAuthorityValidationError('lineage relation cannot point a work to itself.');
    }
    if (relation.evidenceRefs.length === 0) throw new FaceAuthorityValidationError('lineage relation requires evidenceRefs.');
  }

  for (const method of registry.methodologies) {
    const methodologyRef = `${method.methodologyId}@${method.version}`;
    stableKey(method.methodologyId, 'methodology.methodologyId');
    nonEmpty(method.version, `${method.methodologyId}.version`);
    nonEmpty(method.traditionalTerm, `${method.methodologyId}.traditionalTerm`);
    if (method.sourceRefs.length === 0) throw new FaceAuthorityValidationError(`${method.methodologyId} requires sourceRefs.`);
    for (const sourceRef of method.sourceRefs) assertRef(passageIds, sourceRef, `${method.methodologyId}.sourceRefs`);
    validateReviewedSourceGate(methodologyRef, method.reviewStatus, method.sourceRefs, passageMap);
  }

  for (const conflict of registry.conflicts) {
    stableKey(conflict.conflictId, 'conflict.conflictId');
    if (conflict.methodologyRefs.length === 0 || conflict.sourceRefs.length === 0 || conflict.affectedTiers.length === 0) {
      throw new FaceAuthorityValidationError(`${conflict.conflictId} requires methodologyRefs, sourceRefs, and affectedTiers.`);
    }
    for (const methodologyRef of conflict.methodologyRefs) assertRef(methodologyIds, methodologyRef, `${conflict.conflictId}.methodologyRefs`);
    for (const sourceRef of conflict.sourceRefs) assertRef(passageIds, sourceRef, `${conflict.conflictId}.sourceRefs`);
    if (conflict.status === 'resolved' && (conflict.resolutionNote === undefined || conflict.resolutionNote.trim().length === 0)) {
      throw new FaceAuthorityValidationError(`${conflict.conflictId} resolved conflict requires resolutionNote.`);
    }
  }

  for (const map of registry.regionMaps) {
    const mapRef = `${map.regionMapId}@${map.version}`;
    stableKey(map.regionMapId, 'regionMap.regionMapId');
    assertRef(methodologyIds, map.methodologyRef, `${map.regionMapId}.methodologyRef`);
    if (map.sourceRefs.length === 0) throw new FaceAuthorityValidationError(`${map.regionMapId} requires sourceRefs.`);
    for (const sourceRef of map.sourceRefs) assertRef(passageIds, sourceRef, `${map.regionMapId}.sourceRefs`);
    unique(map.regions.map((region) => region.regionKey), `${map.regionMapId}.regions`);
    for (const region of map.regions) {
      if (region.sourceRefs.length === 0) throw new FaceAuthorityValidationError(`${map.regionMapId}.${region.regionKey} requires sourceRefs.`);
      for (const sourceRef of region.sourceRefs) assertRef(passageIds, sourceRef, `${map.regionMapId}.${region.regionKey}.sourceRefs`);
    }
    validateReviewedSourceGate(mapRef, map.mappingStatus, map.sourceRefs, passageMap);
    assertProductionDependency(mapRef, map.mappingStatus, `methodology ${map.methodologyRef}`, methodologyStatuses.get(map.methodologyRef));
  }

  for (const metric of registry.metrics) {
    const metricRef = `${metric.metricKey}@${metric.version}`;
    stableKey(metric.metricKey, 'metric.metricKey');
    nonEmpty(metric.version, `${metric.metricKey}.version`);
    assertRef(methodologyIds, metric.methodologyRef, `${metric.metricKey}.methodologyRef`);
    if (metric.regionMapRef !== undefined) assertRef(regionMapIds, metric.regionMapRef, `${metric.metricKey}.regionMapRef`);
    if (metric.sourceRefs.length === 0) throw new FaceAuthorityValidationError(`${metric.metricKey} requires sourceRefs.`);
    for (const sourceRef of metric.sourceRefs) assertRef(passageIds, sourceRef, `${metric.metricKey}.sourceRefs`);
    nonEmpty(metric.formula, `${metric.metricKey}.formula`);
    if (metric.requiredAnchorRefs.length === 0) throw new FaceAuthorityValidationError(`${metric.metricKey} requires semantic anchor refs.`);
    unique(metric.requiredAnchorRefs, `${metric.metricKey}.requiredAnchorRefs`);
    if (metric.stabilityRequirements.length === 0) throw new FaceAuthorityValidationError(`${metric.metricKey} requires stabilityRequirements.`);
    validateReviewedSourceGate(metricRef, metric.reviewStatus, metric.sourceRefs, passageMap);
    assertProductionDependency(metricRef, metric.reviewStatus, `methodology ${metric.methodologyRef}`, methodologyStatuses.get(metric.methodologyRef));
    if (metric.regionMapRef !== undefined) {
      assertProductionDependency(metricRef, metric.reviewStatus, `region map ${metric.regionMapRef}`, regionMapStatuses.get(metric.regionMapRef));
    }
    validateFaceDefinitionLateralityContractFR21A({
      authorityKey: metricRef,
      status: metric.reviewStatus,
      expectedInputRefs: metric.requiredAnchorRefs,
      contract: metric.laterality,
      pairOperations: lateralityPairOperations,
      extractorLandmarkRefs: metric.extractorLandmarkRefs,
      formula: metric.formula,
    });
  }

  for (const operationalization of registry.operationalizations) {
    stableKey(operationalization.operationalizationId, 'operationalization.operationalizationId');
    assertRef(methodologyIds, operationalization.methodologyRef, `${operationalization.operationalizationId}.methodologyRef`);
    if (operationalization.sourceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${operationalization.operationalizationId} requires sourceRefs.`);
    }
    for (const sourceRef of operationalization.sourceRefs) {
      assertRef(passageIds, sourceRef, `${operationalization.operationalizationId}.sourceRefs`);
    }
    for (const metricRef of operationalization.inputMetricRefs) {
      assertRef(metricIds, metricRef, `${operationalization.operationalizationId}.inputMetricRefs`);
    }
    validateReviewedSourceGate(operationalization.operationalizationId, operationalization.reviewStatus, operationalization.sourceRefs, passageMap);
    assertProductionDependency(
      operationalization.operationalizationId,
      operationalization.reviewStatus,
      `methodology ${operationalization.methodologyRef}`,
      methodologyStatuses.get(operationalization.methodologyRef),
    );
    for (const metricRef of operationalization.inputMetricRefs) {
      assertProductionDependency(
        operationalization.operationalizationId,
        operationalization.reviewStatus,
        `metric ${metricRef}`,
        metricStatuses.get(metricRef),
      );
    }
    const expectedInputSensitivities = new Map<string, FaceLateralityInputSensitivityV1>();
    for (const metricRef of operationalization.inputMetricRefs) {
      const upstream = metricDefinitions.get(metricRef)?.laterality?.outputRequirement;
      if (upstream !== undefined) expectedInputSensitivities.set(metricRef, upstream);
    }
    validateFaceDefinitionLateralityContractFR21A({
      authorityKey: operationalization.operationalizationId,
      status: operationalization.reviewStatus,
      expectedInputRefs: operationalization.inputMetricRefs,
      contract: operationalization.laterality,
      pairOperations: lateralityPairOperations,
      expectedInputSensitivities,
    });
  }

  for (const rule of registry.rules) {
    stableKey(rule.ruleId, 'rule.ruleId');
    assertRef(methodologyIds, rule.methodologyRef, `${rule.ruleId}.methodologyRef`);
    const claimType = claimTypes.get(rule.output.claimType);
    if (claimType === undefined) throw new FaceAuthorityValidationError(`${rule.ruleId} references unknown claimType: ${rule.output.claimType}`);
    if (!claimType.allowedTiers.includes(rule.tier)) {
      throw new FaceAuthorityValidationError(`${rule.ruleId} tier ${rule.tier} is not allowed for ${rule.output.claimType}.`);
    }
    for (const sourceRef of rule.sourceRefs) assertRef(passageIds, sourceRef, `${rule.ruleId}.sourceRefs`);
    for (const inputRequirement of rule.inputs) {
      if (inputRequirement.sourceType === 'metric') assertRef(metricIds, inputRequirement.ref, `${rule.ruleId}.inputs`);
      if (inputRequirement.sourceType === 'operationalization') assertRef(operationalizationIds, inputRequirement.ref, `${rule.ruleId}.inputs`);
      if (inputRequirement.sourceType === 'claim' && !claimTypes.has(inputRequirement.ref)) {
        throw new FaceAuthorityValidationError(`${rule.ruleId}.inputs references unknown claim type: ${inputRequirement.ref}`);
      }
    }
    validateRulePromotion(rule, passageMap, registry.conflicts, methodologyStatuses, metricStatuses, operationalizationStatuses);

    const expectedInputSensitivities = new Map<string, FaceLateralityInputSensitivityV1>();
    for (const inputRequirement of rule.inputs) {
      if (inputRequirement.sourceType === 'metric') {
        const upstream = metricDefinitions.get(inputRequirement.ref)?.laterality?.outputRequirement;
        if (upstream !== undefined) expectedInputSensitivities.set(inputRequirement.inputKey, upstream);
      } else if (inputRequirement.sourceType === 'operationalization') {
        const upstream = operationalizationDefinitions.get(inputRequirement.ref)?.laterality?.outputRequirement;
        if (upstream !== undefined) expectedInputSensitivities.set(inputRequirement.inputKey, upstream);
      } else {
        const producerRequirements = registry.rules
          .filter((candidate) => candidate.output.claimType === inputRequirement.ref && candidate.promotionStatus === 'production_authorized')
          .map((candidate) => candidate.laterality?.outputRequirement)
          .filter((requirement): requirement is NonNullable<typeof requirement> => requirement !== undefined);
        const distinct = [...new Set(producerRequirements)];
        if (distinct.length > 1) {
          throw new FaceAuthorityValidationError(
            `${rule.ruleId} claim input ${inputRequirement.ref} has mixed production laterality outputs and cannot be consumed without a narrower contract.`,
          );
        }
        if (distinct.length === 1) expectedInputSensitivities.set(inputRequirement.inputKey, distinct[0]!);
      }
    }
    validateFaceDefinitionLateralityContractFR21A({
      authorityKey: rule.ruleId,
      status: rule.promotionStatus,
      expectedInputRefs: rule.inputs.map((entry) => entry.inputKey),
      contract: rule.laterality,
      pairOperations: lateralityPairOperations,
      expectedInputSensitivities,
    });
  }

  for (const policy of registry.comparisonPolicies) {
    validateFaceComparisonPolicy(policy, new Set<string>(claimTypes.keys()), passageIds);
  }
  for (const pack of registry.methodologyPacks) {
    validateMethodologyPack(pack, comparisonPolicyIds, regionMapIds, methodologyIds);
  }
}

export function validateFaceComparisonPolicy(
  policy: FaceComparisonPolicy,
  knownClaimTypes?: ReadonlySet<string>,
  knownPassageIds?: ReadonlySet<string>,
): void {
  stableKey(policy.policyId, 'comparisonPolicy.policyId');
  unique(policy.groups.map((group) => group.groupKey), `${policy.policyId}.groups`);
  for (const group of policy.groups) {
    stableKey(group.groupKey, `${policy.policyId}.groupKey`);
    if (group.eligibleClaimTypes.length === 0) throw new FaceAuthorityValidationError(`${group.groupKey} requires eligibleClaimTypes.`);
    if (knownClaimTypes !== undefined) {
      for (const claimType of group.eligibleClaimTypes) assertRef(knownClaimTypes, claimType, `${group.groupKey}.eligibleClaimTypes`);
    }
    if (group.comparisonMode === 'methodology_ordinal' && group.orderingRuleRef === undefined) {
      throw new FaceAuthorityValidationError(`${group.groupKey} methodology_ordinal requires orderingRuleRef.`);
    }
    if (knownPassageIds !== undefined && group.sourceRefs !== undefined) {
      for (const sourceRef of group.sourceRefs) assertRef(knownPassageIds, sourceRef, `${group.groupKey}.sourceRefs`);
    }
  }
}

function toObservationState(bundle: SharedFaceObservationBundleV3): FaceObservationState {
  if (bundle.eligibility.status === 'ineligible') return 'recapture_required';
  if (bundle.eligibility.status === 'section_limited') return 'section_limited';
  return 'usable';
}

export function adaptMyeongHaStaticFaceObservation(bundle: SharedFaceObservationBundleV3): MyeongHaStaticFaceObservation {
  const observations = {
    ...(bundle.observations.outline === undefined ? {} : { outline: bundle.observations.outline }),
    ...(bundle.observations.verticalBalance === undefined ? {} : { verticalBalance: bundle.observations.verticalBalance }),
    ...(bundle.observations.eyes === undefined ? {} : { eyes: bundle.observations.eyes }),
    ...(bundle.observations.featureLayout === undefined ? {} : { featureLayout: bundle.observations.featureLayout }),
    ...(bundle.observations.visualLanguage === undefined ? {} : { visualLanguage: bundle.observations.visualLanguage }),
  };
  return {
    schemaVersion: bundle.schemaVersion,
    capabilityVersion: bundle.capabilityVersion,
    extractorVersion: bundle.extractorVersion,
    modelVersion: bundle.modelVersion,
    observationState: toObservationState(bundle),
    geometry: bundle.geometry,
    observations,
    unavailableRegions: bundle.quality.occludedRegions,
    evidenceRefs: bundle.evidenceRefs,
  };
}

export type FaceRankingLabel = 'strongest_weakest' | 'most_salient' | 'unordered_only';

export function resolveRankingLabel(mode: ComparisonMode): FaceRankingLabel {
  switch (mode) {
    case 'methodology_ordinal': return 'strongest_weakest';
    case 'diagnostic_salience': return 'most_salient';
    case 'unordered': return 'unordered_only';
  }
}

export function assertClaimsComparable(input: {
  readonly policy: FaceComparisonPolicy;
  readonly groupKey: string;
  readonly claims: readonly FaceClaim[];
  readonly requestedLabel: FaceRankingLabel;
}): void {
  const group = input.policy.groups.find((candidate) => candidate.groupKey === input.groupKey);
  if (group === undefined) throw new FaceAuthorityValidationError(`Unknown comparison group: ${input.groupKey}`);
  const eligible = new Set(group.eligibleClaimTypes);
  const invalid = input.claims.find((claim) => !eligible.has(claim.claimType));
  if (invalid !== undefined) throw new FaceAuthorityValidationError(`${invalid.claimRef} is not eligible for ${input.groupKey}.`);
  const allowed = resolveRankingLabel(group.comparisonMode);
  if (input.requestedLabel !== allowed) {
    throw new FaceAuthorityValidationError(
      `${input.groupKey} comparisonMode=${group.comparisonMode} permits ${allowed}, not ${input.requestedLabel}.`,
    );
  }
}
