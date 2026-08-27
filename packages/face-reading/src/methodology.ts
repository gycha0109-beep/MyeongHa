import type { FaceRuleDefinition } from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export type FaceMethodologyStatus = 'research' | 'reviewed' | 'production_authorized';

export interface FaceMethodologyDefinition {
  readonly methodologyId: string;
  readonly version: string;
  readonly systemKey: string;
  readonly sourceRefs: readonly string[];
  readonly lineageNotes: readonly string[];
  readonly status: FaceMethodologyStatus;
  readonly observationContract: {
    readonly requiredConcepts: readonly string[];
    readonly optionalConcepts: readonly string[];
    readonly forbiddenConcepts: readonly string[];
  };
  readonly regionSemantics?: readonly {
    readonly regionKey: string;
    readonly fromConcept: string;
    readonly toConcept: string;
    readonly sourceRef: string;
    readonly status: FaceMethodologyStatus;
  }[];
  readonly interpretationNotes: readonly string[];
}

export interface FaceMethodologyRegistry {
  readonly registryId: string;
  readonly version: string;
  readonly definitions: readonly FaceMethodologyDefinition[];
}

function ref(definition: FaceMethodologyDefinition): string {
  return `${definition.methodologyId}@${definition.version}`;
}

export function validateFaceMethodologyRegistry(registry: FaceMethodologyRegistry): void {
  const ids = new Set<string>();
  for (const definition of registry.definitions) {
    const definitionRef = ref(definition);
    if (ids.has(definitionRef)) {
      throw new FaceAuthorityValidationError(`Duplicate methodology definition: ${definitionRef}`);
    }
    ids.add(definitionRef);
    if (definition.sourceRefs.length === 0) {
      throw new FaceAuthorityValidationError(`${definitionRef} requires sourceRefs.`);
    }
    const required = new Set(definition.observationContract.requiredConcepts);
    const forbidden = new Set(definition.observationContract.forbiddenConcepts);
    for (const concept of required) {
      if (forbidden.has(concept)) {
        throw new FaceAuthorityValidationError(`${definitionRef} both requires and forbids ${concept}.`);
      }
    }
    for (const region of definition.regionSemantics ?? []) {
      if (!definition.sourceRefs.includes(region.sourceRef)) {
        throw new FaceAuthorityValidationError(
          `${definitionRef}.${region.regionKey} sourceRef is not declared by the methodology: ${region.sourceRef}`,
        );
      }
      if (definition.status === 'production_authorized' && region.status !== 'production_authorized') {
        throw new FaceAuthorityValidationError(
          `${definitionRef} cannot be production_authorized while ${region.regionKey} remains ${region.status}.`,
        );
      }
    }
  }
}

export function validateFaceRulesAgainstMethodologies(
  rules: readonly FaceRuleDefinition[],
  registry: FaceMethodologyRegistry,
): void {
  const known = new Map(registry.definitions.map((definition) => [ref(definition), definition] as const));
  for (const rule of rules) {
    const methodology = known.get(rule.methodologyRef);
    if (methodology === undefined) {
      throw new FaceAuthorityValidationError(`${rule.ruleId} references unknown methodology: ${rule.methodologyRef}`);
    }
    if (rule.promotionStatus === 'production_authorized' && methodology.status !== 'production_authorized') {
      throw new FaceAuthorityValidationError(
        `${rule.ruleId} cannot be production_authorized with methodology ${rule.methodologyRef} status=${methodology.status}.`,
      );
    }
  }
}
