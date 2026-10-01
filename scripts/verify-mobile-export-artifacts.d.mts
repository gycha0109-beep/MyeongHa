export type MobileExportPlatformV1 = 'android' | 'ios';

export interface MobileExportArtifactReportV1 {
  readonly platform: MobileExportPlatformV1;
  readonly metadataPath: string;
  readonly bundleCount: number;
  readonly bundleBytes: number;
}

export function inspectMobileExportPlatformV1(
  exportRoot: string,
  platform: MobileExportPlatformV1,
): Promise<MobileExportArtifactReportV1>;

export function verifyMobileExportArtifactsV1(
  exportRoot: string,
): Promise<readonly MobileExportArtifactReportV1[]>;
