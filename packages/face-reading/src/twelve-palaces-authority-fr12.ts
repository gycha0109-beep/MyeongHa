import type {
  FaceAuthorityRegistry,
  FaceMethodologyPackDefinition,
} from './contracts.js';
import {
  FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  FACE_METHOD_REFS_V0,
  FACE_RESEARCH_PACK_V0,
} from './research-pack-v0.js';
import {
  LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0,
  SHENXIANG_TWELVE_PALACE_METHOD_REF_V0,
  TWELVE_PALACE_LOCATOR_PASSAGES_V0,
  TWELVE_PALACE_METHODOLOGIES_V0,
  TWELVE_PALACE_REGION_MAPS_V0,
} from './twelve-palaces-research-v0.js';

export const FACE_RESEARCH_PACK_FR12: FaceMethodologyPackDefinition = {
  ...FACE_RESEARCH_PACK_V0,
  version: '0.3.0',
  methodologyDefinitionRefs: [
    ...FACE_RESEARCH_PACK_V0.methodologyDefinitionRefs.filter(
      (ref) => ref !== FACE_METHOD_REFS_V0.twelvePalaces,
    ),
    SHENXIANG_TWELVE_PALACE_METHOD_REF_V0,
    LIUZHUANG_TWELVE_PALACE_METHOD_REF_V0,
  ],
  regionMapRefs: [
    ...FACE_RESEARCH_PACK_V0.regionMapRefs,
    ...TWELVE_PALACE_REGION_MAPS_V0.map(
      (map) => `${map.regionMapId}@${map.version}`,
    ),
  ],
};

export const FACE_AUTHORITY_RESEARCH_REGISTRY_FR12: FaceAuthorityRegistry = {
  ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0,
  passages: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.passages,
    ...TWELVE_PALACE_LOCATOR_PASSAGES_V0,
  ],
  methodologies: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.methodologies,
    ...TWELVE_PALACE_METHODOLOGIES_V0,
  ],
  regionMaps: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.regionMaps,
    ...TWELVE_PALACE_REGION_MAPS_V0,
  ],
  methodologyPacks: [
    ...FACE_AUTHORITY_RESEARCH_REGISTRY_V0.methodologyPacks,
    FACE_RESEARCH_PACK_FR12,
  ],
};
