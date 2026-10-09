import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createSajuHeldCurrentBirthServerRehearsalV1,
} from './saju-held-current-birth-server-rehearsal-v1.js';
import {
  assessSajuHeldStagingPreflightV1,
  type SajuHeldStagingPreflightInputV1,
} from './saju-held-staging-preflight-v1.js';

export const SAJU_HELD_STAGING_RUNNER_VERSION_V1 =
  'myeongha-held-saju-staging-runner-v1' as const;

type Awaitable<T> = T | Promise<T>;

export interface StagingTargetAuthorityPortV1 {
  /**
   * Must independently verify that the configured origin, identity authority,
   * Subject DB and nonce DB are an approved ISOLATED staging deployment.
   * A boolean mock is NOT proof of a deployed trust authority.
   */
  assertIsolatedStagingTarget(input: Readonly<{
    sourceProofOrigin: string;
  }>): Awaitable<boolean>;
}

export interface StagingOperatorAdmissionPortV1 {
  /**
   * The trusted implementation MUST atomically consume one signed/approved,
   * unexpired, target-and-deployment-bound permit in shared durable storage.
   * Never accept a caller-provided "approved" flag or a process-local Set.
   */
  consumeAuthorizedAttemptOnce(): Awaitable<boolean>;
}

export interface StagingApprovedMemberRequestPortV1 {
  /**
   * Load a disposable test Member credential from an approved secret provider,
   * only after target and one-shot operational admission pass.
   * No caller-controlled Subject, Birth, Reading, or source authority.
   */
  loadApprovedMemberRequest(): Awaitable<Request | null>;
}

export interface SanitizedStagingObservationPortV1 {
  observe(report: SanitizedStagingRehearsalReportV1): Awaitable<void>;
}

export type SanitizedStagingRehearsalReasonV1 =
  | 'ADMISSION_UNAVAILABLE'
  | 'TARGET_UNVERIFIED'
  | 'PREFLIGHT_BLOCKED'
  | 'MEMBER_NOT_VERIFIED'
  | 'PROOF_UNAVAILABLE'
  | 'REVISION_CHANGED'
  | 'TRANSPORT_INTEGRITY_VERIFIED_ONLY';

