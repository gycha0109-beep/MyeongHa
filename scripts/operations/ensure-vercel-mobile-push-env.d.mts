export const VERCEL_MOBILE_PUSH_SECRET_BINDINGS_V1: Readonly<{
  projectId: 'prj_nXF0b5uv27Lyucz2SEBxzdCRXVsP';
  teamId: 'team_xuYA9OhCWlJETaYFOmeVodgS';
  requiredKeys: readonly [
    'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET',
    'MYEONGHA_PUSH_TOKEN_FINGERPRINT_K1_SECRET',
  ];
  requiredType: 'sensitive';
  target: 'production';
}>;

export interface EnsureVercelMobilePushSecretsInputV1 {
  readonly token?: string | undefined;
  readonly projectId: string;
  readonly teamId: string;
  readonly fetchImpl?: typeof fetch | undefined;
}

export interface EnsureVercelMobilePushSecretsResultV1 {
  readonly ready: true;
  readonly created: readonly string[];
  readonly present: readonly string[];
}

export function ensureVercelMobilePushSecretsV1(
  input: EnsureVercelMobilePushSecretsInputV1,
): Promise<EnsureVercelMobilePushSecretsResultV1>;
