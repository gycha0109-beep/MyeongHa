/**
 * SO-3 advance-only engineering contract. Inputs are untrusted assertions
 * from injected read-only sources, NOT workload IAM, clock or audit evidence.
 * No writes, no retries, no admission or Runner integration.
 */
export const SAJU_SOLO_OWNER_RECONCILIATION_VERSION_V1 =
  'myeongha-saju-solo-owner-reconciliation-v1' as const;

export type SajuSoloOwnerCrossDbStateV1 =
  | 'CONSUMPTION_PENDING' | 'CONSUMED_RECONCILED'
  | 'CONSUMPTION_UNKNOWN' | 'CROSS_DB_PARTIAL_HOLD'
  | 'RECOVERY_HOLD' | 'REVOKED' | 'EXPIRED' | 'BLOCKED';
type Ledger = 'CHALLENGE_DB' | 'ADMISSION_DB';
type LedgerState = 'ISSUED' | 'CONSUMED' | 'UNKNOWN'
  | 'REVOKED' | 'EXPIRED' | 'UNOBSERVED';
const SCOPE_KEYS = Object.freeze([
  'environmentId', 'permitId', 'manifestDigest', 'connectionPlanDigest',
  'myeonghaCommitSha', 'sajuCommitSha', 'requestDigest',
]);
const OBS_KEYS = Object.freeze([
  ...SCOPE_KEYS, 'ledger', 'state', 'witnessRef', 'observedAtMs',
]);
const ENV = /^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HEX64 = /^[a-f0-9]{64}$/u;
const SHA40 = /^[a-f0-9]{40}$/u;
const REF = /^[A-Za-z0-9._:/-]{3,180}$/u;
const clock = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) return false;
    if (Object.keys(value).length !== keys.length
      || Reflect.ownKeys(value).length !== keys.length) return false;
    return keys.every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
    });
  } catch { return false; }
}

export type SajuSoloOwnerReconcileScopeV1 = Readonly<{
  environmentId: string;
  permitId: string;
  manifestDigest: string;
  connectionPlanDigest: string;
  myeonghaCommitSha: string;
  sajuCommitSha: string;
  requestDigest: string;
}>;

function parseScope(value: unknown): SajuSoloOwnerReconcileScopeV1 | null {
  try {
    if (!record(value, SCOPE_KEYS)
      || typeof value.environmentId !== 'string' || !ENV.test(value.environmentId)
      || typeof value.permitId !== 'string' || !UUID.test(value.permitId)
      || typeof value.manifestDigest !== 'string' || !HEX64.test(value.manifestDigest)
      || typeof value.connectionPlanDigest !== 'string'
      || !HEX64.test(value.connectionPlanDigest)
      || typeof value.myeonghaCommitSha !== 'string' || !SHA40.test(value.myeonghaCommitSha)
      || typeof value.sajuCommitSha !== 'string' || !SHA40.test(value.sajuCommitSha)
      || typeof value.requestDigest !== 'string' || !HEX64.test(value.requestDigest)) return null;
    return Object.freeze({
      environmentId:value.environmentId,permitId:value.permitId,
      manifestDigest:value.manifestDigest,connectionPlanDigest:value.connectionPlanDigest,
      myeonghaCommitSha:value.myeonghaCommitSha,sajuCommitSha:value.sajuCommitSha,
      requestDigest:value.requestDigest,
    });
  } catch { return null; }
}

function matchObserved(value: unknown, expected: SajuSoloOwnerReconcileScopeV1,
  expectedLedger: Ledger, nowMs: number): {state: LedgerState; witnessRef: string} | null {
  try {
    if (!record(value, OBS_KEYS)) return null;
    if (value.ledger !== expectedLedger
      || !['ISSUED','CONSUMED','UNKNOWN','REVOKED','EXPIRED','UNOBSERVED']
        .includes(value.state as string)
      || typeof value.witnessRef !== 'string' || !REF.test(value.witnessRef)
      || !clock(value.observedAtMs)
      || value.observedAtMs > nowMs || nowMs - value.observedAtMs > 30_000) return null;
    for (const key of SCOPE_KEYS) {
      if (value[key] !== expected[key as keyof SajuSoloOwnerReconcileScopeV1]) return null;
    }
    return {state:value.state as LedgerState,witnessRef:value.witnessRef};
  } catch { return null; }
}

