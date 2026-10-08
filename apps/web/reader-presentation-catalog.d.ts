export interface ReaderPresentationV1 {
  readonly key: 'seyeon' | 'baekheon' | 'yeoul' | 'seorin' | 'rahyeon' | 'mira' | 'taegyeom' | 'yunho' | 'doyun';
  readonly name: string;
  readonly title: string;
  readonly tone: string;
  readonly portrait: string;
}
export const READER_PRESENTATIONS: readonly ReaderPresentationV1[];
export function findReaderPresentation(key: string): ReaderPresentationV1 | null;
