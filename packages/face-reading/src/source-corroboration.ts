import type { ReviewStatus } from './contracts.js';
import { FaceAuthorityValidationError } from './validation.js';

export type SourceCorroborationRelation = 'quotes' | 'reprints' | 'transmits';
export type SourceCorroborationVerification =
  | 'indexed_transcription'
  | 'scan_page_checked'
  | 'double_checked';

export interface SourceTransmissionCorroboration {
  readonly corroborationId: string;
  readonly version: string;
  readonly targetPassageRef: string;
  readonly containerTitle: string;
  readonly containerSection: string;
  readonly witnessLabel: string;
  readonly digitalSourceUrl: string;
  readonly relation: SourceCorroborationRelation;
  readonly transmittedText: string;
  readonly verificationStatus: SourceCorroborationVerification;
  readonly mayPromoteDirectSource: false;
  readonly status: ReviewStatus;
}

export interface SourceCorroborationRegistry {
  readonly registryId: string;
  readonly version: string;
  readonly entries: readonly SourceTransmissionCorroboration[];
}

const STABLE_KEY = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;

function nonEmpty(value: string, path: string): void {
  if (value.trim().length === 0) {
    throw new FaceAuthorityValidationError(`${path} must be non-empty.`);
  }
}

function stableKey(value: string, path: string): void {
  if (!STABLE_KEY.test(value)) {
    throw new FaceAuthorityValidationError(`${path} must be a stable authority key.`);
  }
}

function verificationRank(status: SourceCorroborationVerification): number {
  switch (status) {
    case 'indexed_transcription': return 0;
    case 'scan_page_checked': return 1;
    case 'double_checked': return 2;
  }
}

export function validateSourceCorroborationRegistry(
  registry: SourceCorroborationRegistry,
  knownDirectPassageRefs: ReadonlySet<string>,
): void {
  stableKey(registry.registryId, 'sourceCorroborationRegistry.registryId');
  nonEmpty(registry.version, `${registry.registryId}.version`);
  const refs = new Set<string>();

  for (const entry of registry.entries) {
    stableKey(entry.corroborationId, 'sourceCorroboration.corroborationId');
    nonEmpty(entry.version, `${entry.corroborationId}.version`);
    const ref = `${entry.corroborationId}@${entry.version}`;
    if (refs.has(ref)) {
      throw new FaceAuthorityValidationError(`Duplicate source corroboration: ${ref}`);
    }
    refs.add(ref);

    if (!knownDirectPassageRefs.has(entry.targetPassageRef)) {
      throw new FaceAuthorityValidationError(`${ref} references unknown direct passage ${entry.targetPassageRef}.`);
    }
    nonEmpty(entry.containerTitle, `${ref}.containerTitle`);
    nonEmpty(entry.containerSection, `${ref}.containerSection`);
    nonEmpty(entry.witnessLabel, `${ref}.witnessLabel`);
    nonEmpty(entry.digitalSourceUrl, `${ref}.digitalSourceUrl`);
    nonEmpty(entry.transmittedText, `${ref}.transmittedText`);

    if (entry.mayPromoteDirectSource !== false) {
      throw new FaceAuthorityValidationError(`${ref} must never promote a direct-source passage by itself.`);
    }
    if (
      entry.status === 'production_authorized' &&
      verificationRank(entry.verificationStatus) < verificationRank('scan_page_checked')
    ) {
      throw new FaceAuthorityValidationError(
        `${ref} production-authorized corroboration requires scan_page_checked or stronger verification.`,
      );
    }
  }
}

export const FACE_SOURCE_CORROBORATION_RESEARCH_V0: SourceCorroborationRegistry = {
  registryId: 'source-corroboration.face.research_v0',
  version: '0.1.0',
  entries: [
    {
      corroborationId: 'corroboration.gujin_tushu.shenxiang.discernment',
      version: '0.1.0',
      targetPassageRef: 'passage.shenxiang.five_officers.discernment',
      containerTitle: '欽定古今圖書集成',
      containerSection: '博物彙編藝術典 第六百三十二卷 / 相術部彙考二 / 神相全編二',
      witnessLabel: 'Gujin Tushu Jicheng, Volume 473 (1700–1725), Wikisource page 16 transcription',
      digitalSourceUrl: 'https://zh.wikisource.org/wiki/Page:Gujin_Tushu_Jicheng,_Volume_473_(1700-1725).djvu/16',
      relation: 'transmits',
      transmittedText: '五官者，一曰耳為採聽官；二曰眉為保壽官；三曰眼為監察官；四曰鼻為審辨官；五曰口為出納官。審辨官條傳載鼻之梁柱端直等條件。',
      verificationStatus: 'indexed_transcription',
      mayPromoteDirectSource: false,
      status: 'research',
    },
  ],
};
