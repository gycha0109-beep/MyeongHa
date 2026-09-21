import type { SajuDomain } from '../../../packages/contracts/src/index.js';
import type {
  OfficialReadingCharacterGroundingProjectionInputV1,
  OfficialReadingCharacterGroundingProjectionPortV1,
} from './reader-interpretation-preview-runtime-v1.js';

export interface SajuCharacterGroundingBuilderInputV1 {
  readonly response: unknown;
  readonly engineVersion: string;
  readonly readingDomain: SajuDomain;
}

export interface SajuCharacterGroundingBuilderPortV1 {
  buildCharacterGroundingBundleV1(
    input: SajuCharacterGroundingBuilderInputV1,
  ): unknown;
}

export class SajuCharacterGroundingProjectionAdapterErrorV1 extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'SajuCharacterGroundingProjectionAdapterErrorV1';
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SajuCharacterGroundingProjectionAdapterErrorV1(
      'Saju Character grounding builder returned a non-object bundle.',
    );
  }
  return value as Record<string, unknown>;
}

function assertProjectionIdentity(
  input: OfficialReadingCharacterGroundingProjectionInputV1,
  candidate: unknown,
): void {
  const bundle = requireRecord(candidate);
  if (
    bundle.readingRef !== input.readingId ||
    bundle.productResponseVersion !== input.readingContractVersion ||
    bundle.engineVersion !== input.sajuEngineVersion ||
    bundle.readingDomain !== input.sajuDomain
  ) {
    throw new SajuCharacterGroundingProjectionAdapterErrorV1(
      'Saju Character grounding bundle identity does not match the authorized Official Reading source.',
    );
  }
}

/**
 * Narrow adapter from MyeongHa's Official Reading authority into Saju's
 * source-owned buildCharacterGroundingBundleV1 contract.
 *
 * The committed DB artifact hash is intentionally not compared with Saju's
 * sourceResponseHash. They are different provenance contracts: the former is
 * opaque storage provenance, while the latter is computed by Saju from the
 * admitted ProductReadingResponse content.
 */
export function createSajuCharacterGroundingProjectionAdapterV1(
  builder: SajuCharacterGroundingBuilderPortV1,
): OfficialReadingCharacterGroundingProjectionPortV1 {
  if (typeof builder.buildCharacterGroundingBundleV1 !== 'function') {
    throw new SajuCharacterGroundingProjectionAdapterErrorV1(
      'Saju Character grounding builder is required.',
    );
  }

  return Object.freeze({
    projectGrounding(
      input: OfficialReadingCharacterGroundingProjectionInputV1,
    ): unknown {
      const candidate = builder.buildCharacterGroundingBundleV1(
        Object.freeze({
          response: input.responseSnapshotJsonb,
          engineVersion: input.sajuEngineVersion,
          readingDomain: input.sajuDomain,
        }),
      );
      assertProjectionIdentity(input, candidate);
      return candidate;
    },
  });
}
