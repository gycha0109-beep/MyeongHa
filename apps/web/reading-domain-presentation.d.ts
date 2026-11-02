export interface SajuDomainPresentationV1 {
  readonly icon: string;
  readonly title: string;
}

export declare const SAJU_DOMAIN_PRESENTATION_V1: Readonly<Record<
  'general' | 'family' | 'relationship' | 'compatibility' | 'career' | 'business' | 'wealth' | 'life_stage' | 'question_specific',
  Readonly<SajuDomainPresentationV1>
>>;

export declare function readingDomainPresentationV1(domain: string | null | undefined): Readonly<SajuDomainPresentationV1>;
