import { MyeongHaApiClientV1 } from '@myeongha/api-client';
import Constants from 'expo-constants';

export const MOBILE_PRODUCTION_API_ORIGIN_V1 =
  'https://myeongha.vercel.app' as const;

function configuredApiOrigin(): string {
  const extra = Constants.expoConfig?.extra;
  const candidate =
    extra !== null &&
    typeof extra === 'object' &&
    typeof extra.apiOrigin === 'string'
      ? extra.apiOrigin
      : MOBILE_PRODUCTION_API_ORIGIN_V1;

  return candidate;
}

export function createMobileApiClientV1(origin: string): MyeongHaApiClientV1 {
  return new MyeongHaApiClientV1({ origin });
}

let configuredClient: MyeongHaApiClientV1 | undefined;

export function getMobileApiClientV1(): MyeongHaApiClientV1 {
  configuredClient ??= createMobileApiClientV1(configuredApiOrigin());
  return configuredClient;
}
