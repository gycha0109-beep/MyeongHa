import { describe, expect, it } from 'vitest';

import {
  createProductionSajuGovernedFaceHandoffTransportV1,
} from './production-saju-governed-face-handoff-transport.js';
import {
  SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
} from './saju-governed-face-handoff-http-adapter.js';

const encoder = new TextEncoder();

function stream(value: string): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(value);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('production Saju governed Face handoff transport composition', () => {
  it('reuses the governed production Saju origin/bearer config and preserves source_blocked', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetchImpl = async (url: string, init: any) => {
      calls.push({ url, init });
      const payload = {
        schemaVersion: SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
        state: 'not_eligible',
        requestId: 'request:005m-b:blocked',
        topicKey: 'face.reading.three_divisions',
        reason: 'source_blocked',
        authoritySnapshotId: 'face-authority-coverage:blocked',
      };
      const serialized = JSON.stringify(payload);
      return {
        status: 200,
        headers: {
          get(name: string) {
            const normalized = name.toLowerCase();
            if (normalized === 'content-type') {
              return 'application/json; charset=utf-8';
            }
            if (
              normalized ===
              'x-myeonghwa-face-governed-handoff-admitted'
            ) {
              return SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1;
            }
            return null;
          },
        },
        body: stream(serialized),
        async text() {
          return serialized;
        },
      };
    };

    const transport =
      createProductionSajuGovernedFaceHandoffTransportV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'https://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'production-face-secret',
        },
        sajuFetchImpl: fetchImpl,
      });

    await expect(
      transport.requestHandoff({
        topicKey: 'face.reading.three_divisions',
        observationArtifactRef: 'face-observation-artifact:005m-b',
        requestId: 'request:005m-b:blocked',
      }),
    ).resolves.toEqual({
      state: 'not_eligible',
      requestId: 'request:005m-b:blocked',
      topicKey: 'face.reading.three_divisions',
      reason: 'source_blocked',
      authoritySnapshotId: 'face-authority-coverage:blocked',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      'https://saju.example.test/api/face/governed-character-handoff',
    );
    expect(calls[0]?.init.headers.authorization).toBe(
      'Bearer production-face-secret',
    );
  });

  it('keeps production Saju HTTPS origin validation in force', () => {
    expect(() =>
      createProductionSajuGovernedFaceHandoffTransportV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'http://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'production-face-secret',
        },
      }),
    ).toThrow(/HTTPS origin/u);
  });
});
