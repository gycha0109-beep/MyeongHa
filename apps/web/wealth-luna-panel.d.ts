export interface VerifiedWealthLunaReaderChapterV1 {
  readonly index: number;
  readonly title: string;
  readonly paragraphs: readonly string[];
}
export interface VerifiedWealthLunaNarrationV1 {
  readonly readingId: string;
  readonly sourceHash: string;
  readonly chapters: readonly VerifiedWealthLunaReaderChapterV1[];
}
export function parseVerifiedWealthLunaNarrationV1(
  candidate: unknown,
  readingId: string,
): VerifiedWealthLunaNarrationV1;
export function mountVerifiedWealthLunaPanelV1(
  panel: Element | null,
  record: unknown,
  resolveBearer: () => Promise<{kind:string;token:string} | null>,
  isCurrent: () => boolean,
  fetchImpl?: typeof fetch,
): () => void;
