export type FaceTier = 'F0' | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8';

export type FaceObservationState = 'usable' | 'section_limited' | 'recapture_required';
export type FaceDiagnosisResolution = 'resolved' | 'resolved_mixed' | 'unsupported_method';
export type SourceClass = 'primary_manual' | 'commentary' | 'scholarly_lineage' | 'modern_secondary';
export type SourceWitnessStatus = 'candidate' | 'verified' | 'deprecated';
export type PassageVerificationStatus = 'unverified_ocr' | 'scan_checked' | 'double_checked';
export type ReviewStatus = 'research' | 'reviewed' | 'production_authorized';
export type DiagnosticSalience = 'primary' | 'strong' | 'supporting' | 'secondary' | 'countervailing';
export type TraditionalDisposition = 'favorable' | 'mixed' | 'challenging' | 'neutral';
export type FaceMetricUnit = 'ratio' | 'degree' | 'normalized_distance';
export type ComparisonMode = 'methodology_ordinal' | 'diagnostic_salience' | 'unordered';

export interface SourceWork {
  readonly workId: string;
  readonly canonicalTitle: string;
  readonly alternateTitles: readonly string[];
  readonly attributedAuthors: readonly string[];
  readonly estimatedPeriod?: string;
  readonly sourceClass: SourceClass;
}

export interface SourceWitness {
  readonly witnessId: string;
  readonly workId: string;
  readonly editionLabel: string;
  readonly publicationYear?: number;
  readonly holdingInstitution?: string;
  readonly digitalSourceUrl?: string;
  readonly checksum?: string;
  readonly witnessStatus: SourceWitnessStatus;
}

export interface SourcePassage {
  readonly passageId: string;
  readonly witnessId: string;
  readonly volume?: string;
  readonly chapter?: string;
  readonly printedPage?: string;
  readonly scanPage?: number;
  readonly originalText: string;
  readonly normalizedText?: string;
  readonly translation?: string;
  readonly verificationStatus: PassageVerificationStatus;
}

export interface SourceLineageRelation {
  readonly fromWorkId: string;
  readonly toWorkId: string;
  readonly relation: 'quotes' | 'adapts' | 'likely_derives_from' | 'same_tradition' | 'independent_uncertain';
  readonly evidenceRefs: readonly string[];
  readonly confidence: 'high' | 'medium' | 'low';
}

export interface FaceMethodologyDefinition {
  readonly methodologyId: string;
  readonly version: string;
  readonly traditionalTerm: string;
  readonly scope: 'static_face' | 'dynamic_face' | 'body' | 'mixed';
  readonly sourceRefs: readonly string[];
  readonly description: string;
  readonly limitations: readonly string[];
  readonly reviewStatus: ReviewStatus;
}

export interface FaceAuthorityConflictDefinition {
  readonly conflictId: string;
  readonly methodologyRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly affectedTiers: readonly FaceTier[];
  readonly status: 'open' | 'resolved';
  readonly reason: string;
  readonly resolutionNote?: string;
}

export interface FaceRegionDefinition {
  readonly regionKey: string;
  readonly label: string;
  readonly geometryDefinition: unknown;
  readonly sourceRefs: readonly string[];
}

export interface FaceRegionMapDefinition {
  readonly regionMapId: string;
  readonly version: string;
  readonly methodologyRef: string;
  readonly sourceRefs: readonly string[];
  readonly coordinateFrame: 'normalized_face_landmark_frame';
  readonly regions: readonly FaceRegionDefinition[];
  readonly mappingStatus: ReviewStatus;
}

export interface FaceMetricDefinition {
  readonly metricKey: string;
  readonly version: string;
  readonly methodologyRef: string;
  readonly regionMapRef?: string;
  readonly sourceRefs: readonly string[];
  readonly formula: string;
  readonly requiredAnchorRefs: readonly string[];
  readonly extractorLandmarkRefs?: readonly number[];
  readonly unit: FaceMetricUnit;
  readonly stabilityRequirements: readonly string[];
  readonly reviewStatus: ReviewStatus;
}

