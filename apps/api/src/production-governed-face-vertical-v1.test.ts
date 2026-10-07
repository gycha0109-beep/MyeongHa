import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../../../packages/character-content/src/runtime-authority-lane-v1.js';
import {
  CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_MODE_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import {
  InMemoryCharacterFaceGovernedReadingCommitPortV1,
} from './character-face-governed-reading-artifact-commit.js';
import type {
  CharacterFaceGovernedReadingDurableCommitPortV1,
} from './character-face-governed-reading-artifact-durable-commit.js';
import {
  createProductionGovernedFaceVerticalV1,
  ProductionGovernedFaceVerticalErrorV1,
} from './production-governed-face-vertical-v1.js';
import {
  SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
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
      topicKey: 'face.reading.three_divisions';
      observationArtifactRef: string;
      authoritySnapshotId: string;
      executionPlanHash: string;
    };
    receipt: {
      faceEngineVersion: string;
      faceReadingRef?: string;
      methodologyPackRefs: readonly string[];
      bindingGroupRefs: readonly string[];
      unavailableSections: readonly string[];
      prohibitedInferences: readonly string[];
      provenanceRefs: readonly string[];
    };
  };
  handoff: {
    sourceContractVersion: string;
    sourceAuthorityRef: string;
    sourceResultHash: string;
    topicKey: 'face.reading.three_divisions';
    authorizationReceiptRef: string;
    handoffHash: string;
    units: readonly Record<string, unknown>[];
  };
};

function bodyStream(
  value: string,
): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(value);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function response(
  payload: unknown,
) {
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
    body: bodyStream(serialized),
    async text() {
      return serialized;
    },
  };
}

function governedGrounding() {
  const units = Object.freeze(
    fixture.handoff.units.map((unit) =>
      Object.freeze({
        ...unit,
        realizationPolicyRef:
          CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
      }),
    ),
  );

  const material = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
    projectionVersion:
      CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
    realizationPolicyRegistryVersion:
      CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
    mode:
      CHARACTER_FACE_GOVERNED_MODE_V1,
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
      fixture.source.receipt.faceEngineVersion,
    ...(fixture.source.receipt.faceReadingRef === undefined
      ? {}
      : {
          faceReadingRef:
            fixture.source.receipt.faceReadingRef,
        }),
    methodologyPackRefs:
      Object.freeze([
        ...fixture.source.receipt.methodologyPackRefs,
      ].sort()),
    bindingGroupRefs:
      Object.freeze([
        ...fixture.source.receipt.bindingGroupRefs,
      ].sort()),
    units,
    unavailableSections:
      Object.freeze([
        ...fixture.source.receipt.unavailableSections,
      ].sort()),
    prohibitedInferences:
      Object.freeze([
        ...fixture.source.receipt.prohibitedInferences,
      ].sort()),
    provenanceRefs:
      Object.freeze([
        ...fixture.source.receipt.provenanceRefs,
      ].sort()),
  });

  const grounding = Object.freeze({
    ...material,
    bundleHash:
      'face-governed-character-grounding:' +
      hashCharacterFaceGovernedInterpretationMaterialV1(
        material,
      ),
  });

  const groundingRef = Object.freeze({
    schemaVersion:
      CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
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
    ...(grounding.faceReadingRef === undefined
      ? {}
      : {
          faceReadingRef:
            grounding.faceReadingRef,
        }),
    methodologyPackRefs:
      grounding.methodologyPackRefs,
    bundleHash:
      grounding.bundleHash,
  });

  return { grounding, groundingRef };
}

