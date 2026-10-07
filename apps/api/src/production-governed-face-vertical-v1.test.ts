import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CHARACTER_FACE_GOVERNED_GROUNDING_PROJECTION_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_REF_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_GROUNDING_SCHEMA_VERSION_V1,
  CHARACTER_FACE_GOVERNED_MODE_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_REGISTRY_VERSION_V1,
  CHARACTER_FACE_GOVERNED_REALIZATION_POLICY_V1,
  hashCharacterFaceGovernedInterpretationMaterialV1,
  hashCharacterFaceGovernedReadingArtifactV1,
  resolveCharacterFaceNamedProfileBundleV1,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import {
  CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
  CharacterFaceGovernedReadingCommitErrorV1,
} from './character-face-governed-reading-artifact-commit.js';
import type {
  CharacterFaceGovernedReadingDurableCommitPortV1,
} from './character-face-governed-reading-artifact-durable-commit.js';
import {
  resolveCharacterRuntimeAuthorityLaneV1,
} from '../../../packages/character-content/src/runtime-authority-lane-v1.js';
import {
  createProductionGovernedFaceVerticalV1,
  PRODUCTION_GOVERNED_FACE_TOPIC_KEY_V1,
} from './production-governed-face-vertical-v1.js';
import {
  createProductionSajuGovernedFaceHandoffTransportV1,
} from './production-saju-governed-face-handoff-transport.js';
import {
  SAJU_GOVERNED_FACE_HANDOFF_ADMISSION_HEADER_V1,
  SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
} from './saju-governed-face-handoff-http-adapter.js';

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
    schemaVersion: string;
    sourceContractVersion: string;
    sourceAuthorityRef: string;
    sourceResultHash: string;
    topicKey: string;
    authorizationState: string;
    authorizationScope: string;
    authorizationReceiptRef: string;
    handoffHash: string;
    units: readonly Record<string, unknown>[];
  };
};

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

function response(body: unknown) {
  const serialized = JSON.stringify(body);
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
          SAJU_GOVERNED_FACE_HANDOFF_ADMISSION_HEADER_V1
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
}

function groundingFixture() {
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
    ...('faceReadingRef' in grounding
      ? {
          faceReadingRef:
            grounding.faceReadingRef,
        }
      : {}),
    methodologyPackRefs:
      grounding.methodologyPackRefs,
    bundleHash:
      grounding.bundleHash,
  });

  return { grounding, groundingRef };
}