export interface FaceOperationalizationDefinition {
  readonly operationalizationId: string;
  readonly methodologyRef: string;
  readonly sourceRefs: readonly string[];
  readonly traditionalTerm: string;
  readonly inputMetricRefs: readonly string[];
  readonly classificationBands: unknown;
  readonly reviewStatus: ReviewStatus;
}

export type FaceRuleExpression =
  | { readonly op: 'eq'; readonly input: string; readonly value: unknown }
  | { readonly op: 'in'; readonly input: string; readonly values: readonly unknown[] }
  | { readonly op: 'lt' | 'lte' | 'gt' | 'gte'; readonly input: string; readonly value: number }
  | { readonly op: 'between'; readonly input: string; readonly min: number; readonly max: number }
  | { readonly op: 'exists'; readonly input: string }
  | { readonly op: 'not'; readonly expression: FaceRuleExpression }
  | { readonly op: 'and' | 'or'; readonly expressions: readonly FaceRuleExpression[] };

export interface FaceRuleInputRequirement {
  readonly inputKey: string;
  readonly sourceType: 'metric' | 'operationalization' | 'claim';
  readonly ref: string;
  readonly required: boolean;
}

export interface FaceClaimTemplate {
  readonly claimType: string;
  readonly semanticKey: string;
  readonly axis?: string;
  readonly pattern?: string;
  readonly salience?: DiagnosticSalience;
  readonly disposition?: TraditionalDisposition;
}

export interface FaceRuleDefinition {
  readonly ruleId: string;
  readonly version: string;
  readonly methodologyRef: string;
  readonly sourceRefs: readonly string[];
  readonly tier: FaceTier;
  readonly inputs: readonly FaceRuleInputRequirement[];
  readonly condition: FaceRuleExpression;
  readonly output: FaceClaimTemplate;
  readonly rationale: string;
  readonly limitations: readonly string[];
  readonly promotionStatus: ReviewStatus;
}

export interface FaceClaimTypeDefinition {
  readonly claimType: string;
  readonly valueSchemaRef: string;
  readonly allowedTiers: readonly FaceTier[];
  readonly materialForNarrative: boolean;
  readonly dynamicAppearance: boolean;
  readonly requiresMethodAttribution: boolean;
  readonly comparisonGroups?: readonly string[];
}

export interface FaceComparisonGroup {
  readonly groupKey: string;
  readonly eligibleClaimTypes: readonly string[];
  readonly comparisonMode: ComparisonMode;
  readonly orderingRuleRef?: string;
  readonly sourceRefs?: readonly string[];
}

export interface FaceComparisonPolicy {
  readonly policyId: string;
  readonly version: string;
  readonly groups: readonly FaceComparisonGroup[];
}

export interface FaceMethodologyPackDefinition {
  readonly packId: string;
  readonly version: string;
  readonly sourceWitnessSetRef: string;
  readonly methodologyDefinitionRefs: readonly string[];
  readonly regionMapRefs: readonly string[];
  readonly metricRegistryRef: string;
  readonly operationalizationRegistryRef: string;
  readonly claimTypeRegistryRef: string;
  readonly ruleRegistryRef: string;
  readonly comparisonPolicyRef: string;
  readonly enabledTiers: readonly FaceTier[];
  readonly forbiddenObservationInputs: readonly string[];
}

export interface SharedFaceObservationBundleV3 {
  readonly schemaVersion: string;
  readonly capabilityVersion: string;
  readonly extractorVersion: string;
  readonly modelVersion: string;
  readonly eligibility: {
    readonly status: 'eligible' | 'section_limited' | 'ineligible';
    readonly humanFaceCount: number | null;
    readonly reasons: readonly string[];
  };
  readonly quality: {
    readonly pose: {
      readonly yaw?: number;
      readonly pitch?: number;
      readonly roll?: number;
    };
    readonly sharpness?: string;
    readonly exposure?: string;
    readonly lighting?: string;
    readonly occludedRegions: readonly string[];
  };
  readonly geometry: {
    readonly metrics: readonly {
      readonly metricKey: string;
      readonly metricVersion: string;
      readonly value: number;
      readonly unit: FaceMetricUnit;
      readonly confidence: number;
      readonly viewAgreement?: number;
      readonly sourceLandmarks?: readonly number[];
    }[];
  };
  readonly observations: {
    readonly outline?: unknown;
    readonly verticalBalance?: unknown;
    readonly eyes?: unknown;
    readonly featureLayout?: unknown;
    readonly visualLanguage?: unknown;
    readonly colorAppearance?: unknown;
  };
  readonly evidenceRefs: readonly string[];
}

