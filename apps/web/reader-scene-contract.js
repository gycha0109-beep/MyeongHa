import { resolveCanonicalCharacterPresentationV1 } from './character-presentation-identity.js';
import { normalizeSajuDomainV1 } from './saju-domain-contract.js';

export const READER_SCENE_SCHEMA_VERSION_V1 =
  'myeongha-reader-interpretation-preview-http-v1';

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const FALLBACK_REASONS_V1 = new Set([
  'renderer_protected_fallback',
  'semantic_guard_failed',
]);

const SEGMENT_KINDS_V1 = new Set([
  'semantic_realization',
  'character_reaction',
  'follow_up_question',
  'protected_disclosure',
]);

export class ReaderSceneContractErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReaderSceneContractErrorV1';
    this.code = 'WEB_READER_SCENE_MALFORMED_RESPONSE';
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, field, maxLength = 512) {
  if (typeof value !== 'string') {
    throw new ReaderSceneContractErrorV1(field + ' must be a string.');
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ReaderSceneContractErrorV1(field + ' is outside the supported bounds.');
  }
  return normalized;
}

function requireUuid(value, field) {
  const normalized = requireString(value, field, 36);
  if (!UUID_V1.test(normalized)) {
    throw new ReaderSceneContractErrorV1(field + ' must be a UUID.');
  }
  return normalized;
}

function requireSajuDomain(value, field) {
  const normalized = normalizeSajuDomainV1(value);
  if (normalized === null) {
    throw new ReaderSceneContractErrorV1(field + ' is unsupported.');
  }
  return normalized;
}

function assertExactKeys(record, allowed, field) {
  const unexpected = Object.keys(record).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new ReaderSceneContractErrorV1(
      field + ' contains unexpected field: ' + unexpected + '.',
    );
  }
}

function requireSegmentKind(value, field) {
  const normalized = requireString(value, field, 128);
  if (!SEGMENT_KINDS_V1.has(normalized)) {
    throw new ReaderSceneContractErrorV1(field + ' is unsupported.');
  }
  return normalized;
}

function parseSegments(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReaderSceneContractErrorV1('utterance.segments must be a non-empty array.');
  }

  return Object.freeze(value.map((segment, index) => {
    if (!isRecord(segment)) {
      throw new ReaderSceneContractErrorV1(
        'utterance.segments[' + index + '] must be an object.',
      );
    }
    assertExactKeys(
      segment,
      new Set(['kind', 'text']),
      'utterance.segments[' + index + ']',
    );
    return Object.freeze({
      kind: requireSegmentKind(segment.kind, 'utterance.segments[' + index + '].kind'),
      text: requireString(segment.text, 'utterance.segments[' + index + '].text', 10000),
    });
  }));
}

export function parseReaderSceneEnvelopeV1(payload) {
  if (!isRecord(payload)) {
    throw new ReaderSceneContractErrorV1('Reader Scene response must be an object.');
  }

  const schemaVersion = requireString(payload.schemaVersion, 'schemaVersion', 128);
  if (schemaVersion !== READER_SCENE_SCHEMA_VERSION_V1) {
    throw new ReaderSceneContractErrorV1('Reader Scene schemaVersion is unsupported.');
  }
  if (payload.lifecycle !== 'preview') {
    throw new ReaderSceneContractErrorV1('Reader Scene lifecycle is unsupported.');
  }

  const mode = requireString(payload.mode, 'mode', 64);
  const common = {
    schemaVersion,
    lifecycle: 'preview',
    mode,
    officialReadingId: requireUuid(payload.officialReadingId, 'officialReadingId'),
    readerCharacterId: requireString(payload.readerCharacterId, 'readerCharacterId'),
    domain: requireSajuDomain(payload.domain, 'domain'),
    interpretationHash: requireString(payload.interpretationHash, 'interpretationHash', 512),
  };

  if (mode === 'reader_interpretation') {
    assertExactKeys(
      payload,
      new Set([
        'schemaVersion',
        'lifecycle',
        'mode',
        'officialReadingId',
        'readerCharacterId',
        'domain',
        'interpretationHash',
        'utterance',
      ]),
      'Reader Scene response',
    );

    if (!isRecord(payload.utterance)) {
      throw new ReaderSceneContractErrorV1('utterance must be an object.');
    }
    assertExactKeys(
      payload.utterance,
      new Set(['characterId', 'requestedDomain', 'segments']),
      'utterance',
    );

    const characterId = requireString(payload.utterance.characterId, 'utterance.characterId');
    const requestedDomain = requireSajuDomain(
      payload.utterance.requestedDomain,
      'utterance.requestedDomain',
    );
    if (characterId !== common.readerCharacterId) {
      throw new ReaderSceneContractErrorV1(
        'Reader Scene utterance character does not match server Reader identity.',
      );
    }
    if (requestedDomain !== common.domain) {
      throw new ReaderSceneContractErrorV1(
        'Reader Scene utterance domain does not match server domain.',
      );
    }

    return Object.freeze({
      ...common,
      mode: 'reader_interpretation',
      utterance: Object.freeze({
        characterId,
        requestedDomain,
        segments: parseSegments(payload.utterance.segments),
      }),
    });
  }

  if (mode === 'protected_fallback') {
    assertExactKeys(
      payload,
      new Set([
        'schemaVersion',
        'lifecycle',
        'mode',
        'officialReadingId',
        'readerCharacterId',
        'domain',
        'interpretationHash',
        'fallbackReason',
      ]),
      'Reader Scene response',
    );
    const fallbackReason = requireString(payload.fallbackReason, 'fallbackReason', 128);
    if (!FALLBACK_REASONS_V1.has(fallbackReason)) {
      throw new ReaderSceneContractErrorV1('Reader Scene fallbackReason is unsupported.');
    }
    return Object.freeze({
      ...common,
      mode: 'protected_fallback',
      fallbackReason,
    });
  }

  throw new ReaderSceneContractErrorV1('Reader Scene mode is unsupported.');
}

function genericPresentation() {
  return Object.freeze({
    name: '대리자',
    title: '',
    intro: '',
    generic: true,
  });
}

function readerPresentation(readerCharacterId) {
  const identity = resolveCanonicalCharacterPresentationV1(readerCharacterId);
  if (!identity) return genericPresentation();
  return Object.freeze({
    name: identity.name,
    title: identity.title,
    intro: '',
    generic: false,
  });
}

export function projectReaderSceneViewModelV1(scene) {
  const presentation = readerPresentation(scene.readerCharacterId);

  const common = {
    readerCharacterId: scene.readerCharacterId,
    presentation,
    officialReadingId: scene.officialReadingId,
    domain: scene.domain,
    interpretationHash: scene.interpretationHash,
  };

  return scene.mode === 'reader_interpretation'
    ? Object.freeze({
        ...common,
        state: 'ready',
        segments: scene.utterance.segments,
      })
    : Object.freeze({
        ...common,
        state: 'protected_fallback',
        fallbackReason: scene.fallbackReason,
        segments: Object.freeze([]),
      });
}
