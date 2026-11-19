import { createHash } from 'node:crypto';
import {
  CHARACTER_RUNTIME_AUTHORING_V1,
  findReadingPublicTrustLanguageViolationV1,
} from '../../../packages/character-content/src/index.js';
import type { OfficialReadingRecordV1 } from './official-reading-record-read.js';
import { getSajuProductChapterBlueprintV1 } from '../../../packages/domain/src/saju-product-chapter-blueprints-v1.js';

export const OFFICIAL_WEALTH_LUNA_READER_VERSION_V1 =
  'myeongha-official-wealth-luna-reader-v1' as const;
export const OFFICIAL_WEALTH_LUNA_MODEL_ID_V1 = 'gpt-6-luna' as const;

export interface OfficialWealthLunaSourceChapterV1 {
  readonly index: number;
  readonly title: string;
  readonly excerpts: readonly string[];
}
export interface OfficialWealthLunaSourceV1 {
  readonly version: typeof OFFICIAL_WEALTH_LUNA_READER_VERSION_V1;
  readonly readingId: string;
  readonly readerCharacterId: 'taegyeom';
  readonly sourceHash: string;
  readonly chapters: readonly OfficialWealthLunaSourceChapterV1[];
  readonly limitations: readonly string[];
  readonly voice: Readonly<{
    register: string;
    sentenceRhythm: string;
    interpretationStyle: string;
    prohibited: readonly string[];
  }>;
}
export interface OfficialWealthLunaNarrativeV1 {
  readonly version: typeof OFFICIAL_WEALTH_LUNA_READER_VERSION_V1;
  readonly readingId: string;
  readonly sourceHash: string;
  readonly renderer: 'source_bound_model_supplement';
  readonly model: typeof OFFICIAL_WEALTH_LUNA_MODEL_ID_V1;
  readonly originalReadingUnchanged: true;
  readonly chapters: readonly Readonly<{
    index: number;
    title: string;
    sourceAnchor: string;
    paragraphs: readonly string[];
  }>[];
}
export interface AuthorizedOfficialWealthLunaWriterPortV1 {
  readonly model: typeof OFFICIAL_WEALTH_LUNA_MODEL_ID_V1;
  /** The adapter must check an active published Taegyeom content pin,
   * current grant, cost reservation, idempotency and protected persistence.
   * The Source below is built solely from a freshly owner-verified DB record. */
  readonly readOrCreateValidated: (input: Readonly<{
    source: OfficialWealthLunaSourceV1;
    idempotencyKey: string;
    validateDraft: (raw: unknown) => OfficialWealthLunaNarrativeV1;
  }>) => Promise<OfficialWealthLunaNarrativeV1>;
}
function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim() : null;
}
function blockExcerpts(block: unknown): readonly string[] {
  if (!record(block)) return [];
  if (block.type === 'source_hint') return [];
  if (block.type === 'paragraph') return nonempty(block.text) === null
    ? [] : [nonempty(block.text)!];
  if (block.type === 'key_points' && Array.isArray(block.items)) {
    return block.items.flatMap(item => nonempty(item) === null ? [] : [nonempty(item)!]);
  }
  if (block.type === 'insights' && Array.isArray(block.items)) {
    return block.items.flatMap(item => record(item)
      ? [nonempty(item.headline), nonempty(item.summary)].filter((v): v is string => v !== null)
      : []);
  }
  if (block.type === 'comparison' && Array.isArray(block.perspectives)) {
    return block.perspectives.flatMap(item =>
      record(item) && nonempty(item.text) !== null ? [nonempty(item.text)!] : []);
  }
  if (block.type === 'ambiguity') {
    return [
      ...(nonempty(block.summary) === null ? [] : [nonempty(block.summary)!]),
      ...(Array.isArray(block.scenarios) ? block.scenarios.flatMap(item =>
        record(item) && nonempty(item.text) !== null ? [nonempty(item.text)!] : []) : []),
    ];
  }
  return [];
}
function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
const PROHIBITED_NEW_PREDICTION = /(?:확실히|반드시|무조건|틀림없이).{0,36}(?:부자|수익|돈을 벌|재산|투자|승진)|(?:로또|주식|코인|투자).{0,35}(?:오른다|급등|대박|벌게 됩니다)|(?:20\d\d년|내년|다음 달).{0,32}(?:큰돈|횡재|부자가)/u;
const MAX_CHAPTERS = 7;
const MAX_PARAGRAPH = 1300;

