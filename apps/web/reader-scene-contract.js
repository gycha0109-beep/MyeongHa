export const READER_SCENE_SCHEMA_VERSION_V1 =
  'myeongha-reader-interpretation-preview-http-v1';

const FALLBACK_REASONS_V1 = new Set([
  'renderer_protected_fallback',
  'semantic_guard_failed',
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

function assertExactKeys(record, allowed, field) {
  const unexpected = Object.keys(record).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new ReaderSceneContractErrorV1(
      field + ' contains unexpected field: ' + unexpected + '.',
    );
  }
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
      kind: requireString(segment.kind, 'utterance.segments[' + index + '].kind', 128),
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
    officialReadingId: requireString(payload.officialReadingId, 'officialReadingId'),
    readerCharacterId: requireString(payload.readerCharacterId, 'readerCharacterId'),
    domain: requireString(payload.domain, 'domain', 128),
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
    const requestedDomain = requireString(
      payload.utterance.requestedDomain,
      'utterance.requestedDomain',
      128,
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

export function projectReaderSceneViewModelV1(scene) {
  // SRC-36: canonical Reader Character identity and browser presentation identity
  // are separate namespaces. Until a governed bundle-scoped projection exists,
  // Reader Scene remains identity-neutral and cannot accept a browser resolver/hint.
  const presentation = genericPresentation();

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