export interface MyeongHaStaticFaceObservation {
  readonly schemaVersion: string;
  readonly capabilityVersion: string;
  readonly extractorVersion: string;
  readonly modelVersion: string;
  readonly observationState: FaceObservationState;
  readonly geometry: SharedFaceObservationBundleV3['geometry'];
  readonly observations: Omit<SharedFaceObservationBundleV3['observations'], 'colorAppearance'>;
  readonly unavailableRegions: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export interface FaceClaim {
  readonly claimRef: string;
  readonly claimType: string;
  readonly tier: FaceTier;
  readonly methodologyRef: string;
  readonly sourceRefs: readonly string[];
  readonly semanticKey: string;
  readonly axis?: string;
  readonly pattern?: string;
  readonly salience?: DiagnosticSalience;
  readonly disposition?: TraditionalDisposition;
}

export interface FaceModuleProjection {
  readonly moduleKey: string;
  readonly claimRefs: readonly string[];
  readonly comparisonPolicyGroup?: string;
}

export interface FaceLensProjection {
  readonly lensKey: string;
  readonly claimRefs: readonly string[];
}

export interface FaceVerdictSemantic {
  readonly semanticKey: string;
  readonly claimRefs: readonly string[];
}

export interface ProductFaceReadingSemanticV3 {
  readonly readingRef: string;
  readonly engineVersion: string;
  readonly methodologyPackRef: string;
  readonly sourceSnapshotRef: string;
  readonly observationState: FaceObservationState;
  readonly diagnosisResolution: FaceDiagnosisResolution;
  readonly verdict: FaceVerdictSemantic;
  readonly modules: {
    readonly threeDivisions?: FaceModuleProjection;
    readonly fiveOfficers?: FaceModuleProjection;
    readonly twelvePalaces?: FaceModuleProjection;
    readonly dominantFeatures?: FaceModuleProjection;
    readonly tensions?: FaceModuleProjection;
    readonly typeDiagnosis?: FaceModuleProjection;
  };
  readonly lenses: readonly FaceLensProjection[];
  readonly unavailableSections: readonly string[];
  readonly prohibitedInferences: readonly string[];
}

export interface CharacterFaceGrounding {
  readonly groundingVersion: string;
  readonly faceReadingRef: string;
  readonly faceEngineVersion: string;
  readonly methodologyPackRef: string;
  readonly semanticClaims: readonly {
    readonly key: string;
    readonly axis?: string;
    readonly pattern?: string;
    readonly claimRef: string;
  }[];
  readonly approvedNarrativeBlocks?: readonly {
    readonly key: string;
    readonly text: string;
  }[];
  readonly unavailableSections: readonly string[];
  readonly prohibitedInferences: readonly string[];
}

export interface FaceAuthorityRegistry {
  readonly works: readonly SourceWork[];
  readonly witnesses: readonly SourceWitness[];
  readonly passages: readonly SourcePassage[];
  readonly lineage: readonly SourceLineageRelation[];
  readonly methodologies: readonly FaceMethodologyDefinition[];
  readonly conflicts: readonly FaceAuthorityConflictDefinition[];
  readonly regionMaps: readonly FaceRegionMapDefinition[];
  readonly metrics: readonly FaceMetricDefinition[];
  readonly operationalizations: readonly FaceOperationalizationDefinition[];
  readonly claimTypes: readonly FaceClaimTypeDefinition[];
  readonly rules: readonly FaceRuleDefinition[];
  readonly comparisonPolicies: readonly FaceComparisonPolicy[];
  readonly methodologyPacks: readonly FaceMethodologyPackDefinition[];
}
