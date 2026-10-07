import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  hashCharacterFaceGovernedInterpretationMaterialV1,
} from '../../../packages/domain/src/index.js';

import {
  buildSajuGovernedFaceHandoffRequestV1,
  createSajuGovernedFaceHandoffHttpAdapterV1,
  SAJU_GOVERNED_FACE_HANDOFF_ADMISSION_HEADER_V1,
  SAJU_GOVERNED_FACE_HANDOFF_HTTP_PATH_V1,
  SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
  SajuGovernedFaceHandoffHttpAdapterErrorV1,
} from './saju-governed-face-handoff-http-adapter.js';

const encoder = new TextEncoder();

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../test/fixtures/saju-face-governed-v1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  source: {
    plan: {
      requestId: string;
      topicKey: string;
      observationArtifactRef: string;
      authoritySnapshotId: string;
      executionPlanHash: string;
    };
  };
  handoff: {
    sourceContractVersion: string;
    sourceAuthorityRef: string;
    sourceResultHash: string;
    topicKey: string;
    authorizationReceiptRef: string;
    handoffHash: string;
    units: readonly Record<string, unknown>[];
  };
};

function textStream(
  value: string,
): ReadableStream<Uint8Array> {
  const bytes =
    encoder.encode(value);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function jsonResponse(
  status: number,
  body: unknown,
  attestation: string | null =
    SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
) {
  const serialized =
    JSON.stringify(body);
  return {
    status,
    headers: {
      get(name: string) {
        const normalized =
          name.toLowerCase();
        if (
          normalized ===
          'content-type'
        ) {
          return 'application/json; charset=utf-8';
        }
        if (
          normalized ===
          SAJU_GOVERNED_FACE_HANDOFF_ADMISSION_HEADER_V1
        ) {
          return attestation;
        }
        return null;
      },
    },
    body:
      textStream(serialized),
    async text() {
      return serialized;
    },
  };
}

const REQUEST =
  Object.freeze({
    topicKey:
      fixture.source.plan.topicKey,
    observationArtifactRef:
      fixture.source.plan.observationArtifactRef,
    requestId:
      fixture.source.plan.requestId,
  });


function governedGroundingFixture() {
  const units = Object.freeze(
    fixture.handoff.units.map((unit) =>
      Object.freeze({
        ...unit,
        realizationPolicyRef:
          'protected_meaning_exact_v1',
      }),
    ),
  );

  const material = Object.freeze({
    schemaVersion:
      'face-governed-character-grounding-v1',
    projectionVersion:
      'face-governed-character-grounding-projection-v1',
    realizationPolicyRegistryVersion:
      'face-governed-character-realization-policy-v1',
    mode:
      'governed_traditional_interpretation',
    topicKey:
      fixture.handoff.topicKey,
    sourceContractVersion:
      fixture.handoff.sourceContractVersion,
    sourceAuthorityRef:
      fixture.handoff.sourceAuthorityRef,
    sourceResultHash:
      fixture.handoff.sourceResultHash,
    authorizationReceiptRef:
      fixture.handoff.authorizationReceiptRef,
    handoffHash:
      fixture.handoff.handoffHash,
    faceEngineVersion:
      'test-only:face-engine-v1',
    faceReadingRef:
      'test-only:face-reading-ref-v1',
    methodologyPackRefs:
      Object.freeze(['test-only:methodology-pack-v1']),
    bindingGroupRefs:
      Object.freeze(['test-only:binding-group-v1']),
    units,
    unavailableSections:
      Object.freeze([]),
    prohibitedInferences:
      Object.freeze(['guaranteed_future_outcome']),
    provenanceRefs:
      Object.freeze(['test-only:governed-face-grounding']),
  });

  const grounding = Object.freeze({
    ...material,
    bundleHash:
      'face-governed-character-grounding:' +
      hashCharacterFaceGovernedInterpretationMaterialV1(material),
  });

  const groundingRef = Object.freeze({
    schemaVersion:
      'face-governed-character-grounding-ref-v1',
    projectionVersion:
      grounding.projectionVersion,
    mode:
      grounding.mode,
    topicKey:
      grounding.topicKey,
    sourceContractVersion:
      grounding.sourceContractVersion,
    sourceAuthorityRef:
      grounding.sourceAuthorityRef,
    sourceResultHash:
      grounding.sourceResultHash,
    authorizationReceiptRef:
      grounding.authorizationReceiptRef,
    handoffHash:
      grounding.handoffHash,
    faceEngineVersion:
      grounding.faceEngineVersion,
    faceReadingRef:
      grounding.faceReadingRef,
    methodologyPackRefs:
      grounding.methodologyPackRefs,
    bundleHash:
      grounding.bundleHash,
  });

  return { grounding, groundingRef };
}

function eligibleEnvelope() {
  const { grounding, groundingRef } =
    governedGroundingFixture();
  return {
    schemaVersion:
      SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
    state: 'eligible',
    requestId:
      REQUEST.requestId,
    topicKey:
      REQUEST.topicKey,
    authoritySnapshotId:
      fixture.source.plan.authoritySnapshotId,
    executionPlanHash:
      fixture.source.plan.executionPlanHash,
    sourceBinding: {
      sourceContractVersion:
        fixture.handoff.sourceContractVersion,
      sourceAuthorityRef:
        fixture.handoff.sourceAuthorityRef,
      sourceResultHash:
        fixture.handoff.sourceResultHash,
      topicKey:
        fixture.handoff.topicKey,
      authorizationReceiptRef:
        fixture.handoff.authorizationReceiptRef,
    },
    handoff:
      fixture.handoff,
    grounding,
    groundingRef,
  };
}

describe('TOPIC-FACE-005M-B Saju governed Face handoff HTTP adapter', () => {
  it('posts the narrow source request with the existing service bearer and admits the exact source handoff', async () => {
    const calls:
      Array<{
        url: string;
        init: any;
      }> = [];

    const fetchImpl =
      vi.fn(
        async (
          url: string,
          init: any,
        ) => {
          calls.push({
            url,
            init,
          });
          return jsonResponse(
            200,
            eligibleEnvelope(),
          );
        },
      );

    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl,
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).resolves.toEqual({
      state: 'eligible',
      requestId:
        REQUEST.requestId,
      topicKey:
        REQUEST.topicKey,
      authoritySnapshotId:
        fixture.source.plan.authoritySnapshotId,
      executionPlanHash:
        fixture.source.plan.executionPlanHash,
      sourceBinding:
        eligibleEnvelope()
          .sourceBinding,
      handoff:
        fixture.handoff,
      grounding:
        eligibleEnvelope().grounding,
      groundingRef:
        eligibleEnvelope().groundingRef,
    });

    expect(calls).toHaveLength(1);
    expect(
      calls[0]?.url,
    ).toBe(
      'https://saju.example.test' +
        SAJU_GOVERNED_FACE_HANDOFF_HTTP_PATH_V1,
    );
    expect(
      calls[0]?.init.method,
    ).toBe('POST');
    expect(
      calls[0]?.init.redirect,
    ).toBe('manual');
    expect(
      calls[0]?.init.headers.authorization,
    ).toBe(
      'Bearer service-secret',
    );
    expect(
      JSON.parse(
        calls[0]?.init.body,
      ),
    ).toEqual(REQUEST);
  });

  it('preserves source_blocked as domain ineligibility rather than transport failure', async () => {
    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              {
                schemaVersion:
                  SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
                state:
                  'not_eligible',
                requestId:
                  REQUEST.requestId,
                topicKey:
                  REQUEST.topicKey,
                reason:
                  'source_blocked',
                authoritySnapshotId:
                  'face-authority-coverage:blocked',
              },
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).resolves.toEqual({
      state:
        'not_eligible',
      requestId:
        REQUEST.requestId,
      topicKey:
        REQUEST.topicKey,
      reason:
        'source_blocked',
      authoritySnapshotId:
        'face-authority-coverage:blocked',
    });
  });

  it('rejects a success response without exact source admission attestation', async () => {
    for (
      const attestation of
      [
        null,
        'face-governed-handoff-runtime-v0',
      ]
    ) {
      const adapter =
        createSajuGovernedFaceHandoffHttpAdapterV1({
          baseUrl:
            'https://saju.example.test',
          bearerToken:
            'service-secret',
          fetchImpl:
            async () =>
              jsonResponse(
                200,
                eligibleEnvelope(),
                attestation,
              ),
        });

      await expect(
        adapter.requestHandoff(
          REQUEST,
        ),
      ).rejects.toMatchObject({
        code:
          'RESPONSE_ATTESTATION_REJECTED',
        httpStatus: 200,
      });
    }
  });

  it('rejects sourceBinding changes instead of deriving authority from the handoff payload', async () => {
    const candidate =
      eligibleEnvelope();
    candidate.sourceBinding = {
      ...candidate.sourceBinding,
      sourceResultHash:
        'face-topic-source-result:other',
    };

    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              candidate,
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'HANDOFF_ADMISSION_REJECTED',
      httpStatus: 200,
    });
  });

  it('rejects authorization receipt mismatch between trusted sourceBinding and admitted handoff', async () => {
    const candidate =
      eligibleEnvelope();
    candidate.sourceBinding = {
      ...candidate.sourceBinding,
      authorizationReceiptRef:
        'face-governed-authorization:other',
    };

    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              candidate,
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'SOURCE_BINDING_MISMATCH',
      httpStatus: 200,
    });
  });

  it('rejects semantic handoff tampering rather than repairing it', async () => {
    const candidate =
      eligibleEnvelope();
    candidate.handoff = {
      ...fixture.handoff,
      handoffHash:
        'face-governed-interpretation:tampered',
    };

    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              candidate,
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'HANDOFF_ADMISSION_REJECTED',
    });
  });


  it('rejects governed grounding or groundingRef tampering rather than reconstructing source authority', async () => {
    const groundingTamper =
      eligibleEnvelope();
    groundingTamper.grounding = {
      ...groundingTamper.grounding,
      bundleHash:
        'face-governed-character-grounding:tampered',
    };

    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              groundingTamper,
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'HANDOFF_ADMISSION_REJECTED',
    });

    const refTamper =
      eligibleEnvelope();
    refTamper.groundingRef = {
      ...refTamper.groundingRef,
      bundleHash:
        'face-governed-character-grounding:other',
    };

    const second =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              refTamper,
            ),
      });

    await expect(
      second.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'HANDOFF_ADMISSION_REJECTED',
    });
  });

  it('rejects response identity mismatch against the locally requested topic/request', async () => {
    const candidate =
      eligibleEnvelope();
    candidate.requestId =
      'request:other';

    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              candidate,
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'SOURCE_BINDING_MISMATCH',
    });
  });

  it('keeps a source runtime failure distinct and preserves its source stage/code', async () => {
    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              {
                schemaVersion:
                  SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
                state: 'failed',
                requestId:
                  REQUEST.requestId,
                topicKey:
                  REQUEST.topicKey,
                stage: 'engine',
                errorCode:
                  'FACE_GOVERNED_HANDOFF_ENGINE_PROVIDER_FAILED',
              },
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'SOURCE_FAILED',
      sourceStage:
        'engine',
      sourceErrorCode:
        'FACE_GOVERNED_HANDOFF_ENGINE_PROVIDER_FAILED',
    });
  });

  it.each([
    [409, 'HTTP_4XX'],
    [503, 'HTTP_5XX'],
    [302, 'HTTP_UNEXPECTED_STATUS'],
  ])('maps upstream HTTP %s without treating it as Face meaning', async (status, code) => {
    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              status,
              {
                privateDetail:
                  'not-consumed',
              },
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code,
      httpStatus:
        status,
    });
  });

  it('rejects caller request widening before transport', () => {
    expect(() =>
      buildSajuGovernedFaceHandoffRequestV1({
        topicKey: '',
        observationArtifactRef:
          REQUEST.observationArtifactRef,
        requestId:
          REQUEST.requestId,
      }),
    ).toThrow(
      SajuGovernedFaceHandoffHttpAdapterErrorV1,
    );
  });

  it('rejects malformed runtime schema even when the HTTP attestation is present', async () => {
    const adapter =
      createSajuGovernedFaceHandoffHttpAdapterV1({
        baseUrl:
          'https://saju.example.test',
        bearerToken:
          'service-secret',
        fetchImpl:
          async () =>
            jsonResponse(
              200,
              {
                ...eligibleEnvelope(),
                schemaVersion:
                  'face-governed-handoff-runtime-v0',
              },
            ),
      });

    await expect(
      adapter.requestHandoff(
        REQUEST,
      ),
    ).rejects.toMatchObject({
      code:
        'RESPONSE_SCHEMA_REJECTED',
    });
  });
});