/** Sources require authenticated independent identities; types cannot prove these. */
export interface SajuSoloOwnerReconciliationReadPortV1 {
  readTrustedTimeMs(): Promise<unknown>;
  readChallengeState(scope: SajuSoloOwnerReconcileScopeV1): Promise<unknown>;
  readAdmissionState(scope: SajuSoloOwnerReconcileScopeV1): Promise<unknown>;
}

export type SajuSoloOwnerReconciliationResultV1 = Readonly<{
  version: typeof SAJU_SOLO_OWNER_RECONCILIATION_VERSION_V1;
  state: SajuSoloOwnerCrossDbStateV1;
  observationAuthority: 'NOT_VERIFIED';
  trustedClockAuthority: 'NOT_VERIFIED';
  auditDurability: 'NOT_VERIFIED';
  crossDbAtomicity: 'NOT_VERIFIED';
  stagingAdmission: 'HOLD';
  mayRetryConsumption: false;
  canRunOnce: false;
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

function finish(state: SajuSoloOwnerCrossDbStateV1): SajuSoloOwnerReconciliationResultV1 {
  return Object.freeze({
    version:SAJU_SOLO_OWNER_RECONCILIATION_VERSION_V1,state,
    observationAuthority:'NOT_VERIFIED' as const,
    trustedClockAuthority:'NOT_VERIFIED' as const,
    auditDurability:'NOT_VERIFIED' as const,
    crossDbAtomicity:'NOT_VERIFIED' as const,
    stagingAdmission:'HOLD' as const,mayRetryConsumption:false as const,
    canRunOnce:false as const,canExecute:false as const,
    canPublish:false as const,canSell:false as const,
  });
}

/** Double CONSUMED is only a synthetic claim, never admission or retry permission. */
export async function assessSajuSoloOwnerCrossDbReconciliationV1(
  port: SajuSoloOwnerReconciliationReadPortV1,
  expectedInput: unknown,
  mutationWasAttempted: unknown,
): Promise<SajuSoloOwnerReconciliationResultV1> {
  const expected = parseScope(expectedInput);
  if (!expected || typeof mutationWasAttempted !== 'boolean') return finish('BLOCKED');
  try {
    const currentTime: unknown = await port.readTrustedTimeMs();
    if (!clock(currentTime)) return finish('RECOVERY_HOLD');
    const [challengeRaw, admissionRaw] = await Promise.all([
      port.readChallengeState(expected),port.readAdmissionState(expected),
    ]);
    const challenge = matchObserved(challengeRaw,expected,'CHALLENGE_DB',currentTime);
    const admission = matchObserved(admissionRaw,expected,'ADMISSION_DB',currentTime);
    if (!challenge || !admission || challenge.witnessRef === admission.witnessRef) {
      return finish('RECOVERY_HOLD');
    }
    const a = challenge.state;
    const b = admission.state;
    if (a === 'REVOKED' || b === 'REVOKED') return finish('REVOKED');
    if (a === 'EXPIRED' || b === 'EXPIRED') return finish('EXPIRED');
    if (a === 'UNKNOWN' || b === 'UNKNOWN') return finish('CONSUMPTION_UNKNOWN');
    if (a === 'CONSUMED' && b === 'CONSUMED') return finish('CONSUMED_RECONCILED');
    if (a === 'UNOBSERVED' || b === 'UNOBSERVED') return finish('RECOVERY_HOLD');
    if (a === 'CONSUMED' || b === 'CONSUMED') return finish('CROSS_DB_PARTIAL_HOLD');
    if (a === 'ISSUED' && b === 'ISSUED') {
      return finish(mutationWasAttempted ? 'CONSUMPTION_UNKNOWN' : 'CONSUMPTION_PENDING');
    }
    return finish('BLOCKED');
  } catch { return finish('RECOVERY_HOLD'); }
}
