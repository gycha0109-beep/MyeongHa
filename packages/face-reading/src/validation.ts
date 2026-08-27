import type {
  ComparisonMode,
  FaceAuthorityConflictDefinition,
  FaceAuthorityRegistry,
  FaceClaim,
  FaceComparisonPolicy,
  FaceMethodologyPackDefinition,
  FaceObservationState,
  FaceRuleDefinition,
  MyeongHaStaticFaceObservation,
  ReviewStatus,
  SharedFaceObservationBundleV3,
  SourcePassage,
} from './contracts.js';

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

export class FaceAuthorityValidationError extends Error {
  override readonly name = 'FaceAuthorityValidationError';
}

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  }
}

function stableKey(value: string, path: string): void {
  nonEmpty(value, path);
  if (!STABLE_KEY.test(value)) {
    throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
  }
}

function unique(values: readonly string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new FaceAuthorityValidationError(`${path} contains duplicate key: ${value}`);
    }
    seen.add(value);
  }
}

function assertRef(set: ReadonlySet<string>, value: string, path: string): void {
  if (!set.has(value)) {
    throw new FaceAuthorityValidationError(`${path} references unknown key: ${value}`);
  }
}

function passageStatusRank(status: SourcePassage['verificationStatus']): number {
  switch (status) {
    case 'unverified_ocr': return 0;
    case 'scan_checked': return 1;
    case 'double_checked': return 2;
  }
}

function validateProductionSourceGate(
  authorityKey: string,
  status: ReviewStatus,
  sourceRefs: readonly string[],
  passages: ReadonlyMap<string, SourcePassage>,
): void {
  if (status !== 'production_authorized') return;
  if (sourceRefs.length === 0) {
    throw new FaceAuthorityValidationError(`${authorityKey} production authority requires sourceRefs.`);
  }
  for (const ref of sourceRefs) {
    const passage = passages.get(ref);
    if (passage === undefined) {
      throw new FaceAuthorityValidationError(`${authorityKey} production sourceRef must resolve to a passage: ${ref}`);
    }
    if (passageStatusRank(passage.verificationStatus) < passageStatusRank('scan_checked')) {
      throw new FaceAuthorityValidationError(`${authorityKey} production authority requires scan_checked source passage: ${ref}`);
    }
  }
}

