import { createMobileHomeControllerV1 } from '@/features/home/mobile-home-controller';
import { mobileHomeServiceV1 } from '@/features/home/native-mobile-home-service';

export const mobileHomeControllerV1 = createMobileHomeControllerV1({
  service: mobileHomeServiceV1,
  cacheTtlMs: 60_000,
});
