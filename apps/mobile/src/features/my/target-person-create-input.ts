import type { TargetPersonCreateRequestV1 } from '@myeongha/api-client';

import {
  MobileBirthInputValidationErrorV1,
  buildMobileBirthProfileCreateRequestV1,
  type MobileBirthInputDraftV1,
} from '@/features/birth/birth-input';

export interface MobileTargetPersonCreateDraftV1 extends MobileBirthInputDraftV1 {
  readonly displayLabel: string;
  readonly relationshipLabel: string;
}

export { MobileBirthInputValidationErrorV1 };

export function buildMobileTargetPersonCreateRequestV1(
  draft: MobileTargetPersonCreateDraftV1,
): TargetPersonCreateRequestV1 {
  const birthRequest = buildMobileBirthProfileCreateRequestV1(draft);
  return Object.freeze({
    displayLabel: draft.displayLabel,
    relationshipLabel: draft.relationshipLabel,
    input: birthRequest.input,
  });
}