export type SanitizedStagingRehearsalReportV1 = Readonly<{
  version: typeof SAJU_HELD_STAGING_RUNNER_VERSION_V1;
  result: 'BLOCKED' | 'TRANSPORT_HELD_ONLY';
  reason: SanitizedStagingRehearsalReasonV1;
  stagingConnection: 'NOT_VERIFIED';
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

export interface CreateSajuHeldStagingRunnerInputV1 {
  readonly preflightInput: SajuHeldStagingPreflightInputV1;
  readonly targetAssertionPort: StagingTargetAuthorityPortV1;
  readonly admissionPort: StagingOperatorAdmissionPortV1;
  readonly approvedMemberRequestPort: StagingApprovedMemberRequestPortV1;
  /**
   * Supply the existing Supabase Member identity verifier bound to an
   * independently confirmed staging Auth origin. Never the Guest fallback.
   */
  readonly memberIdentityVerifier: IdentityEvidenceVerificationPortV1;
  readonly observer?: SanitizedStagingObservationPortV1;
}

export interface SajuHeldStagingRehearsalRunnerV1 {
  readonly version: typeof SAJU_HELD_STAGING_RUNNER_VERSION_V1;
  runOnce(): Promise<SanitizedStagingRehearsalReportV1>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function report(
  result: SanitizedStagingRehearsalReportV1['result'],
  reason: SanitizedStagingRehearsalReasonV1,
): SanitizedStagingRehearsalReportV1 {
  return Object.freeze({
    version: SAJU_HELD_STAGING_RUNNER_VERSION_V1,
    result, reason,
    stagingConnection: 'NOT_VERIFIED' as const,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}

function requirePorts(input: CreateSajuHeldStagingRunnerInputV1): void {
  if (!input || !input.preflightInput
    || typeof input.targetAssertionPort?.assertIsolatedStagingTarget !== 'function'
    || typeof input.admissionPort?.consumeAuthorizedAttemptOnce !== 'function'
    || typeof input.approvedMemberRequestPort?.loadApprovedMemberRequest !== 'function'
    || typeof input.memberIdentityVerifier?.verifyRequestIdentity !== 'function'
    || (input.observer !== undefined
      && typeof input.observer.observe !== 'function')) {
    throw new TypeError('Invalid isolated staging rehearsal runner ports.');
  }
}

/**
 * Internal-only, one-shot staging orchestration. NO route, CLI, env resolver,
 * Secret loader, DB role grant or deployed operator authorization is supplied.
 *
 * The actual 8B rehearsal is built from the exact client options checked by
 * 8C-2A. All external authority remains in separately governed trusted ports;
 * synthetic mocks and CI cannot establish permission to run on staging.
 */
export function createSajuHeldStagingRehearsalRunnerV1(
  input: CreateSajuHeldStagingRunnerInputV1,
): SajuHeldStagingRehearsalRunnerV1 {
  requirePorts(input);
  let started = false;

  async function observeSafely(
    outcome: SanitizedStagingRehearsalReportV1,
  ): Promise<SanitizedStagingRehearsalReportV1> {
    if (input.observer === undefined) return outcome;
    try {
      await input.observer.observe(outcome);
      return outcome;
    } catch {
      // No retry after a failed observation; raw error information is secret.
      return report('BLOCKED', 'PROOF_UNAVAILABLE');
    }
  }

  return Object.freeze({
    version: SAJU_HELD_STAGING_RUNNER_VERSION_V1,
    async runOnce(): Promise<SanitizedStagingRehearsalReportV1> {
      // Reserve this instance synchronously before the first await.
      // This is local defense in depth, NOT the cross-replica permit authority.
      if (started) return report('BLOCKED', 'ADMISSION_UNAVAILABLE');
      started = true;

      let outcome: SanitizedStagingRehearsalReportV1;
      try {
        const preflight = assessSajuHeldStagingPreflightV1(input.preflightInput);
        if (preflight.configuration !== 'VALID'
          || preflight.stagingAdmission !== 'HOLD'
          || preflight.stagingConnection !== 'NOT_VERIFIED') {
          outcome = report('BLOCKED', 'PREFLIGHT_BLOCKED');
        } else if (await input.targetAssertionPort.assertIsolatedStagingTarget({
          sourceProofOrigin: input.preflightInput.client.proofTrust.serviceOrigin,
        }) !== true) {
          outcome = report('BLOCKED', 'TARGET_UNVERIFIED');
        } else if (await input.admissionPort.consumeAuthorizedAttemptOnce() !== true) {
          outcome = report('BLOCKED', 'ADMISSION_UNAVAILABLE');
        } else {
          // Credential is loaded only after independent target and admission.
          const request = await input.approvedMemberRequestPort.loadApprovedMemberRequest();
          if (!(request instanceof Request)) {
            outcome = report('BLOCKED', 'MEMBER_NOT_VERIFIED');
          } else {
            const evidence = await input.memberIdentityVerifier.verifyRequestIdentity(request);
            if (evidence?.kind !== 'member'
              || typeof evidence.verifiedAuthUserId !== 'string'
              || !UUID.test(evidence.verifiedAuthUserId)
              || Object.keys(evidence).length !== 2) {
              outcome = report('BLOCKED', 'MEMBER_NOT_VERIFIED');
            } else {
              // Same options as preflight, one fixed General Natal invocation.
              const bound = await createSajuHeldCurrentBirthServerRehearsalV1(
                input.preflightInput.client,
              ).rehearse(evidence);
              const holdInvariant = bound.sourceAuthority === 'NOT_EVALUATED'
                && bound.releaseAuthorization === 'NOT_EVALUATED'
                && bound.canExecute === false && bound.canPublish === false
                && bound.canSell === false;
              if (!holdInvariant) {
                outcome = report('BLOCKED', 'PROOF_UNAVAILABLE');
              } else if (bound.state === 'held'
                && bound.reason === 'source_transport_integrity_verified_only'
                && bound.binding !== undefined) {
                outcome = report('TRANSPORT_HELD_ONLY',
                  'TRANSPORT_INTEGRITY_VERIFIED_ONLY');
              } else if (bound.state === 'blocked'
                && bound.reason === 'current_birth_revision_changed') {
                outcome = report('BLOCKED', 'REVISION_CHANGED');
              } else {
                outcome = report('BLOCKED', 'PROOF_UNAVAILABLE');
              }
            }
          }
        }
      } catch {
        // No raw error, credential, source proof, Birth, nonce or binding output.
        outcome = report('BLOCKED', 'PROOF_UNAVAILABLE');
      }
      return observeSafely(outcome);
    },
  });
}
