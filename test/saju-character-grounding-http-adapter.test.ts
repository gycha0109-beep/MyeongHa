import { describe, expect, it } from 'vitest';

import {
  SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1,
  SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
  SajuCharacterGroundingHttpAdapterErrorV1,
  createProductionSajuCharacterGroundingProjectionPortV1,
  createSajuCharacterGroundingHttpAdapterV1,
} from '../apps/api/src/saju-character-grounding-http-adapter.js';
import type {
  SajuProductionCalculationHttpFetchV1,
  SajuProductionCalculationHttpRequestInitV1,
  SajuProductionCalculationHttpResponseV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';
import type {
  OfficialReadingCharacterGroundingProjectionInputV1,
} from '../apps/api/src/reader-interpretation-preview-runtime-v1.js';

const projectionInput: OfficialReadingCharacterGroundingProjectionInputV1 = {
  readingId: 'official-reading-1',
  readingContractVersion: 'myeonghwa-product-reading-response-v2',
  productResponseState: 'delivered',
  responseSnapshotJsonb: {
    responseVersion: 'myeonghwa-product-reading-response-v2',
    state: 'delivered',
    reading: { readingId: 'official-reading-1' },
  },
  officialArtifactResponseHash: 'sha256:opaque-db-artifact',
  sajuEngineVersion: 'saju-engine-v1',
  sajuDomain: 'general',
};

function groundingCandidate(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
    groundingProjectionVersion: 'myeonghwa-character-grounding-projection-v1',
    axisRegistryVersion: 'myeonghwa-grounding-axis-v1',
    readingRef: projectionInput.readingId,
    productResponseVersion: projectionInput.readingContractVersion,
    engineVersion: projectionInput.sajuEngineVersion,
    readingDomain: projectionInput.sajuDomain,
    sourceResponseHash: 'a'.repeat(64),
    groundingHash: 'b'.repeat(64),
    units: [],
    disclosures: [],
    ambiguities: [],
    ...overrides,
  };
}

function httpResponse(input: {
  readonly status?: number;
  readonly payload?: unknown;
  readonly headers?: Record<string, string>;
} = {}): SajuProductionCalculationHttpResponseV1 {
  const headers = new Headers({
    'content-type': 'application/json',
    [SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1]:
      SAJU_CHARACTER_GROUNDING_ADMISSION_VERSION_V1,
    ...(input.headers ?? {}),
  });
  return {
    status: input.status ?? 200,
    headers,
    body: null,
    async text() {
      return JSON.stringify(input.payload ?? groundingCandidate());
    },
  };
}

describe('Saju Character grounding HTTP adapter v1', () => {
  it('sends only source-owned projection material to the authenticated Saju endpoint', async () => {
    const requests: Array<{
      readonly url: string;
      readonly init: SajuProductionCalculationHttpRequestInitV1;
    }> = [];
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async (url, init) => {
      requests.push({ url, init });
      return httpResponse();
    };

    const adapter = createSajuCharacterGroundingHttpAdapterV1({
      baseUrl: 'https://saju.internal.example',
      bearerToken: 'service-secret',
      fetchImpl,
    });

    const result = await adapter.projectGrounding(projectionInput);

    expect(result).toEqual(groundingCandidate());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      'https://saju.internal.example/api/character-grounding',
    );
    expect(requests[0]?.init.headers.authorization).toBe('Bearer service-secret');
    const body = JSON.parse(requests[0]?.init.body ?? '{}') as Record<string, unknown>;
    expect(body).toEqual({
      response: projectionInput.responseSnapshotJsonb,
      engineVersion: projectionInput.sajuEngineVersion,
      readingDomain: projectionInput.sajuDomain,
    });
    expect(body).not.toHaveProperty('officialArtifactResponseHash');
    expect(body).not.toHaveProperty('readerCharacterId');
    expect(body).not.toHaveProperty('subjectId');
  });

  it('fails closed without the source-owned grounding admission attestation', async () => {
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async () =>
      httpResponse({
        headers: {
          [SAJU_CHARACTER_GROUNDING_ADMISSION_HEADER_V1]: 'wrong-version',
        },
      });
    const adapter = createSajuCharacterGroundingHttpAdapterV1({
      baseUrl: 'https://saju.internal.example',
      bearerToken: 'service-secret',
      fetchImpl,
    });

    await expect(adapter.projectGrounding(projectionInput)).rejects.toMatchObject({
      code: 'ADMISSION_ATTESTATION_REJECTED',
    });
  });

  it('fails closed when Saju returns grounding for another Official Reading identity', async () => {
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async () =>
      httpResponse({
        payload: groundingCandidate({ readingRef: 'other-reading' }),
      });
    const adapter = createSajuCharacterGroundingHttpAdapterV1({
      baseUrl: 'https://saju.internal.example',
      bearerToken: 'service-secret',
      fetchImpl,
    });

    await expect(adapter.projectGrounding(projectionInput)).rejects.toMatchObject({
      code: 'GROUNDING_IDENTITY_REJECTED',
    });
  });

  it('maps authenticated upstream rejection to a bounded transport error', async () => {
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async () =>
      httpResponse({ status: 401 });
    const adapter = createSajuCharacterGroundingHttpAdapterV1({
      baseUrl: 'https://saju.internal.example',
      bearerToken: 'service-secret',
      fetchImpl,
    });

    await expect(adapter.projectGrounding(projectionInput)).rejects.toMatchObject({
      code: 'HTTP_4XX',
      httpStatus: 401,
    });
  });

  it('uses the existing production Saju service authority for composition', async () => {
    const fetchImpl: SajuProductionCalculationHttpFetchV1 = async () =>
      httpResponse();
    const adapter = createProductionSajuCharacterGroundingProjectionPortV1({
      env: {
        MYEONGHA_SAJU_SERVICE_ORIGIN: 'https://saju.internal.example',
        MYEONGHA_SAJU_SERVICE_BEARER: 'service-secret',
      },
      fetchImpl,
    });

    await expect(adapter.projectGrounding(projectionInput)).resolves.toEqual(
      groundingCandidate(),
    );
  });

  it('rejects an invalid production service origin before any request', () => {
    expect(() =>
      createProductionSajuCharacterGroundingProjectionPortV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN: 'http://saju.internal.example',
          MYEONGHA_SAJU_SERVICE_BEARER: 'service-secret',
        },
      }),
    ).toThrow();
  });

  it('uses bounded adapter errors for invalid direct configuration', () => {
    expect(() =>
      createSajuCharacterGroundingHttpAdapterV1({
        baseUrl: 'not-a-url',
        bearerToken: 'service-secret',
      }),
    ).toThrow(SajuCharacterGroundingHttpAdapterErrorV1);
  });
});
