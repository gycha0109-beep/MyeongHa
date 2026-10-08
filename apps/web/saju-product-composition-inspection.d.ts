export const SAJU_PRODUCT_COMPOSITION_INSPECTION_VERSION_V1:
  'myeongha-saju-product-composition-inspection-v1';

export type SajuProductCompositionInspectionSlotV1 = Readonly<{
  slotId: string;
  requirement: 'required' | 'optional';
  routeSearch: string;
}>;

export type SajuProductCompositionInspectionManifestV1 = Readonly<{
  schemaVersion: 'v1';
  productId: string;
  productVersion: string;
  mode: 'inspection_only';
  slots: readonly SajuProductCompositionInspectionSlotV1[];
}>;

export type SajuProductCompositionInspectionRequestV1 = Readonly<{
  slotId: string;
  requirement: 'required' | 'optional';
  domain: string;
  readingText: string;
  targetPersonRef?: string;
  adapterVersion: string;
  mappingVersion: string;
}>;

export type SajuProductCompositionInspectionResultV1 = Readonly<{
  inspectionVersion: typeof SAJU_PRODUCT_COMPOSITION_INSPECTION_VERSION_V1;
  state: 'blocked' | 'requires_input' | 'request_projection_complete';
  reason?: string;
  productId?: string;
  productVersion?: string;
  requests: readonly SajuProductCompositionInspectionRequestV1[];
  omittedOptionalSlots: readonly Readonly<{
    slotId: string;
    reason: 'requires_input';
    input: string;
  }>[];
  requiredInputs: readonly Readonly<{
    slotId: string;
    input: string;
  }>[];
  releaseAuthorization: 'NOT_EVALUATED';
  canPublish: false;
  canSell: false;
  canExecute: false;
}>;

export const SAJU_PRODUCT_COMPOSITION_RESEARCH_FIXTURES_V1: Readonly<{
  generalNatal: SajuProductCompositionInspectionManifestV1;
  seyeonReunion: SajuProductCompositionInspectionManifestV1;
}>;

export function inspectSajuProductCompositionV1(
  manifest: unknown,
  contextsBySlot?: Record<string, {
    readonly familyScope?: 'parents' | 'children';
    readonly targetPersonRef?: string;
    readonly question?: string;
  }>,
): SajuProductCompositionInspectionResultV1;
