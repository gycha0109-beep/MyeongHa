import { createHash } from 'node:crypto';

export interface ImmutableArtifact<T> {
  readonly key: string;
  readonly version: string;
  readonly contentHash: string;
  readonly payload: Readonly<T>;
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, normalize(record[key])]),
    );
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new TypeError('Immutable registry payload must be JSON-compatible.');
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value as Readonly<T>;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function createImmutableArtifact<T>(
  key: string,
  version: string,
  payload: T,
): ImmutableArtifact<T> {
  const normalizedKey = key.trim();
  const normalizedVersion = version.trim();
  if (normalizedKey.length === 0 || normalizedVersion.length === 0) {
    throw new TypeError('Artifact key and version are required.');
  }
  const normalizedPayload = normalize(payload) as T;
  const digest = createHash('sha256')
    .update(canonicalJson(normalizedPayload))
    .digest('hex');
  return Object.freeze({
    key: normalizedKey,
    version: normalizedVersion,
    contentHash: `sha256:v1:${digest}`,
    payload: deepFreeze(normalizedPayload),
  });
}

export class ImmutableArtifactRegistry<T> {
  readonly #byIdentity = new Map<string, ImmutableArtifact<T>>();

  constructor(artifacts: readonly ImmutableArtifact<T>[]) {
    for (const artifact of artifacts) {
      const identity = `${artifact.key}@${artifact.version}`;
      if (this.#byIdentity.has(identity)) {
        throw new TypeError(`Duplicate immutable artifact identity: ${identity}`);
      }
      const expected = createImmutableArtifact(
        artifact.key,
        artifact.version,
        artifact.payload,
      );
      if (expected.contentHash !== artifact.contentHash) {
        throw new TypeError(`Immutable artifact hash mismatch: ${identity}`);
      }
      this.#byIdentity.set(identity, artifact);
    }
  }

  resolve(key: string, version: string): ImmutableArtifact<T> {
    const identity = `${key}@${version}`;
    const artifact = this.#byIdentity.get(identity);
    if (artifact === undefined) {
      throw new TypeError(`Unknown immutable artifact: ${identity}`);
    }
    return artifact;
  }
}
