import {
  createFaceInterpretationShellFE038,
  type FaceInterpretationShellFE038,
} from '@myeongha/physiognomy-engine-runtime';
import type { FacePreviewOneShotResultFE031 } from '../face-preview/one-shot-fe031.js';

export const FACE_INTERPRETATION_BRIDGE_VERSION_FE038 =
  'MHA-FACE-INTERPRETATION-BRIDGE-FE038-v1' as const;

export interface FaceInterpretationBridgeInputFE038 {
  readonly schemaVersion: 'myeongha-face-interpretation-bridge-input-v1';
  readonly observationRef: string;
  readonly observation: FacePreviewOneShotResultFE031;
}

export type FaceInterpretationBridgeResultFE038 =
  | Readonly<{
      schemaVersion: 'myeongha-face-interpretation-bridge-result-v1';
      contractVersion: typeof FACE_INTERPRETATION_BRIDGE_VERSION_FE038;
      status: 'ready';
      shell: FaceInterpretationShellFE038;
    }>
  | Readonly<{
      schemaVersion: 'myeongha-face-interpretation-bridge-result-v1';
      contractVersion: typeof FACE_INTERPRETATION_BRIDGE_VERSION_FE038;
      status: 'rejected';
      reason:
        | 'invalid_input'
        | 'neutral_observation_unavailable'
        | 'neutral_observation_boundary_violation';
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key));
}

function validObservationRef(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}

function rejected(
  reason: 'invalid_input' |
    'neutral_observation_unavailable' |
    'neutral_observation_boundary_violation',
): FaceInterpretationBridgeResultFE038 {
  return Object.freeze({
    schemaVersion: 'myeongha-face-interpretation-bridge-result-v1' as const,
    contractVersion: FACE_INTERPRETATION_BRIDGE_VERSION_FE038,
    status: 'rejected' as const,
    reason,
  });
}

export function buildFaceInterpretationShellFE038(
  input: FaceInterpretationBridgeInputFE038,
): FaceInterpretationBridgeResultFE038 {
  if (
    !isRecord(input) ||
    !exactKeys(input, ['schemaVersion', 'observationRef', 'observation']) ||
    input.schemaVersion !== 'myeongha-face-interpretation-bridge-input-v1' ||
    !validObservationRef(input.observationRef) ||
    !isRecord(input.observation)
  ) {
    return rejected('invalid_input');
  }

  const observation = input.observation;
  if (observation.status !== 'ok') {
    return rejected('neutral_observation_unavailable');
  }

  if (
    observation.schemaVersion !== 'myeongha-face-preview-one-shot-result-v1' ||
    observation.contractVersion !== 'MHA-FACE-PREVIEW-ONE-SHOT-FE031-v1' ||
    !isRecord(observation.preview) ||
    !Array.isArray(observation.preview.metrics) ||
    !Array.isArray(observation.preview.regions) ||
    !isRecord(observation.lifecycle) ||
    observation.lifecycle.metadataStrippedBeforeAnalysis !== true ||
    observation.lifecycle.rawInputPersisted !== false ||
    observation.lifecycle.canonicalImagePersisted !== false ||
    observation.lifecycle.identityEmbeddingCreated !== false ||
    observation.lifecycle.sessionClosed !== true
  ) {
    return rejected('neutral_observation_boundary_violation');
  }

  const shell = createFaceInterpretationShellFE038({
    schemaVersion: 'myeongha-face-neutral-observation-ref-v1',
    observationRef: input.observationRef,
    sourceContractVersion: observation.contractVersion,
    sourceProjectionSchemaVersion: observation.schemaVersion,
    metricCount: observation.preview.metrics.length,
    regionCount: observation.preview.regions.length,
  });

  return Object.freeze({
    schemaVersion: 'myeongha-face-interpretation-bridge-result-v1' as const,
    contractVersion: FACE_INTERPRETATION_BRIDGE_VERSION_FE038,
    status: 'ready' as const,
    shell,
  });
}