function eligibleEnvelope(
  mutate?: (
    envelope: Record<string, any>,
  ) => void,
) {
  const { grounding, groundingRef } =
    groundingFixture();
  const envelope: Record<string, any> = {
    schemaVersion:
      SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
    state: 'eligible',
    requestId:
      fixture.source.plan.requestId,
    topicKey:
      fixture.source.plan.topicKey,
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
  mutate?.(envelope);
  return envelope;
}

function baseContext(): CharacterRuntimeContextV1 {
  const lane =
    resolveCharacterRuntimeAuthorityLaneV1(
      'seyeon',
    );
  const profiles =
    resolveCharacterFaceNamedProfileBundleV1(
      'seyeon',
    );

  if (
    lane === null ||
    profiles === null
  ) {
    throw new Error(
      'Seyeon authority is required.',
    );
  }

  const source =
    profiles.authoringSource;

  return {
    schemaVersion: 'v1',
    characterId:
      source.characterId,
    contentBundleId:
      'character-runtime-authority-lane-seyeon-v1',
    contentVersion:
      source.contentVersion,
    speech:
      source.speech,
    voiceAuthority: {
      characterId:
        source.characterId,
      surface:
        'general_chat',
      source:
        'published_character_content',
      contentVersion:
        source.contentVersion,
      speech:
        source.speech,
      communication:
        source.communication,
    },
    persona:
      lane.runtime.persona,
    behavior:
      lane.runtime.behavior,
    sajuProfile:
      lane.runtime.sajuProfile,
    relationship: {
      schemaVersion:
        'v1',
      relationshipRevision: 1,
      relationshipPolicyVersion:
        'relationship-policy-governed-vertical-test-v1',
      projectionPolicyVersion:
        'relationship-projection-governed-vertical-test-v1',
      stageKey:
        'public',
      closenessBand:
        'low',
      trustBand:
        'low',
      frictionBand:
        'low',
      recentEventKeys: [],
      behaviorVersion:
        lane.runtime.relationshipBehavior.behaviorVersion,
      matchedBehaviorRuleKey: null,
      mode:
        lane.runtime.relationshipBehavior.defaultMode,
    },
    rendererPolicy: {
      allowedEmotionIds: [
        'neutral',
        'smile',
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
  } as unknown as CharacterRuntimeContextV1;
}

class MemoryDurablePort
implements CharacterFaceGovernedReadingDurableCommitPortV1 {
  commits = 0;
  private stored:
    | Readonly<{
        turnId: string;
        artifact: any;
        receipt: any;
      }>
    | null = null;

  async commit(input: any) {
    const artifactHash =
      hashCharacterFaceGovernedReadingArtifactV1(
        input.artifact,
      );

    if (
      this.stored !== null &&
      this.stored.turnId === input.turnId
    ) {
      if (
        this.stored.artifact.artifactId ===
          input.artifact.artifactId &&
        hashCharacterFaceGovernedReadingArtifactV1(
          this.stored.artifact,
        ) === artifactHash
      ) {
        return Object.freeze({
          committed: Object.freeze({
            receipt:
              this.stored.receipt,
            artifact:
              this.stored.artifact,
          }),
          replayed: true,
        });
      }
      throw new CharacterFaceGovernedReadingCommitErrorV1(
        'commit',
        'replacement rejected',
      );
    }

    this.commits += 1;
    const receipt = Object.freeze({
      schemaVersion:
        CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
      turnId:
        input.turnId,
      attemptId:
        input.attemptId,
      receiptId:
        'test-only:durable-receipt',
      artifactId:
        input.artifact.artifactId,
      artifactHash,
      characterId:
        input.artifact.characterId,
      sourceResultHash:
        input.artifact.sourceResultHash,
      authorizationReceiptRef:
        input.artifact.authorizationReceiptRef,
      faceBundleHash:
        input.artifact.faceBundleHash,
      handoffHash:
        input.artifact.handoffHash,
      readingPlanRef:
        input.artifact.readingPlanRef,
      finalOutputHash:
        input.artifact.finalOutputHash,
    });
    this.stored = Object.freeze({
      turnId:
        input.turnId,
      artifact:
        input.artifact,
      receipt,
    });

    return Object.freeze({
      committed: Object.freeze({
        receipt,
        artifact:
          input.artifact,
      }),
      replayed: false,
    });
  }
}

function productionTransport(
  envelopeFactory: () => unknown,
) {
  return createProductionSajuGovernedFaceHandoffTransportV1({
    env: {
      MYEONGHA_SAJU_SERVICE_ORIGIN:
        'https://saju.example.test',
      MYEONGHA_SAJU_SERVICE_BEARER:
        'service-secret',
    },
    sajuFetchImpl:
      async () =>
        response(
          envelopeFactory(),
        ),
  });
}

const SOURCE_REQUEST =
  Object.freeze({
    topicKey:
      PRODUCTION_GOVERNED_FACE_TOPIC_KEY_V1,
    observationArtifactRef:
      fixture.source.plan.observationArtifactRef,
    requestId:
      fixture.source.plan.requestId,
  });

describe(
  'TOPIC-FACE-005O governed Face production vertical',
  () => {
    it(
      'proves real production transport source_blocked stops before Character/runtime/DB work',
      async () => {
        let runtimeCalls = 0;
        let presentationCalls = 0;
        const commitPort =
          new MemoryDurablePort();

        const vertical =
          createProductionGovernedFaceVerticalV1({
            transport:
              productionTransport(
                () => ({
                  schemaVersion:
                    SAJU_GOVERNED_FACE_HANDOFF_RUNTIME_SCHEMA_VERSION_V1,
                  state:
                    'not_eligible',
                  requestId:
                    SOURCE_REQUEST.requestId,
                  topicKey:
                    SOURCE_REQUEST.topicKey,
                  reason:
                    'source_blocked',
                  authoritySnapshotId:
                    'face-authority-coverage:blocked',
                }),
              ),
            baseRuntimeProvider: {
              async resolve() {
                runtimeCalls += 1;
                return baseContext();
              },
            },
            presentationProvider: {
              async render() {
                presentationCalls += 1;
                return {
                  schemaVersion:
                    'v1',
                  emotion:
                    'neutral',
                  suggestedActions: [],
                };
              },
            },
            commitPort,
          });

        await expect(
          vertical.run({
            subjectId:
              '00000000-0000-4000-8000-000000000001',
            turnId:
              '00000000-0000-4000-8000-000000000002',
            attemptId:
              '00000000-0000-4000-8000-000000000003',
            sourceRequest:
              SOURCE_REQUEST,
          }),
        ).resolves.toEqual({
          status:
            'blocked',
          runtimeVersion:
            'production-governed-face-vertical-v1',
          topicKey:
            SOURCE_REQUEST.topicKey,
          requestId:
            SOURCE_REQUEST.requestId,
          reason:
            'source_blocked',
          authoritySnapshotId:
            'face-authority-coverage:blocked',
        });

        expect(runtimeCalls).toBe(0);
        expect(presentationCalls).toBe(0);
        expect(commitPort.commits).toBe(0);
      },
    );

    it(
      'delivers the exact TEST ONLY authorized source meaning only after durable commit',
      async () => {
        const commitPort =
          new MemoryDurablePort();
        const vertical =
          createProductionGovernedFaceVerticalV1({
            transport:
              productionTransport(
                () =>
                  eligibleEnvelope(),
              ),
            baseRuntimeProvider: {
              async resolve() {
                return baseContext();
              },
            },
            presentationProvider: {
              async render() {
                return {
                  schemaVersion:
                    'v1',
                  emotion:
                    'neutral',
                  animationCue:
                    'idle',
                  suggestedActions: [],
                };
              },
            },
            commitPort,
          });

        const result =
          await vertical.run({
            subjectId:
              '00000000-0000-4000-8000-000000000011',
            turnId:
              '00000000-0000-4000-8000-000000000012',
            attemptId:
              '00000000-0000-4000-8000-000000000013',
            sourceRequest:
              SOURCE_REQUEST,
          });

        expect(result.status).toBe(
          'delivered',
        );
        if (
          result.status !==
            'delivered'
        ) {
          throw new Error(
            'expected delivered result',
          );
        }

        expect(
          result.reveal.stateTrace,
        ).toEqual([
          'received',
          'planned',
          'artifact_validated',
          'committed',
          'delivered',
        ]);
        expect(
          result.reveal.revealState,
        ).toBe(
          'controlled_reveal_after_atomic_commit',
        );
        expect(
          result.reveal.finalOutput.face
            .protectedInterpretations
            .map((entry) => entry.text),
        ).toEqual([
          fixture.handoff.units[0]
            ?.protectedMeaningText,
        ]);
        expect(
          commitPort.commits,
        ).toBe(1);
      },
    );

    it(
      'replays the same committed turn and rejects same-turn artifact replacement',
      async () => {
        const commitPort =
          new MemoryDurablePort();
        let emotion:
          'neutral' | 'smile' =
            'neutral';

        const vertical =
          createProductionGovernedFaceVerticalV1({
            transport:
              productionTransport(
                () =>
                  eligibleEnvelope(),
              ),
            baseRuntimeProvider: {
              async resolve() {
                return baseContext();
              },
            },
            presentationProvider: {
              async render() {
                return {
                  schemaVersion:
                    'v1',
                  emotion,
                  suggestedActions: [],
                };
              },
            },
            commitPort,
          });

        const input = {
          subjectId:
            '00000000-0000-4000-8000-000000000021',
          turnId:
            '00000000-0000-4000-8000-000000000022',
          attemptId:
            '00000000-0000-4000-8000-000000000023',
          sourceRequest:
            SOURCE_REQUEST,
        };

        const first =
          await vertical.run(input);
        const replay =
          await vertical.run({
            ...input,
            attemptId:
              '00000000-0000-4000-8000-000000000024',
          });

        expect(first.status).toBe(
          'delivered',
        );
        expect(replay.status).toBe(
          'delivered',
        );
        if (
          replay.status !==
            'delivered'
        ) {
          throw new Error(
            'expected replay delivery',
          );
        }
        expect(
          replay.reveal
            .replayedCommittedTurn,
        ).toBe(true);
        expect(commitPort.commits).toBe(1);

        emotion = 'smile';
        const replacement =
          await vertical.run({
            ...input,
            attemptId:
              '00000000-0000-4000-8000-000000000025',
          });
        expect(replacement).toMatchObject({
          status:
            'failed',
          stage:
            'commit',
        });
        expect(commitPort.commits).toBe(1);
      },
    );

    it(
      'rejects tampered source grounding before runtime or commit',
      async () => {
        let runtimeCalls = 0;
        const commitPort =
          new MemoryDurablePort();
        const vertical =
          createProductionGovernedFaceVerticalV1({
            transport:
              productionTransport(
                () =>
                  eligibleEnvelope(
                    (envelope) => {
                      envelope.grounding = {
                        ...envelope.grounding,
                        bundleHash:
                          'face-governed-character-grounding:tampered',
                      };
                    },
                  ),
              ),
            baseRuntimeProvider: {
              async resolve() {
                runtimeCalls += 1;
                return baseContext();
              },
            },
            presentationProvider: {
              async render() {
                return {
                  schemaVersion:
                    'v1',
                  emotion:
                    'neutral',
                  suggestedActions: [],
                };
              },
            },
            commitPort,
          });

        const result =
          await vertical.run({
            subjectId:
              '00000000-0000-4000-8000-000000000031',
            turnId:
              '00000000-0000-4000-8000-000000000032',
            attemptId:
              '00000000-0000-4000-8000-000000000033',
            sourceRequest:
              SOURCE_REQUEST,
          });

        expect(result).toMatchObject({
          status:
            'failed',
          stage:
            'transport',
          errorCode:
            'SAJU_HANDOFF_ADMISSION_REJECTED',
        });
        expect(runtimeCalls).toBe(0);
        expect(commitPort.commits).toBe(0);
      },
    );

    it(
      'never returns delivered when durable commit fails',
      async () => {
        const vertical =
          createProductionGovernedFaceVerticalV1({
            transport:
              productionTransport(
                () =>
                  eligibleEnvelope(),
              ),
            baseRuntimeProvider: {
              async resolve() {
                return baseContext();
              },
            },
            presentationProvider: {
              async render() {
                return {
                  schemaVersion:
                    'v1',
                  emotion:
                    'neutral',
                  suggestedActions: [],
                };
              },
            },
            commitPort: {
              async commit() {
                throw new Error(
                  'synthetic durable failure',
                );
              },
            },
          });

        const result =
          await vertical.run({
            subjectId:
              '00000000-0000-4000-8000-000000000041',
            turnId:
              '00000000-0000-4000-8000-000000000042',
            attemptId:
              '00000000-0000-4000-8000-000000000043',
            sourceRequest:
              SOURCE_REQUEST,
          });

        expect(result).toMatchObject({
          status:
            'failed',
          stage:
            'commit',
        });
      },
    );
  },
);
