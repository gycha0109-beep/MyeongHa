import type { ReadingDetailRoute } from './reading-detail-route.js';

export const SAJU_CONSUMER_READING_ADAPTER_VERSION:
  'myeonghwa-consumer-reading-request-adapter-v2';
export const SAJU_BUTTON_REQUEST_MAPPING_VERSION:
  'myeongha-saju-button-request-v1';

export type SajuButtonEngineRequest =
  | Readonly<{
      state: 'ready';
      domain: string;
      readingText: string;
      adapterVersion: typeof SAJU_CONSUMER_READING_ADAPTER_VERSION;
      mappingVersion: typeof SAJU_BUTTON_REQUEST_MAPPING_VERSION;
      targetPersonRef?: string;
    }>
  | Readonly<{
      state: 'requires_input';
      domain: string;
      input: 'family_scope' | 'target_person' | 'question';
      adapterVersion: typeof SAJU_CONSUMER_READING_ADAPTER_VERSION;
      mappingVersion: typeof SAJU_BUTTON_REQUEST_MAPPING_VERSION;
    }>
  | Readonly<{ state: 'invalid'; reason: string }>;

export function resolveSajuButtonEngineRequest(
  route: ReadingDetailRoute,
  context?: {
    readonly familyScope?: 'parents' | 'children';
    readonly targetPersonRef?: string;
    readonly question?: string;
  },
): SajuButtonEngineRequest;
