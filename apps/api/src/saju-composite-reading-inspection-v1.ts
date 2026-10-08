import { projectProductReadingResponseV2 } from '../../../packages/api-client/src/product-reading-display.js';
import { CURRENT_SUBJECT_SAJU_PREVIEW_READING_TEXTS_V1 } from './current-subject-saju-preview-reading-http.js';

export const SAJU_COMPOSITE_READING_INSPECTION_VERSION_V1 =
  'myeongha-saju-composite-reading-inspection-v1' as const;

const supportedReadingTexts = new Set<string>(CURRENT_SUBJECT_SAJU_PREVIEW_READING_TEXTS_V1);
const ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_:./-]{3,180}$/u;
const RESULT_FIELDS = new Set(['slotId', 'readingText', 'binding', 'profileRef', 'sourceEvidenceRef', 'response']);
const ROOT_FIELDS = new Set(['mode', 'productId', 'productVersion', 'context', 'slots', 'results']);
const CONTEXT_FIELDS = new Set(['subjectId', 'birthProfileId', 'birthRevisionId', 'birthRevisionNo', 'engineVersion', 'sourceSnapshotRef']);
const SLOT_FIELDS = new Set(['slotId', 'requirement', 'readingText', 'profileRef']);
const PROFILE_FIELDS = new Set(['id', 'version', 'contentHash']);

export type SajuCompositeReadingInspectionStateV1 =
  | 'consistent_fixture'
  | 'held_for_policy'
  | 'blocked';

export type SajuCompositeReadingInspectionReasonV1 =
  | 'invalid_input'
  | 'unapproved_reading_text'
  | 'unknown_result_slot'
  | 'duplicate_result_slot'
  | 'missing_required_slot'
  | 'missing_optional_slot'
  | 'binding_mismatch'
  | 'profile_ref_mismatch'
  | 'source_evidence_missing'
  | 'response_not_delivered'
  | 'invalid_response'
  | 'duplicate_reading_identity';

type RecordValue = Record<string, unknown>;

export type SajuCompositeProfileReferenceV1 = Readonly<{
  id: string;
  version: string;
  contentHash: string;
}>;

export type SajuCompositeContextPinV1 = Readonly<{
  subjectId: string;
  birthProfileId: string;
  birthRevisionId: string;
  birthRevisionNo: number;
  engineVersion: string;
  sourceSnapshotRef: string;
}>;

export type SajuCompositeSlotInspectionV1 = Readonly<{
  slotId: string;
  requirement: 'required' | 'optional';
  readingText: string;
  profileRef: SajuCompositeProfileReferenceV1;
}>;

export type SajuCompositeResultInspectionV1 = Readonly<{
  slotId: string;
  readingText: string;
  binding: SajuCompositeContextPinV1;
  profileRef: SajuCompositeProfileReferenceV1;
  /** Identifier for a separately verified source evidence artifact; NOT proof by itself. */
  sourceEvidenceRef: string;
  response: unknown;
}>;

/**
 * This input is intended to be assembled by a server or synthetic fixture.
 * A pure function cannot establish provenance of caller-supplied pins.
 */
export type SajuCompositeReadingInspectionInputV1 = Readonly<{
  mode: 'synthetic_inspection_only';
  productId: string;
  productVersion: string;
  context: SajuCompositeContextPinV1;
  slots: readonly SajuCompositeSlotInspectionV1[];
  results: readonly SajuCompositeResultInspectionV1[];
}>;

export type SajuCompositeReadingInspectionResultV1 = Readonly<{
  inspectionVersion: typeof SAJU_COMPOSITE_READING_INSPECTION_VERSION_V1;
  state: SajuCompositeReadingInspectionStateV1;
  reason?: SajuCompositeReadingInspectionReasonV1;
  productId?: string;
  productVersion?: string;
  inspected: readonly Readonly<{
    slotId: string;
    readingId: string;
    responseId: string;
    profileRef: SajuCompositeProfileReferenceV1;
    sourceEvidenceRef: string;
  }>[];
  sourceAuthority: 'NOT_EVALUATED';
  releaseAuthorization: 'NOT_EVALUATED';
  canExecute: false;
  canPublish: false;
  canSell: false;
}>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: RecordValue, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function profileRef(value: unknown): value is SajuCompositeProfileReferenceV1 {
  return isRecord(value)
    && hasExactKeys(value, PROFILE_FIELDS)
    && identifier(value.id)
    && identifier(value.version)
    && typeof value.contentHash === 'string'
    && HASH_PATTERN.test(value.contentHash);
}

function contextPin(value: unknown): value is SajuCompositeContextPinV1 {
  return isRecord(value)
    && hasExactKeys(value, CONTEXT_FIELDS)
    && identifier(value.subjectId)
    && identifier(value.birthProfileId)
    && identifier(value.birthRevisionId)
    && Number.isSafeInteger(value.birthRevisionNo)
    && (value.birthRevisionNo as number) > 0
    && identifier(value.engineVersion)
    && identifier(value.sourceSnapshotRef);
}

function sameContext(left: SajuCompositeContextPinV1, right: SajuCompositeContextPinV1): boolean {
  return left.subjectId === right.subjectId
    && left.birthProfileId === right.birthProfileId
    && left.birthRevisionId === right.birthRevisionId
    && left.birthRevisionNo === right.birthRevisionNo
    && left.engineVersion === right.engineVersion
    && left.sourceSnapshotRef === right.sourceSnapshotRef;
}

function sameProfile(left: SajuCompositeProfileReferenceV1, right: SajuCompositeProfileReferenceV1): boolean {
  return left.id === right.id
    && left.version === right.version
    && left.contentHash === right.contentHash;
}