export function buildOfficialWealthLunaSourceV1(
  issuedRecord: OfficialReadingRecordV1,
): OfficialWealthLunaSourceV1 | null {
  if (issuedRecord.approvedComponent !== 'wealth' ||
      issuedRecord.sajuDomain !== 'wealth' ||
      issuedRecord.productResponseState !== 'delivered' ||
      issuedRecord.readerCharacterIds.length !== 1 ||
      issuedRecord.readerCharacterIds[0] !== 'taegyeom' ||
      !record(issuedRecord.reading) ||
      issuedRecord.reading.state !== 'delivered' ||
      !record(issuedRecord.reading.reading)) return null;
  const official = issuedRecord.reading.reading;
  if (official.readingId !== issuedRecord.readingId ||
      !Array.isArray(official.sections) ||
      official.sections.length === 0 ||
      official.sections.length > 28) return null;
  const chapters: OfficialWealthLunaSourceChapterV1[] = [];
  const limitations: string[] = [];
  for (const raw of official.sections) {
    if (!record(raw) || raw.state !== 'complete' ||
        nonempty(raw.title) === null || !Array.isArray(raw.blocks)) return null;
    const excerpts = raw.blocks.flatMap(blockExcerpts).slice(0, 16)
      .map(item => item.slice(0, 2700));
    if (raw.title === '해석 범위' || raw.sectionType === 'custom' &&
        String(raw.title).includes('제한')) {
      limitations.push(...excerpts);
      continue;
    }
    if (excerpts.length === 0) continue;
    chapters.push(Object.freeze({
      index: chapters.length,
      title: nonempty(raw.title)!,
      excerpts: Object.freeze(excerpts),
    }));
  }
  if (chapters.length < 2 || chapters.length > MAX_CHAPTERS) return null;
  const taegyeom = CHARACTER_RUNTIME_AUTHORING_V1.find(
    candidate => candidate.characterId === 'taegyeom');
  if (taegyeom === undefined) return null;
  const voice = Object.freeze({
    register: taegyeom.speech.register,
    sentenceRhythm: taegyeom.speech.sentenceRhythm,
    interpretationStyle: taegyeom.sajuProfile.framingStyle,
    prohibited: Object.freeze([
      '새 명리 사실·Claim·명식 계산·수입/투자 결과·금전 사건 시기를 만들지 않습니다.',
      '기존 공식 보고서의 뜻·조건·불확실성을 뒤집거나 자산 규모를 단정하지 않습니다.',
      '태겸이 고객을 모욕하거나 결정을 강요하지 않습니다.',
    ]),
  });
  const material = {readingId:issuedRecord.readingId, chapters,limitations,voice};
  return Object.freeze({
    version: OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
    readingId: issuedRecord.readingId,
    readerCharacterId: 'taegyeom' as const,
    sourceHash: sha256(material),
    chapters: Object.freeze(chapters),
    limitations: Object.freeze(limitations),
    voice,
  });
}