function validateRulePromotion(
  rule: FaceRuleDefinition,
  passages: ReadonlyMap<string, SourcePassage>,
  conflicts: readonly FaceAuthorityConflictDefinition[],
): void {
  validateProductionSourceGate(rule.ruleId, rule.promotionStatus, rule.sourceRefs, passages);
  if (rule.promotionStatus !== 'production_authorized') return;

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
  for (const ref of pack.methodologyDefinitionRefs) {
    assertRef(methodologyIds, ref, `${pack.packId}.methodologyDefinitionRefs`);
  }
  for (const ref of pack.regionMapRefs) {
    assertRef(regionMapIds, ref, `${pack.packId}.regionMapRefs`);
  }
  if (!pack.forbiddenObservationInputs.includes('observations.colorAppearance')) {
    throw new FaceAuthorityValidationError(`${pack.packId} must forbid observations.colorAppearance for static v1.`);
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

  const workIds = new Set(registry.works.map((work) => work.workId));
  const witnessIds = new Set(registry.witnesses.map((witness) => witness.witnessId));
  const passageMap = new Map(registry.passages.map((passage) => [passage.passageId, passage] as const));
  const passageIds = new Set(passageMap.keys());
  const methodologyIds = new Set(registry.methodologies.map((method) => `${method.methodologyId}@${method.version}`));
  const metricIds = new Set(registry.metrics.map((metric) => `${metric.metricKey}@${metric.version}`));
  const operationalizationIds = new Set(registry.operationalizations.map((entry) => entry.operationalizationId));
  const claimTypes = new Map(registry.claimTypes.map((entry) => [entry.claimType, entry] as const));
  const comparisonPolicyIds = new Set(registry.comparisonPolicies.map((policy) => `${policy.policyId}@${policy.version}`));
  const regionMapIds = new Set(registry.regionMaps.map((map) => `${map.regionMapId}@${map.version}`));

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
    if (relation.evidenceRefs.length === 0) {
      throw new FaceAuthorityValidationError('lineage relation requires evidenceRefs.');
    }
  }

  for (const method of registry.methodologies) {
    stableKey(method.methodologyId, 'methodology.methodologyId');
    nonEmpty(method.version, `${method.methodologyId}.version`);
    nonEmpty(method.traditionalTerm, `${method.methodologyId}.traditionalTerm`);
    if (method.sourceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${method.methodologyId} requires sourceRefs.`);
    }
    for (const sourceRef of method.sourceRefs) {
      assertRef(passageIds, sourceRef, `${method.methodologyId}.sourceRefs`);
    }
    validateProductionSourceGate(
      `${method.methodologyId}@${method.version}`,
      method.reviewStatus,
      method.sourceRefs,
      passageMap,
    );
  }

  for (const conflict of registry.conflicts) {
    stableKey(conflict.conflictId, 'conflict.conflictId');
    if (conflict.methodologyRefs.length === 0 || conflict.sourceRefs.length === 0 || conflict.affectedTiers.length === 0) {
      throw new FaceAuthorityValidationError(`${conflict.conflictId} requires methodologyRefs, sourceRefs, and affectedTiers.`);
    }
    for (const methodologyRef of conflict.methodologyRefs) {
      assertRef(methodologyIds, methodologyRef, `${conflict.conflictId}.methodologyRefs`);
    }
    for (const sourceRef of conflict.sourceRefs) {
      assertRef(passageIds, sourceRef, `${conflict.conflictId}.sourceRefs`);
    }
    if (conflict.status === 'resolved' && (conflict.resolutionNote === undefined || conflict.resolutionNote.trim().length === 0)) {
      throw new FaceAuthorityValidationError(`${conflict.conflictId} resolved conflict requires resolutionNote.`);
    }
  }

  for (const map of registry.regionMaps) {
    stableKey(map.regionMapId, 'regionMap.regionMapId');
    assertRef(methodologyIds, map.methodologyRef, `${map.regionMapId}.methodologyRef`);
    if (map.sourceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${map.regionMapId} requires sourceRefs.`);
    }
    for (const sourceRef of map.sourceRefs) {
      assertRef(passageIds, sourceRef, `${map.regionMapId}.sourceRefs`);
    }
    unique(map.regions.map((region) => region.regionKey), `${map.regionMapId}.regions`);
    for (const region of map.regions) {
      if (region.sourceRefs.length === 0) {
        throw new FaceAuthorityValidationError(`${map.regionMapId}.${region.regionKey} requires sourceRefs.`);
      }
      for (const sourceRef of region.sourceRefs) {
        assertRef(passageIds, sourceRef, `${map.regionMapId}.${region.regionKey}.sourceRefs`);
      }
    }
    validateProductionSourceGate(`${map.regionMapId}@${map.version}`, map.mappingStatus, map.sourceRefs, passageMap);
  }

  for (const metric of registry.metrics) {
    stableKey(metric.metricKey, 'metric.metricKey');
    nonEmpty(metric.version, `${metric.metricKey}.version`);
    nonEmpty(metric.formula, `${metric.metricKey}.formula`);
    if (metric.requiredAnchorRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${metric.metricKey} requires semantic anchor refs.`);
    }
    unique(metric.requiredAnchorRefs, `${metric.metricKey}.requiredAnchorRefs`);
    if (metric.stabilityRequirements.length === 0) {
      throw new FaceAuthorityValidationError(`${metric.metricKey} requires stabilityRequirements.`);
    }
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
    validateProductionSourceGate(
      operationalization.operationalizationId,
      operationalization.reviewStatus,
      operationalization.sourceRefs,
      passageMap,
    );
  }

  for (const rule of registry.rules) {
    stableKey(rule.ruleId, 'rule.ruleId');
    assertRef(methodologyIds, rule.methodologyRef, `${rule.ruleId}.methodologyRef`);
    const claimType = claimTypes.get(rule.output.claimType);
    if (claimType === undefined) {
      throw new FaceAuthorityValidationError(`${rule.ruleId} references unknown claimType: ${rule.output.claimType}`);
    }
    if (!claimType.allowedTiers.includes(rule.tier)) {
      throw new FaceAuthorityValidationError(`${rule.ruleId} tier ${rule.tier} is not allowed for ${rule.output.claimType}.`);
    }
    for (const sourceRef of rule.sourceRefs) {
      assertRef(passageIds, sourceRef, `${rule.ruleId}.sourceRefs`);
    }
    for (const input of rule.inputs) {
      if (input.sourceType === 'metric') assertRef(metricIds, input.ref, `${rule.ruleId}.inputs`);
      if (input.sourceType === 'operationalization') assertRef(operationalizationIds, input.ref, `${rule.ruleId}.inputs`);
      if (input.sourceType === 'claim' && !claimTypes.has(input.ref)) {
        throw new FaceAuthorityValidationError(`${rule.ruleId}.inputs references unknown claim type: ${input.ref}`);
      }
    }
    validateRulePromotion(rule, passageMap, registry.conflicts);
  }

  for (const policy of registry.comparisonPolicies) {
    validateFaceComparisonPolicy(policy, new Set(claimTypes.keys()), passageIds);
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
    if (group.eligibleClaimTypes.length === 0) {
      throw new FaceAuthorityValidationError(`${group.groupKey} requires eligibleClaimTypes.`);
    }
    if (knownClaimTypes !== undefined) {
      for (const claimType of group.eligibleClaimTypes) {
        assertRef(knownClaimTypes, claimType, `${group.groupKey}.eligibleClaimTypes`);
      }
    }
    if (group.comparisonMode === 'methodology_ordinal' && group.orderingRuleRef === undefined) {
      throw new FaceAuthorityValidationError(`${group.groupKey} methodology_ordinal requires orderingRuleRef.`);
    }
    if (knownPassageIds !== undefined && group.sourceRefs !== undefined) {
      for (const sourceRef of group.sourceRefs) {
        assertRef(knownPassageIds, sourceRef, `${group.groupKey}.sourceRefs`);
      }
    }
  }
}

function toObservationState(bundle: SharedFaceObservationBundleV3): FaceObservationState {
  if (bundle.eligibility.status === 'ineligible') return 'recapture_required';
  if (bundle.eligibility.status === 'section_limited') return 'section_limited';
  return 'usable';
}

export function adaptMyeongHaStaticFaceObservation(
  bundle: SharedFaceObservationBundleV3,
): MyeongHaStaticFaceObservation {
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
  if (group === undefined) {
    throw new FaceAuthorityValidationError(`Unknown comparison group: ${input.groupKey}`);
  }
  const eligible = new Set(group.eligibleClaimTypes);
  const invalid = input.claims.find((claim) => !eligible.has(claim.claimType));
  if (invalid !== undefined) {
    throw new FaceAuthorityValidationError(`${invalid.claimRef} is not eligible for ${input.groupKey}.`);
  }
  const allowed = resolveRankingLabel(group.comparisonMode);
  if (input.requestedLabel !== allowed) {
    throw new FaceAuthorityValidationError(
      `${input.groupKey} comparisonMode=${group.comparisonMode} permits ${allowed}, not ${input.requestedLabel}.`,
    );
  }
}
