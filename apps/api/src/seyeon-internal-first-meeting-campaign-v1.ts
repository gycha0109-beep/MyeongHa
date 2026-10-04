import {
  randomUUID,
} from 'node:crypto';

import {
  createConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1,
  runSeyeonInternalDogfoodEvidenceV1,
  type ConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1,
  type RunSeyeonInternalDogfoodEvidenceResultV1,
} from './seyeon-internal-dogfood-evidence-v1.js';
import {
  getSeyeonInternalDogfoodScenarioV1,
} from './seyeon-internal-dogfood-scenarios-v1.js';
import {
  prepareSeyeonInternalDogfoodThreadV1,
  type SeyeonInternalDogfoodThreadPreparationResultV1,
} from './seyeon-internal-dogfood-thread-preparation-v1.js';
import type {
  ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import type {
  VerifiedSubjectIdentityEvidenceV1,
} from './subject-identity-resolver.js';

export const SEYEON_FIRST_MEETING_LIVE_CAMPAIGN_VERSION_V1 =
  'seyeon-first-meeting-live-campaign-v1' as const;

export interface RunSeyeonFirstMeetingLiveCampaignInputV1 {
  readonly runtime: ConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1;
  readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
  readonly runId: string;
  readonly createUuid?: () => string;
  readonly now?: () => Date;
}

export interface RunSeyeonFirstMeetingLiveCampaignResultV1 {
  readonly version:
    typeof SEYEON_FIRST_MEETING_LIVE_CAMPAIGN_VERSION_V1;
  readonly preparation:
    SeyeonInternalDogfoodThreadPreparationResultV1;
  readonly evidence:
    RunSeyeonInternalDogfoodEvidenceResultV1 | null;
}

export async function runSeyeonFirstMeetingLiveCampaignV1(
  input: RunSeyeonFirstMeetingLiveCampaignInputV1,
): Promise<RunSeyeonFirstMeetingLiveCampaignResultV1> {
  const preparation =
    await prepareSeyeonInternalDogfoodThreadV1({
      verifiedEvidence: input.verifiedEvidence,
      pool: input.runtime.pool,
      evidenceInspector: input.runtime.evidenceInspector,
      createUuid: input.createUuid ?? randomUUID,
    });

  if (
    preparation.status === 'NOT_RUN_PREREQUISITE' ||
    preparation.threadId === null
  ) {
    return Object.freeze({
      version: SEYEON_FIRST_MEETING_LIVE_CAMPAIGN_VERSION_V1,
      preparation,
      evidence: null,
    });
  }

  const evidence = await runSeyeonInternalDogfoodEvidenceV1({
    harness: input.runtime.harness,
    observer: input.runtime.observer,
    relationshipInspector: input.runtime.relationshipInspector,
    evidenceInspector: input.runtime.evidenceInspector,
    scenario:
      getSeyeonInternalDogfoodScenarioV1('first-meeting-v1'),
    verifiedEvidence: input.verifiedEvidence,
    threadId: preparation.threadId,
    runId: input.runId,
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  return Object.freeze({
    version: SEYEON_FIRST_MEETING_LIVE_CAMPAIGN_VERSION_V1,
    preparation,
    evidence,
  });
}

export async function runConfiguredSeyeonFirstMeetingLiveCampaignV1(
  input: {
    readonly env: ProductionUserDataRuntimeEnvV1;
    readonly verifiedEvidence: VerifiedSubjectIdentityEvidenceV1;
    readonly runId: string;
    readonly createUuid?: () => string;
    readonly now?: () => Date;
  },
): Promise<RunSeyeonFirstMeetingLiveCampaignResultV1> {
  const runtime =
    createConfiguredSeyeonInternalDogfoodEvidenceRuntimeV1(
      input.env,
    );
  try {
    return await runSeyeonFirstMeetingLiveCampaignV1({
      runtime,
      verifiedEvidence: input.verifiedEvidence,
      runId: input.runId,
      ...(input.createUuid === undefined
        ? {}
        : { createUuid: input.createUuid }),
      ...(input.now === undefined ? {} : { now: input.now }),
    });
  } finally {
    await runtime.close();
  }
}
