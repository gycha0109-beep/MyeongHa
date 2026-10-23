/**
 * Legal L2: conservative age policy for SELF Birth Profile collection.
 * NOT identity verification or legal-representative consent.
 * Server-owned Korea calendar day; never accept a client-provided age or clock.
 */
export const LEGAL_MINOR_AGE_POLICY_V1 = Object.freeze({
  minimumFreeAge: 14,
  minimumDirectPurchaseAge: 19,
  guardianConsentVerificationAvailable: false,
  directMinorCheckoutAllowed: false,
} as const);

export type LegalAgeAdmissionV1 =
  | 'adult'
  | 'free_minor'
  | 'under14_denied'
  | 'age_boundary_unverified'
  | 'invalid';

function leap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthDays = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays[month - 1]!
    ? { year, month, day }
    : null;
}

function compareDate(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function resolveSelfBirthAgeAdmissionV1(input: Readonly<{
  birthDate: unknown;
  calendarType: unknown;
  serverTime: string;
}>): LegalAgeAdmissionV1 {
  if (typeof input.birthDate !== 'string' || !Number.isFinite(Date.parse(input.serverTime))) return 'invalid';
  if (input.calendarType !== 'solar' && input.calendarType !== 'lunar') return 'invalid';
  const birth = validDate(input.birthDate);
  // The service policy uses the calendar day in Korea; this is NOT the user's device clock.
  const current = validDate(new Date(Date.parse(input.serverTime) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10));
  if (!birth || !current || birth.year > current.year) return 'invalid';

  if (input.calendarType === 'lunar') {
    // No audited lunar->solar conversion at this boundary. At a threshold year
    // the exact 14th birthday cannot be proven, so reject instead of guessing.
    if (birth.year > current.year - 14) return 'under14_denied';
    if (birth.year === current.year - 14) return 'age_boundary_unverified';
    // For adult purchase, no lunar-only claim authorizes checkout.
    return birth.year < current.year - 19 ? 'adult' : 'free_minor';
  }

  if (compareDate(birth, current) > 0) return 'invalid';
  const fullYears = current.year - birth.year - (birth.month > current.month || (birth.month === current.month && birth.day > current.day) ? 1 : 0);
  if (fullYears < LEGAL_MINOR_AGE_POLICY_V1.minimumFreeAge) return 'under14_denied';
  return fullYears < LEGAL_MINOR_AGE_POLICY_V1.minimumDirectPurchaseAge ? 'free_minor' : 'adult';
}
