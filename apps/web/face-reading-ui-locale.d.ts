export type FaceReadingUiPhaseV1 =
  | 'idle' | 'ready' | 'loading' | 'invalid-file' | 'read-error' | 'invalid-image' | 'image-error';

export interface FaceReadingUiInputV1 {
  readerKey: string;
  readerFallback?: string;
  phase?: FaceReadingUiPhaseV1;
  fileName?: string;
  fileSize?: number;
}

export interface FaceReadingUiStateV1 {
  description: string;
  analyzeLabel: string;
  statusTitle: string;
  statusCopy: string;
  fileName: string;
  fileMeta: string;
}

export declare function faceReadingUiStateV1(input: FaceReadingUiInputV1, locale?: string): FaceReadingUiStateV1;
