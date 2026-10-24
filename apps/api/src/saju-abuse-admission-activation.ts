/** Server-only release switch. Numeric admission authority remains exclusively in PostgreSQL. */
export function isSajuAbuseAdmissionEnabledV1(env: Readonly<Record<string, string | undefined>>): boolean {
  const value = env.MYEONGHA_SAJU_ABUSE_ADMISSION_ENABLED;
  if (value === undefined || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('Invalid Saju abuse admission activation configuration.');
}
