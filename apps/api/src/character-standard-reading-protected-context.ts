import {
  hashProtectedSajuTextV1,
  type CharacterSajuRuntimeContextV1,
  type ProtectedSajuDisclosureV1,
  type ProtectedSajuSegmentV1,
} from '../../../packages/domain/src/index.js';
import type { CharacterStandardReadingKnowledgeSourceV1 } from './character-standard-reading-knowledge.js';

export const OFFICIAL_READING_PRODUCT_RESPONSE_VERSION_V1 =
  'myeonghwa-product-reading-response-v2' as const;

export class CharacterStandardReadingProtectedContextErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'CharacterStandardReadingProtectedContextErrorV1';
  }
}

export type CharacterStandardReadingProtectedSajuContextV1 = Omit<
  CharacterSajuRuntimeContextV1,
  'capability'
>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      `${path} must be an object.`,
    );
  }
  return value;
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      `${path} must be an array.`,
    );
  }
  return value;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      `${path} must be non-empty text.`,
    );
  }
  return value;
}

function stableSegmentId(kind: 'segment' | 'disclosure', sourceRef: string): string {
  const normalized = sourceRef
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return `official_reading_${kind}_${normalized}`;
}

function protectedText(
  kind: 'segment' | 'disclosure',
  readingId: string,
  sourceRef: string,
  text: string,
): ProtectedSajuSegmentV1 | ProtectedSajuDisclosureV1 {
  return Object.freeze({
    segmentId: stableSegmentId(kind, sourceRef),
    sourceReadingRef: readingId,
    sourceRef,
    contentHash: hashProtectedSajuTextV1(text),
    text,
  });
}

function joinLabelText(label: unknown, text: unknown, path: string): string {
  return `${requireText(label, `${path}.label`)}: ${requireText(
    text,
    `${path}.text`,
  )}`;
}

function collectBlock(
  blockValue: unknown,
  sourceRef: string,
  readingId: string,
  segments: ProtectedSajuSegmentV1[],
  ambiguity: string[],
): void {
  const block = requireRecord(blockValue, sourceRef);
  const type = requireText(block.type, `${sourceRef}.type`);

  switch (type) {
    case 'paragraph': {
      const text = requireText(block.text, `${sourceRef}.text`);
      segments.push(
        protectedText('segment', readingId, sourceRef, text) as ProtectedSajuSegmentV1,
      );
      return;
    }
    case 'key_points': {
      requireArray(block.items, `${sourceRef}.items`).forEach((item, index) => {
        const itemRef = `${sourceRef}.items.${index}`;
        const text = requireText(item, itemRef);
        segments.push(
          protectedText('segment', readingId, itemRef, text) as ProtectedSajuSegmentV1,
        );
      });
      return;
    }
    case 'comparison': {
      const title = requireText(block.title, `${sourceRef}.title`);
      requireArray(block.perspectives, `${sourceRef}.perspectives`).forEach(
        (perspectiveValue, index) => {
          const perspectiveRef = `${sourceRef}.perspectives.${index}`;
          const perspective = requireRecord(perspectiveValue, perspectiveRef);
          const text = `${title}\n${joinLabelText(
            perspective.label,
            perspective.text,
            perspectiveRef,
          )}`;
          segments.push(
            protectedText(
              'segment',
              readingId,
              perspectiveRef,
              text,
            ) as ProtectedSajuSegmentV1,
          );
        },
      );
      return;
    }
    case 'ambiguity': {
      const summary = requireText(block.summary, `${sourceRef}.summary`);
      const scenarios = requireArray(block.scenarios, `${sourceRef}.scenarios`).map(
        (scenarioValue, index) => {
          const scenarioRef = `${sourceRef}.scenarios.${index}`;
          const scenario = requireRecord(scenarioValue, scenarioRef);
          return joinLabelText(scenario.label, scenario.text, scenarioRef);
        },
      );
      ambiguity.push([summary, ...scenarios].join('\n'));
      return;
    }
    case 'timeline': {
      requireArray(block.entries, `${sourceRef}.entries`).forEach((entryValue, index) => {
        const entryRef = `${sourceRef}.entries.${index}`;
        const entry = requireRecord(entryValue, entryRef);
        const text = joinLabelText(entry.label, entry.text, entryRef);
        segments.push(
          protectedText('segment', readingId, entryRef, text) as ProtectedSajuSegmentV1,
        );
      });
      return;
    }
    case 'fact_table': {
      requireArray(block.rows, `${sourceRef}.rows`).forEach((rowValue, index) => {
        const rowRef = `${sourceRef}.rows.${index}`;
        const row = requireRecord(rowValue, rowRef);
        const text = `${requireText(row.label, `${rowRef}.label`)}: ${requireText(
          row.value,
          `${rowRef}.value`,
        )}`;
        segments.push(
          protectedText('segment', readingId, rowRef, text) as ProtectedSajuSegmentV1,
        );
      });
      return;
    }
    case 'source_hint': {
      const text = requireText(block.text, `${sourceRef}.text`);
      segments.push(
        protectedText('segment', readingId, sourceRef, text) as ProtectedSajuSegmentV1,
      );
      return;
    }
    default:
      throw new CharacterStandardReadingProtectedContextErrorV1(
        `${sourceRef}.type is not supported by the pinned ProductReadingResponse contract.`,
      );
  }
}

