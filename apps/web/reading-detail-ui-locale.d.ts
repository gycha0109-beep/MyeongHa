export type ReadingUiLocaleV1 = 'ko-KR' | 'ja-JP' | 'zh-TW' | 'en-US' | 'zh-CN';

export interface ReadingSceneFlagsV1 {
  hasStructure: boolean;
  hasSupporting: boolean;
}

export interface ReadingSceneProgressV1 {
  progress: string;
  structureTitle: string;
  supportingTitle: string;
  nextLabel: string;
  authorityNote: string;
  recordsLinkLabel: string;
}

export interface ReadingRoutePresentationV1 {
  topic: string;
  label: string;
  scope: string;
}

export interface ReadingRouteRequestPresentationV1 {
  state?: string;
  input?: string;
  adapterVersion?: string;
}

export interface ReadingRouteStateCopyV1 {
  scope: string;
  productTitle: string;
  stateTitle: string;
  stateCopy: string;
  documentTitle: string;
}

export declare function readingScopeLabelV1(
  scope: string,
  year: number,
  locale?: ReadingUiLocaleV1 | string,
): string;

export declare function readingSceneProgressV1(
  index: number,
  total: number,
  flags: ReadingSceneFlagsV1,
  isStoredRecord: boolean,
  locale?: ReadingUiLocaleV1 | string,
): ReadingSceneProgressV1;

export declare function readingRouteStateCopyV1(
  route: ReadingRoutePresentationV1,
  engineRequest: ReadingRouteRequestPresentationV1 | null | undefined,
  mode: 'blocked' | 'preview_loading',
  year: number,
  locale?: ReadingUiLocaleV1 | string,
): ReadingRouteStateCopyV1;
