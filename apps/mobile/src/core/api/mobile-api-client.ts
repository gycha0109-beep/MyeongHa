import { MyeongHaApiClientV1 } from '@myeongha/api-client';

export function createMobileApiClientV1(origin: string): MyeongHaApiClientV1 {
  return new MyeongHaApiClientV1({ origin });
}