function assertUniqueSourceRefs(
  values: readonly (ProtectedSajuSegmentV1 | ProtectedSajuDisclosureV1)[],
): void {
  const refs = values.map((value) => value.sourceRef);
  if (new Set(refs).size !== refs.length) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Official Reading protected context contains duplicate source references.',
    );
  }
}

/**
 * Projects an already server-authorized Official Reading into the legacy
 * exact-text Character Saju context seam.
 *
 * This function never asks the Character/LLM to reinterpret or paraphrase the
 * Official Reading. It only extracts exact user-facing ProductReadingResponse v2
 * text into protected server-injected fields. The caller must still honor the
 * independent Production Saju / Character authority gates before public use.
 */
export function projectOfficialStandardReadingToProtectedCharacterSajuContextV1(
  source: CharacterStandardReadingKnowledgeSourceV1,
): CharacterStandardReadingProtectedSajuContextV1 {
  if (source.readingContractVersion !== OFFICIAL_READING_PRODUCT_RESPONSE_VERSION_V1) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Official Reading contract version is not supported by the Character protected-context projector.',
    );
  }
  if (
    source.productResponseState !== 'delivered' &&
    source.productResponseState !== 'delivered_with_fallback'
  ) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Only delivered Official Readings can enter Character protected context.',
    );
  }

  const response = requireRecord(source.responseSnapshotJsonb, 'ProductReadingResponse');
  const responseVersion = requireText(
    response.responseVersion,
    'ProductReadingResponse.responseVersion',
  );
  const responseState = requireText(response.state, 'ProductReadingResponse.state');
  if (responseVersion !== source.readingContractVersion) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Official Reading snapshot contract version does not match stored provenance.',
    );
  }
  if (responseState !== source.productResponseState) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Official Reading snapshot state does not match stored provenance.',
    );
  }

  const reading = requireRecord(response.reading, 'ProductReadingResponse.reading');
  const readingId = requireText(reading.readingId, 'ProductReadingResponse.reading.readingId');
  if (readingId !== source.readingId) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Official Reading snapshot identity does not match stored Reading identity.',
    );
  }

  const segments: ProtectedSajuSegmentV1[] = [];
  const disclosures: ProtectedSajuDisclosureV1[] = [];
  const ambiguity: string[] = [];

  requireArray(reading.sections, 'ProductReadingResponse.reading.sections').forEach(
    (sectionValue, sectionIndex) => {
      const sectionRef = `response.reading.sections.${sectionIndex}`;
      const section = requireRecord(sectionValue, sectionRef);
      requireText(section.sectionType, `${sectionRef}.sectionType`);
      requireText(section.title, `${sectionRef}.title`);
      requireArray(section.blocks, `${sectionRef}.blocks`).forEach(
        (block, blockIndex) => {
          collectBlock(
            block,
            `${sectionRef}.blocks.${blockIndex}`,
            readingId,
            segments,
            ambiguity,
          );
        },
      );
    },
  );

  requireArray(reading.disclosures, 'ProductReadingResponse.reading.disclosures').forEach(
    (disclosureValue, index) => {
      const disclosureRef = `response.reading.disclosures.${index}`;
      const disclosure = requireRecord(disclosureValue, disclosureRef);
      requireText(disclosure.type, `${disclosureRef}.type`);
      const text = requireText(disclosure.text, `${disclosureRef}.text`);
      disclosures.push(
        protectedText(
          'disclosure',
          readingId,
          disclosureRef,
          text,
        ) as ProtectedSajuDisclosureV1,
      );
    },
  );

  const calculationSummary = requireRecord(
    reading.calculationSummary,
    'ProductReadingResponse.reading.calculationSummary',
  );
  if (calculationSummary.ambiguity !== undefined) {
    requireArray(
      calculationSummary.ambiguity,
      'ProductReadingResponse.reading.calculationSummary.ambiguity',
    ).forEach((itemValue, index) => {
      const itemRef = `response.reading.calculationSummary.ambiguity.${index}`;
      const item = requireRecord(itemValue, itemRef);
      ambiguity.push(
        `${requireText(item.title, `${itemRef}.title`)}\n${requireText(
          item.summary,
          `${itemRef}.summary`,
        )}`,
      );
    });
  }

  if (segments.length === 0 && disclosures.length === 0 && ambiguity.length === 0) {
    throw new CharacterStandardReadingProtectedContextErrorV1(
      'Delivered Official Reading contains no protected Character-consumable content.',
    );
  }

  assertUniqueSourceRefs([...segments, ...disclosures]);

  return Object.freeze({
    readingRef: readingId,
    domain: source.sajuDomain,
    coverageState:
      source.productResponseState === 'delivered' ? 'complete' : 'partial',
    protectedSegments: Object.freeze(segments),
    disclosures: Object.freeze(disclosures),
    ambiguity: Object.freeze(ambiguity),
  });
}