export function validateOfficialWealthLunaDraftV1(
  source: OfficialWealthLunaSourceV1,
  raw: unknown,
): OfficialWealthLunaNarrativeV1 {
  if (!record(raw) || !Array.isArray(raw.chapters) ||
      raw.chapters.length !== source.chapters.length ||
      Object.keys(raw).some(key => key !== 'chapters')) {
    throw new TypeError('Luna Wealth draft must contain all source-bound chapters');
  }
  const isNotionSixChapterProduct =
    source.chapters.length === 6 &&
    source.chapters.every((chapter, index) =>
      chapter.title === getSajuProductChapterBlueprintV1('wealth')[index]?.fixedTitle);
  const chapters = raw.chapters.map((item, index) => {
    const original = source.chapters[index]!;
    if (!record(item) || Object.keys(item).some(key =>
        !['index','title','sourceAnchor','paragraphs'].includes(key)) ||
        item.index !== original.index ||
        item.title !== original.title ||
        typeof item.sourceAnchor !== 'string' ||
        item.sourceAnchor.length < 12 ||
        !original.excerpts.some(excerpt => excerpt.includes(item.sourceAnchor as string)) ||
        !Array.isArray(item.paragraphs) ||
        item.paragraphs.length < (isNotionSixChapterProduct ? 3 : 2) ||
        item.paragraphs.length > (isNotionSixChapterProduct ? 5 : 4) ||
        !item.paragraphs.every(p => typeof p === 'string' &&
          p.trim().length >= (isNotionSixChapterProduct ? 140 : 80) &&
          p.length <= MAX_PARAGRAPH)) {
      throw new TypeError('Luna Wealth chapter is not grounded in its issued source');
    }
    const paragraphs = item.paragraphs.map(p => (p as string).trim());
    if(isNotionSixChapterProduct && (
      item.sourceAnchor.length < 20 ||
      ['승인 의미 [','근거 블록:', '적용 조건:', '금지 확장:'].some(
        marker => item.sourceAnchor.includes(marker)
      ) || new Set(paragraphs).size !== paragraphs.length
    )) {
      throw new TypeError('Six-chapter product requires unique, meaning-anchored paragraphs');
    }
    if (!paragraphs.some(p => p.includes(item.sourceAnchor as string)) ||
        paragraphs.some(p => PROHIBITED_NEW_PREDICTION.test(p) ||
          findReadingPublicTrustLanguageViolationV1(p) !== null)) {
      throw new TypeError('Luna Wealth prose is missing its source anchor or violates the safety boundary');
    }
    return Object.freeze({
      index,
      title: original.title,
      sourceAnchor: item.sourceAnchor,
      paragraphs: Object.freeze(paragraphs),
    });
  });
  if(isNotionSixChapterProduct) {
    const allParagraphs=chapters.flatMap(chapter=>chapter.paragraphs);
    if(new Set(allParagraphs).size !== allParagraphs.length){
      throw new TypeError('Wealth chapters repeat the same text across unrelated questions');
    }
  }
  return Object.freeze({
    version: OFFICIAL_WEALTH_LUNA_READER_VERSION_V1,
    readingId: source.readingId,
    sourceHash: source.sourceHash,
    renderer: 'source_bound_model_supplement' as const,
    model: OFFICIAL_WEALTH_LUNA_MODEL_ID_V1,
    originalReadingUnchanged: true as const,
    chapters: Object.freeze(chapters),
  });
}

export async function createOfficialWealthLunaSupplementFromSourceV1(
  source: OfficialWealthLunaSourceV1,
  writer: AuthorizedOfficialWealthLunaWriterPortV1,
): Promise<OfficialWealthLunaNarrativeV1> {
  if (writer.model !== OFFICIAL_WEALTH_LUNA_MODEL_ID_V1) {
    throw new TypeError('Official Wealth supplementary writer requires published Luna model');
  }
  const idempotencyKey = sha256({
    version:source.version,readingId:source.readingId,sourceHash:source.sourceHash,
    characterId:source.readerCharacterId,model:writer.model,
  });
  const output = await writer.readOrCreateValidated({
    source,
    idempotencyKey,
    validateDraft: raw => validateOfficialWealthLunaDraftV1(source, raw),
  });
  // Do not accept a fabricated success result from an incomplete provider port.
  if (JSON.stringify(output) !== JSON.stringify(validateOfficialWealthLunaDraftV1(
    source, {chapters:output.chapters},
  ))) {
    throw new TypeError('Wealth Luna writer returned an unverified publication');
  }
  return output;
}

/** Legacy bounded source helper for offline integration tests only.
 * Paid six-chapter routes must supply an already verified product source. */
export async function createOfficialWealthLunaSupplementV1(
  record: OfficialReadingRecordV1,
  writer: AuthorizedOfficialWealthLunaWriterPortV1,
): Promise<OfficialWealthLunaNarrativeV1 | null> {
  const source = buildOfficialWealthLunaSourceV1(record);
  if (source === null) return null;
  return createOfficialWealthLunaSupplementFromSourceV1(source, writer);
}
