import type { BirthProfileReadResponseV1 } from './birth-profile-read.js';
import { bindCurrentBirthProfileRevisionForSajuV1 } from './saju-production-calculation-execution.js';
import {
  buildSajuProductionReadingRequestV1,
  type SajuProductionReadingHttpAdapterV1,
} from './saju-production-reading-http-adapter.js';

/**
 * Pure application execution boundary for one already-authorized Product Reading intent.
 *
 * It deliberately accepts an authoritative Birth Profile read result rather than client
 * Birth input. Persistence attempt allocation/finalization and Production Interpretation
 * Authority remain outside this function.
 */
export async function executeCurrentBirthProfileSajuReadingV1<AdmittedResponse>(input: {
  readonly profile: BirthProfileReadResponseV1;
  readonly readingText: string;
  readonly targetPersonRef?: string;
  readonly adapter: SajuProductionReadingHttpAdapterV1<AdmittedResponse>;
}): Promise<AdmittedResponse> {
  const birthRevision = bindCurrentBirthProfileRevisionForSajuV1(input.profile);
  const request = buildSajuProductionReadingRequestV1({
    birthRevision,
    readingText: input.readingText,
    ...(input.targetPersonRef === undefined
      ? {}
      : { targetPersonRef: input.targetPersonRef }),
  });
  return input.adapter.requestReading(request);
}
