export type SocialAuthAuditFlagStateV1 =
  | 'missing' | 'ambiguous' | 'enabled' | 'disabled' | 'unverified';
export type SocialAuthAuditKeyStateV1 = 'missing' | 'present' | 'ambiguous';

export const SOCIAL_AUTH_VERCEL_PRODUCTION_INSPECT_V1: Readonly<{
  projectId: string;
  teamId: string;
  keys: readonly string[];
  naverSupportKeys: readonly string[];
}>;

export interface VercelSocialAuthProductionInventoryV1 {
  readonly flags: Readonly<Record<string, SocialAuthAuditFlagStateV1>>;
  readonly support: Readonly<Record<string, SocialAuthAuditKeyStateV1>>;
}

export function classifySocialAuthProductionEnvsV1(
  envs: readonly Readonly<{ key?: string; target?: readonly string[]; value?: unknown }>[],
): VercelSocialAuthProductionInventoryV1;

export function inspectVercelSocialAuthProductionV1(input: {
  projectId: string;
  teamId: string;
  token: string;
  fetchImpl?: (
    url: URL,
    init: RequestInit,
  ) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;
}): Promise<VercelSocialAuthProductionInventoryV1>;
