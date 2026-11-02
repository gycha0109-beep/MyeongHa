export type SajuElementKeyV1 = '목' | '화' | '토' | '금' | '수';
export type SajuRadarCountsV1 = Readonly<Record<SajuElementKeyV1, number>>;
export type SajuRadarPointV1 = Readonly<{ x: number; y: number }>;

export const SAJU_RADAR_ELEMENT_ORDER_V1: readonly SajuElementKeyV1[];
export const SAJU_RADAR_ELEMENT_COLORS_V1: Readonly<Record<SajuElementKeyV1, string>>;

export function sajuRadarElementLabelV1(
  element: SajuElementKeyV1, locale?: string,
): string;

export function buildSajuRadarGeometryV1(
  counts: SajuRadarCountsV1,
  options?: Readonly<{ cx?: number; cy?: number; radius?: number }>,
): Readonly<{
  center: SajuRadarPointV1;
  max: number;
  rings: readonly (readonly SajuRadarPointV1[])[];
  axes: readonly Readonly<{
    element: SajuElementKeyV1;
    value: number;
    point: SajuRadarPointV1;
    end: SajuRadarPointV1;
    label: SajuRadarPointV1;
  }>[];
}>;

export function mountSajuRadarV1(input: Readonly<{
  document: Document;
  chartRoot: HTMLElement;
  choicesRoot: HTMLElement;
  counts: SajuRadarCountsV1;
  locale?: string;
  selectedElement?: SajuElementKeyV1 | null;
  onSelect?: (element: SajuElementKeyV1) => void;
}>): ReturnType<typeof buildSajuRadarGeometryV1>;
