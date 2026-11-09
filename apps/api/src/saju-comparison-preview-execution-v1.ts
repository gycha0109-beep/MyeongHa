import { ApiCommandError } from './api-error.js';
import {
  parseProductionSajuRuntimeConfigV1,
  type ProductionSajuRuntimeEnvV1,
} from './production-saju-runtime-config.js';
import { readBoundSajuComparisonBirthsV1 } from './saju-bound-comparison-births-v1.js';
import {
  awaitBoundedUpstreamJsonResponseHeadersV1,
  readBoundedUpstreamJsonTextV1,
} from './upstream-json-response-resource.js';

const PATH = '/api/preview/compatibility-charts';
const SLOTS = ['year', 'month', 'day', 'hour'] as const;
const PILLAR = /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/u;
type Pillar = { status: 'unavailable' } | { status: 'resolved'; value: string };
type BirthPairInput = Parameters<typeof readBoundSajuComparisonBirthsV1>[0];

export interface SajuComparisonUseAuthorityV1 {
  admit(input: Readonly<{
    purpose: 'saju_comparison_preview';
    subjectId: string;
    targetPersonId: string;
    sourceBirthRevisionId: string;
    targetBirthRevisionId: string;
  }>): Promise<boolean>;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unavailable(): ApiCommandError {
  return new ApiCommandError('SAJU_TEMPORARILY_UNAVAILABLE', 'Comparison calculation is unavailable.');
}

function readChart(value: unknown, role: 'self' | 'partner', timeKnown: boolean) {
  if (!record(value) || value.role !== role || !record(value.pillars)) throw unavailable();
  const pillars = value.pillars;
  const entries = SLOTS.map((slot): readonly [string, Pillar] => {
    const fact = pillars[slot];
    if (!record(fact)) throw unavailable();
    if (fact.status === 'unavailable' && !Object.hasOwn(fact, 'value')) {
      return [slot, { status: 'unavailable' }];
    }
    if (fact.status !== 'resolved' || typeof fact.value !== 'string' || !PILLAR.test(fact.value)
      || (slot === 'hour' && !timeKnown)) throw unavailable();
    return [slot, { status: 'resolved', value: fact.value }];
  });
  return { role, pillars: Object.fromEntries(entries) };
}

/** Internal transport for an explicitly authorized two-chart Preview use. */
export async function executeSajuComparisonPreviewV1(input: BirthPairInput & Readonly<{
  env: ProductionSajuRuntimeEnvV1;
  useAuthority?: SajuComparisonUseAuthorityV1;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}>) {
  const useAuthority = input.useAuthority;
  if (useAuthority === undefined) {
    throw new ApiCommandError('CAPABILITY_UNAVAILABLE', 'Comparison use authority is unavailable.');
  }
  const config = parseProductionSajuRuntimeConfigV1(input.env);
  const pair = await readBoundSajuComparisonBirthsV1(input);
  const use = Object.freeze({
    purpose: 'saju_comparison_preview' as const,
    subjectId: pair.subjectId,
    targetPersonId: pair.targetPersonId,
    sourceBirthRevisionId: pair.sourceBirthRevisionId,
    targetBirthRevisionId: pair.targetBirthRevisionId,
  });
  const requireUse = async () => {
    if (await useAuthority.admit(use) !== true) {
      throw new ApiCommandError('FORBIDDEN', 'Comparison use is not authorized.');
    }
  };
  await requireUse();

  let result: unknown;
  try {
    const signal = AbortSignal.timeout(15_000);
    const response = await awaitBoundedUpstreamJsonResponseHeadersV1(
      (input.fetchImpl ?? fetch)(config.serviceOrigin + PATH, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          authorization: 'Bearer ' + config.serviceBearer,
          'content-type': 'application/json',
        },
        body: JSON.stringify(pair.previewRequest),
        signal,
      }),
      signal,
    );
    if (response.status !== 200
      || response.headers.get('x-myeonghwa-reading-lifecycle') !== 'preview'
      || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      void response.body?.cancel().catch(() => undefined);
      throw unavailable();
    }
    result = JSON.parse(await readBoundedUpstreamJsonTextV1(response, {
      maximumBodyBytes: 16_384, signal,
    }));
  } catch {
    throw unavailable();
  }
  if (!record(result) || result.lifecycle !== 'internal_preview_only'
    || result.coverage !== 'calculation_facts_only' || result.generatedInterpretationClaims !== false
    || result.mayPublish !== false || result.mayPersist !== false || result.maySell !== false
    || !Array.isArray(result.subjects) || result.subjects.length !== 2) throw unavailable();
  const charts = [
    readChart(result.subjects[0], 'self', pair.previewRequest.birth.time !== null),
    readChart(result.subjects[1], 'partner', pair.previewRequest.partnerBirth.time !== null),
  ] as const;

  const current = await readBoundSajuComparisonBirthsV1(input);
  if (current.subjectId !== pair.subjectId) {
    throw new ApiCommandError('FORBIDDEN', 'Comparison owner changed during calculation.');
  }
  await requireUse();
  return {
    lifecycle: 'internal_preview_only' as const,
    coverage: 'calculation_facts_only' as const,
    charts,
    mayPublish: false as const,
    mayPersist: false as const,
    maySell: false as const,
  };
}
