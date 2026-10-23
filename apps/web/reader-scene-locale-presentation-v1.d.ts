import type { ReaderSceneViewModelV1 } from './reader-scene-contract.js';

export const READER_SCENE_LOCALE_PRESENTATION_VERSION_V1:
  'reader-scene-locale-presentation-v1';

export type ReaderSceneLocalePresentationV1 = ReaderSceneViewModelV1 & Readonly<{
  uiLocale: 'ko-KR' | 'ja-JP' | 'zh-TW';
  contentLanguage: 'source_unasserted';
  localizedReaderOutput: false;
  originalContentPreserved: true;
  localePresentationVersion: typeof READER_SCENE_LOCALE_PRESENTATION_VERSION_V1;
  sourceLanguageNotice: string;
}>;

export function projectReaderSceneLocalePresentationV1(
  viewModel: ReaderSceneViewModelV1,
  requestedUiLocale: string,
): ReaderSceneLocalePresentationV1;