function eligibleEnvelope() {
  const { grounding, groundingRef } =
    governedGrounding();

  return {
    schemaVersion:
      SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
    state: 'eligible',
    requestId:
      fixture.source.plan.requestId,
    topicKey:
      fixture.handoff.topicKey,
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

function baseContext():
CharacterRuntimeContextV1 {
  const lane =
    resolveCharacterRuntimeAuthorityLaneV1(
      'seyeon',
    );
  if (lane === null) {
    throw new Error(
      'TEST ONLY Se-yeon runtime authority is required.',
    );
  }

  const runtime = lane.runtime;
  return {
    schemaVersion: 'v1',
    characterId: 'seyeon',
    contentBundleId:
      'test-only:seyeon-bundle',
    contentVersion:
      runtime.contentVersion,
    speech:
      runtime.speech,
    voiceAuthority: {
      characterId:
        'seyeon',
      surface:
        'general_chat',
      source:
        'published_character_content',
      contentVersion:
        runtime.contentVersion,
      speech:
        runtime.speech,
      communication:
        runtime.persona.communication,
    },
    canon:
      runtime.canon,
    persona:
      runtime.persona,
    behavior:
      runtime.behavior,
    sajuProfile:
      runtime.sajuProfile,
    relationship: {
      schemaVersion: 'v1',
      relationshipRevision: 1,
      relationshipPolicyVersion:
        'test-only:relationship-policy',
      projectionPolicyVersion:
        'test-only:relationship-projection',
      stageKey: 'public',
      closenessBand: 'low',
      trustBand: 'low',
      frictionBand: 'low',
      recentEventKeys: [],
      behaviorVersion:
        runtime.relationshipBehavior.behaviorVersion,
      matchedBehaviorRuleKey:
        null,
      mode:
        runtime.relationshipBehavior.defaultMode,
    },
    rendererPolicy: {
      allowedEmotionIds: [
        'neutral',
      ],
      allowedAnimationCueIds: [
        'idle',
      ],
    },
    worldRelations: [],
    lifeFacts: [],
    memories: [],
    recentMessages: [],
    saju: null,
  };
}

function durablePort() {
  const memory =
    new InMemoryCharacterFaceGovernedReadingCommitPortV1();

  const port:
    CharacterFaceGovernedReadingDurableCommitPortV1 =
      Object.freeze({
        async commit(input) {
          const existing =
            memory.findCommitted(
              input.turnId,
            );
          const committed =
            memory.commit({
              turnId:
                input.turnId,
              attemptId:
                input.attemptId,
              artifact:
                input.artifact,
            });
          return Object.freeze({
            committed,
            replayed:
              existing !== null,
          });
        },
      });

  return { memory, port };
}

const REQUEST = Object.freeze({
  subjectId:
    '00000000-0000-4000-8000-000000000001',
  turnId:
    '00000000-0000-4000-8000-000000000002',
  attemptId:
    '00000000-0000-4000-8000-000000000003',
  requestId:
    fixture.source.plan.requestId,
  topicKey:
    'face.reading.three_divisions' as const,
  observationArtifactRef:
    fixture.source.plan.observationArtifactRef,
});

describe('TOPIC-FACE-005O governed Face production vertical', () => {
  it('keeps the actual source_blocked path before Character context, render, artifact, commit or reveal', async () => {
    const load =
      vi.fn(async () =>
        baseContext());
    const render =
      vi.fn(async () => ({
        schemaVersion: 'v1',
        emotion: 'neutral',
        animationCue: 'idle',
        suggestedActions: [],
      }));
    const commit =
      vi.fn(async () => {
        throw new Error(
          'blocked path must not commit',
        );
      });

    const runtime =
      createProductionGovernedFaceVerticalV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'https://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'test-only-secret',
        },
        baseContext: { load },
        renderer: { render },
        commitPort: { commit },
        allowedSuggestedActionKeys: [],
        sajuFetchImpl:
          async () =>
            response({
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
            }),
      });

    await expect(
      runtime.run(REQUEST),
    ).resolves.toEqual({
      version:
        'production-governed-face-vertical-v1',
      status:
        'not_eligible',
      characterId:
        'seyeon',
      topicKey:
        'face.reading.three_divisions',
      reason:
        'source_blocked',
    });

    expect(load).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('runs TEST ONLY eligible source through transport, governed context, Seyeon artifact and durable controlled reveal', async () => {
    const { memory, port } =
      durablePort();
    const load =
      vi.fn(async () =>
        baseContext());
    const render =
      vi.fn(async () => ({
        schemaVersion: 'v1',
        emotion: 'neutral',
        animationCue: 'idle',
        suggestedActions: [],
      }));

    const runtime =
      createProductionGovernedFaceVerticalV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'https://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'test-only-secret',
        },
        baseContext: { load },
        renderer: { render },
        commitPort: port,
        allowedSuggestedActionKeys: [],
        sajuFetchImpl:
          async () =>
            response(
              eligibleEnvelope(),
            ),
      });

    const first =
      await runtime.run(
        REQUEST,
      );

    expect(first.status).toBe(
      'delivered',
    );
    if (
      first.status !==
      'delivered'
    ) {
      throw new Error(
        'expected delivered TEST ONLY vertical',
      );
    }

    expect(
      first.reveal.revealState,
    ).toBe(
      'controlled_reveal_after_atomic_commit',
    );
    expect(
      first.reveal.stateTrace,
    ).toEqual([
      'received',
      'planned',
      'artifact_validated',
      'committed',
      'delivered',
    ]);
    expect(
      first.reveal.finalOutput.face
        .protectedInterpretations[0]
        ?.protectedMeaningText,
    ).toBe(
      fixture.handoff.units[0]
        ?.protectedMeaningText,
    );
    expect(
      first.reveal.finalOutput.face
        .selectedInterpretationIds,
    ).toEqual([
      fixture.handoff.units[0]
        ?.interpretationId,
    ]);
    expect(
      memory.committedCount,
    ).toBe(1);
    expect(
      first.reveal.replayedCommittedTurn,
    ).toBe(false);

    const replay =
      await runtime.run(
        REQUEST,
      );
    expect(
      replay.status,
    ).toBe('delivered');
    if (
      replay.status !==
      'delivered'
    ) {
      throw new Error(
        'expected replayed delivered vertical',
      );
    }
    expect(
      replay.reveal
        .replayedCommittedTurn,
    ).toBe(true);
    expect(
      replay.reveal.commitReceipt
        .receiptId,
    ).toBe(
      first.reveal.commitReceipt
        .receiptId,
    );
    expect(
      memory.committedCount,
    ).toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);

    const serialized =
      JSON.stringify(
        first.reveal.finalOutput,
      ).toLowerCase();
    for (
      const forbidden of [
        'rawimage',
        'rawlandmark',
        'faceembedding',
        'identitytemplate',
      ]
    ) {
      expect(
        serialized,
      ).not.toContain(
        forbidden,
      );
    }
  });

  it('rejects source grounding tamper in transport before Character context or commit', async () => {
    const envelope =
      eligibleEnvelope();
    envelope.grounding = {
      ...envelope.grounding,
      bundleHash:
        'face-governed-character-grounding:tampered',
    };

    const load =
      vi.fn(async () =>
        baseContext());
    const commit =
      vi.fn(async () => {
        throw new Error(
          'tampered path must not commit',
        );
      });

    const runtime =
      createProductionGovernedFaceVerticalV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'https://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'test-only-secret',
        },
        baseContext: { load },
        renderer: {
          render: vi.fn(),
        },
        commitPort: { commit },
        allowedSuggestedActionKeys: [],
        sajuFetchImpl:
          async () =>
            response(envelope),
      });

    await expect(
      runtime.run(REQUEST),
    ).rejects.toMatchObject({
      stage: 'transport',
    });
    expect(load).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('never reveals when durable commit fails', async () => {
    const runtime =
      createProductionGovernedFaceVerticalV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'https://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'test-only-secret',
        },
        baseContext: {
          load: async () =>
            baseContext(),
        },
        renderer: {
          render: async () => ({
            schemaVersion: 'v1',
            emotion: 'neutral',
            animationCue: 'idle',
            suggestedActions: [],
          }),
        },
        commitPort: {
          async commit() {
            throw new Error(
              'synthetic durable failure',
            );
          },
        },
        allowedSuggestedActionKeys: [],
        sajuFetchImpl:
          async () =>
            response(
              eligibleEnvelope(),
            ),
      });

    await expect(
      runtime.run(REQUEST),
    ).rejects.toEqual(
      expect.objectContaining({
        name:
          'ProductionGovernedFaceVerticalErrorV1',
        stage:
          'commit_reveal',
      }),
    );
  });

  it('fails before transport on unsupported topic identity', async () => {
    const runtime =
      createProductionGovernedFaceVerticalV1({
        env: {
          MYEONGHA_SAJU_SERVICE_ORIGIN:
            'https://saju.example.test',
          MYEONGHA_SAJU_SERVICE_BEARER:
            'test-only-secret',
        },
        baseContext: {
          load: async () =>
            baseContext(),
        },
        renderer: {
          render: async () => ({}),
        },
        commitPort: {
          async commit() {
            throw new Error(
              'must not commit',
            );
          },
        },
        allowedSuggestedActionKeys: [],
        sajuFetchImpl:
          async () => {
            throw new Error(
              'must not fetch',
            );
          },
      });

    await expect(
      runtime.run({
        ...REQUEST,
        topicKey:
          'face.discover.structure' as never,
      }),
    ).rejects.toBeInstanceOf(
      ProductionGovernedFaceVerticalErrorV1,
    );
  });
});
