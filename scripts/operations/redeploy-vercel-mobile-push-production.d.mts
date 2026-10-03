export const VERCEL_MOBILE_PUSH_REDEPLOY_V1: Readonly<{
  projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
  teamId: 'team_xuYA9OhCWlJETaYFOmeVodgS';
  productionHost: 'myeongha.vercel.app';
  pollAttempts: 48;
  pollIntervalMs: 5000;
}>;

export interface RedeployVercelMobilePushProductionInputV1 {
  readonly token?: string | undefined;
  readonly projectId: string;
  readonly teamId: string;
  readonly productionHost: string;
  readonly fetchImpl?: typeof fetch | undefined;
  readonly sleepImpl?: ((ms: number) => Promise<void>) | undefined;
  readonly pollAttempts?: number | undefined;
  readonly pollIntervalMs?: number | undefined;
}

export interface RedeployVercelMobilePushProductionResultV1 {
  readonly ready: true;
  readonly deploymentId: string;
  readonly sourceDeploymentId: string;
  readonly state: 'READY';
}

export function redeployVercelMobilePushProductionV1(
  input: RedeployVercelMobilePushProductionInputV1,
): Promise<RedeployVercelMobilePushProductionResultV1>;
