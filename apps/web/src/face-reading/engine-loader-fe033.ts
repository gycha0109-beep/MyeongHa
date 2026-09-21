import {
  loadPhysiognomyEngineRuntimeV1,
  type PhysiognomyEngineRuntimeModuleV1,
} from '@myeongha/physiognomy-engine-runtime';

export const FACE_PREVIEW_ENGINE_DELIVERY_VERSION_FE033 =
  'MHA-FACE-PREVIEW-ENGINE-DELIVERY-FE033-v1' as const;

export function loadFacePreviewEngineFE033(): Promise<PhysiognomyEngineRuntimeModuleV1> {
  return loadPhysiognomyEngineRuntimeV1();
}
