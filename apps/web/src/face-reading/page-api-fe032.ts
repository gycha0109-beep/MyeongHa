import {
  runFacePreviewOneShotFE031,
  type FacePreviewOneShotResultFE031,
} from '../face-preview/one-shot-fe031.js';

export const PHYSIOGNOMY_PAGE_API_VERSION_FE032 =
  'MHA-PHYSIOGNOMY-PAGE-API-FE032-v1' as const;

export interface PhysiognomyPageApiDependenciesFE032 {
  readonly loadEngineModule: () => Promise<unknown>;
  readonly fetchImpl?: typeof fetch;
  readonly runOneShot?: typeof runFacePreviewOneShotFE031;
}

export interface PhysiognomyPageObservationSummaryFE032 {
  readonly availableRegions: number;
  readonly partialRegions: number;
  readonly totalRegions: number;
}

export type PhysiognomyPageAnalysisResultFE032 =
  | Readonly<{
      schemaVersion: 'myeongha-physiognomy-page-analysis-v1';
      contractVersion: typeof PHYSIOGNOMY_PAGE_API_VERSION_FE032;
      status: 'ready';
      observation: PhysiognomyPageObservationSummaryFE032;
      privacy: Readonly<{
        rawInputPersisted: false;
        canonicalImagePersisted: false;
        identityEmbeddingCreated: false;
      }>;
    }>
  | Readonly<{
      schemaVersion: 'myeongha-physiognomy-page-analysis-v1';
      contractVersion: typeof PHYSIOGNOMY_PAGE_API_VERSION_FE032;
      status: 'rejected';
      reason:
        | 'image'
        | 'face'
        | 'engine'
        | 'lifecycle'
        | 'unknown';
    }>;

export interface PhysiognomyPageApiFE032 {
  readonly contractVersion: typeof PHYSIOGNOMY_PAGE_API_VERSION_FE032;
  readonly analyze: (blob: Blob) => Promise<PhysiognomyPageAnalysisResultFE032>;
}

function mapReason(
  result: Extract<FacePreviewOneShotResultFE031, { status: 'rejected' }>,
): Extract<PhysiognomyPageAnalysisResultFE032, { status: 'rejected' }>['reason'] {
  if (result.rejection.stage === 'intake') return 'image';
  if (result.rejection.code === 'NO_FACE_DETECTED') return 'face';
  if (result.rejection.stage === 'lifecycle') return 'lifecycle';
  if (
    result.rejection.stage === 'open' ||
    result.rejection.code === 'ENGINE_RUNTIME_FAILED'
  ) {
    return 'engine';
  }
  return 'unknown';
}

export function createPhysiognomyPageApiFE032(
  dependencies: PhysiognomyPageApiDependenciesFE032,
): PhysiognomyPageApiFE032 {
  const runOneShot = dependencies.runOneShot ?? runFacePreviewOneShotFE031;

  return Object.freeze({
    contractVersion: PHYSIOGNOMY_PAGE_API_VERSION_FE032,
    async analyze(blob: Blob): Promise<PhysiognomyPageAnalysisResultFE032> {
      if (!(blob instanceof Blob) || blob.size <= 0) {
        return Object.freeze({
          schemaVersion: 'myeongha-physiognomy-page-analysis-v1' as const,
          contractVersion: PHYSIOGNOMY_PAGE_API_VERSION_FE032,
          status: 'rejected' as const,
          reason: 'image' as const,
        });
      }

      const result = await runOneShot({
        schemaVersion: 'myeongha-face-preview-one-shot-input-v1',
        blob,
        loadEngineModule: dependencies.loadEngineModule,
        ...(dependencies.fetchImpl === undefined
          ? {}
          : { fetchImpl: dependencies.fetchImpl }),
      });

      if (result.status === 'rejected') {
        return Object.freeze({
          schemaVersion: 'myeongha-physiognomy-page-analysis-v1' as const,
          contractVersion: PHYSIOGNOMY_PAGE_API_VERSION_FE032,
          status: 'rejected' as const,
          reason: mapReason(result),
        });
      }

      const availableRegions = result.preview.regions.filter(
        (region) => region.state === 'available',
      ).length;
      const partialRegions = result.preview.regions.length - availableRegions;

      return Object.freeze({
        schemaVersion: 'myeongha-physiognomy-page-analysis-v1' as const,
        contractVersion: PHYSIOGNOMY_PAGE_API_VERSION_FE032,
        status: 'ready' as const,
        observation: Object.freeze({
          availableRegions,
          partialRegions,
          totalRegions: result.preview.regions.length,
        }),
        privacy: Object.freeze({
          rawInputPersisted: false as const,
          canonicalImagePersisted: false as const,
          identityEmbeddingCreated: false as const,
        }),
      });
    },
  });
}