function result(
  state: SajuCompositeReadingInspectionStateV1,
  reason?: SajuCompositeReadingInspectionReasonV1,
  fields: Pick<SajuCompositeReadingInspectionResultV1, 'productId' | 'productVersion'> = {},
  inspected: SajuCompositeReadingInspectionResultV1['inspected'] = Object.freeze([]),
): SajuCompositeReadingInspectionResultV1 {
  return Object.freeze({
    inspectionVersion: SAJU_COMPOSITE_READING_INSPECTION_VERSION_V1,
    state,
    ...(reason === undefined ? {} : { reason }),
    ...fields,
    inspected,
    sourceAuthority: 'NOT_EVALUATED' as const,
    releaseAuthorization: 'NOT_EVALUATED' as const,
    canExecute: false as const,
    canPublish: false as const,
    canSell: false as const,
  });
}

function invalid(): SajuCompositeReadingInspectionResultV1 {
  return result('blocked', 'invalid_input');
}

/**
 * Inspect synthetically bound multi-slot Reading results only.
 * This is not source admission, semantic coverage authorization,
 * execution permission, an API entry point, or launch authorization.
 *
 * No reading text or claim content is returned. The inspected summaries
 * cannot be used to construct a ProductReadingResponse or a new Saju claim.
 */
export function inspectGovernedSajuCompositeReadingV1(
  input: unknown,
): SajuCompositeReadingInspectionResultV1 {
  if (!isRecord(input)
    || !hasExactKeys(input, ROOT_FIELDS)
    || input.mode !== 'synthetic_inspection_only'
    || typeof input.productId !== 'string'
    || !ID_PATTERN.test(input.productId)
    || typeof input.productVersion !== 'string'
    || !ID_PATTERN.test(input.productVersion)
    || !contextPin(input.context)
    || !Array.isArray(input.slots)
    || input.slots.length < 2
    || input.slots.length > 8
    || !Array.isArray(input.results)
    || input.results.length > input.slots.length) return invalid();

  const context = input.context;
  const slots: SajuCompositeSlotInspectionV1[] = [];
  const slotIds = new Set<string>();
  for (const value of input.slots) {
    if (!isRecord(value)
      || !hasExactKeys(value, SLOT_FIELDS)
      || typeof value.slotId !== 'string'
      || !ID_PATTERN.test(value.slotId)
      || (value.requirement !== 'required' && value.requirement !== 'optional')
      || typeof value.readingText !== 'string'
      || !profileRef(value.profileRef)
      || slotIds.has(value.slotId)) return invalid();

    if (!supportedReadingTexts.has(value.readingText)) {
      return result('blocked', 'unapproved_reading_text');
    }
    slotIds.add(value.slotId);
    slots.push(value as SajuCompositeSlotInspectionV1);
  }

  if (!slots.some((slot) => slot.requirement === 'required')) return invalid();

  const fields = { productId: input.productId, productVersion: input.productVersion };
  const found = new Map<string, SajuCompositeResultInspectionV1>();
  for (const value of input.results) {
    if (!isRecord(value)
      || !hasExactKeys(value, RESULT_FIELDS)
      || typeof value.slotId !== 'string'
      || !ID_PATTERN.test(value.slotId)
      || typeof value.readingText !== 'string'
      || !contextPin(value.binding)
      || !profileRef(value.profileRef)) return invalid();

    if (!slotIds.has(value.slotId)) return result('blocked', 'unknown_result_slot', fields);
    if (found.has(value.slotId)) return result('blocked', 'duplicate_result_slot', fields);
    found.set(value.slotId, value as SajuCompositeResultInspectionV1);
  }

  const seenResponseIds = new Set<string>();
  const seenReadingIds = new Set<string>();
  const inspected: SajuCompositeReadingInspectionResultV1['inspected'][number][] = [];

  for (const slot of slots) {
    const candidate = found.get(slot.slotId);
    if (candidate === undefined) {
      return result(
        slot.requirement === 'required' ? 'blocked' : 'held_for_policy',
        slot.requirement === 'required' ? 'missing_required_slot' : 'missing_optional_slot',
        fields,
      );
    }

    if (candidate.readingText !== slot.readingText || !sameContext(context, candidate.binding)) {
      return result('blocked', 'binding_mismatch', fields);
    }
    if (!sameProfile(slot.profileRef, candidate.profileRef)) {
      return result('blocked', 'profile_ref_mismatch', fields);
    }
    if (!identifier(candidate.sourceEvidenceRef)) {
      return result('blocked', 'source_evidence_missing', fields);
    }

    let display;
    try {
      // Existing shared Product Reading display contract. This is NOT source admission.
      display = projectProductReadingResponseV2(candidate.response);
    } catch {
      return result('blocked', 'invalid_response', fields);
    }

    if (display.kind !== 'delivered') {
      return result(
        slot.requirement === 'required' ? 'blocked' : 'held_for_policy',
        'response_not_delivered',
        fields,
      );
    }

    const rawResponse = candidate.response as RecordValue;
    const responseId = rawResponse.responseId as string;
    if (seenResponseIds.has(responseId) || seenReadingIds.has(display.readingId)) {
      return result('blocked', 'duplicate_reading_identity', fields);
    }
    seenResponseIds.add(responseId);
    seenReadingIds.add(display.readingId);

    inspected.push(Object.freeze({
      slotId: slot.slotId,
      readingId: display.readingId,
      responseId,
      profileRef: Object.freeze({ ...slot.profileRef }),
      sourceEvidenceRef: candidate.sourceEvidenceRef,
    }));
  }

  return result('consistent_fixture', undefined, fields, Object.freeze(inspected));
}
