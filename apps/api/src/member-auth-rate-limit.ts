export const MEMBER_AUTH_RATE_LIMIT_ACTIONS_V1 = [
  'sign-in',
  'sign-up',
  'refresh',
] as const;

export type MemberAuthRateLimitActionV1 =
  (typeof MEMBER_AUTH_RATE_LIMIT_ACTIONS_V1)[number];

export interface MemberAuthRateLimitAdmissionV1 {
  readonly allowed: boolean;
  readonly requestCount: number;
  readonly resetAt: string;
}

export interface MemberAuthRateLimitAdmissionPortV1 {
  admit(input: {
    readonly action: MemberAuthRateLimitActionV1;
    readonly clientFingerprint: Uint8Array;
  }): Promise<MemberAuthRateLimitAdmissionV1>;
}

export function isMemberAuthRateLimitActionV1(
  value: unknown,
): value is MemberAuthRateLimitActionV1 {
  return (
    typeof value === 'string' &&
    (MEMBER_AUTH_RATE_LIMIT_ACTIONS_V1 as readonly string[]).includes(value)
  );
}
