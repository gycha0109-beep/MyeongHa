// Watchtower-Track: security
// Complete production dependency COMPOSITION for an independently owned
// direct TLS Node socket. This does NOT mount/open a public listener.
// Full G0/G3 and separate external-host approval are still required.
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createProductionRequestIdentityVerifierV1,
} from './production-request-identity-verifier.js';
import {
  parseProductionUserDataRuntimeConfigV1,
  type ProductionUserDataRuntimeEnvV1,
} from './production-user-data-runtime-config.js';
import {
  createProductionPostgresSubjectPoolLeaseV1,
} from './production-postgres-subject-pool-lease.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { SupabaseMemberVerifierFetchV1 } from './supabase-member-identity-verifier.js';
import {
  parseSeyeonGovernedDbConfigV1,
} from './seyeon-governed-postgres-pool-v1.js';
import {
  createSeyeonProductionChatGovernorsV1,
  type SeyeonProductionChatGovernorApprovalV1,
} from './seyeon-production-governor-factory-v1.js';
import {
  createProductionSeyeonChatRuntimeV1,
  type ProductionSeyeonChatRuntimeV1,
} from './production-seyeon-chat-runtime-v1.js';
import type {
  OpenAiSeyeonStructuredProviderConfigV1,
} from './openai-seyeon-structured-provider-v1.js';
import {
  SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1,
} from './seyeon-public-content-compatibility-v1.js';
import {
  startSeyeonFirstZeroDirectHttpsLoopbackV1,
  type SeyeonFirstZeroDirectHttpsLoopbackLeaseV1,
} from './seyeon-first-zero-direct-https-loopback-host-v1.js';

export const SEYEON_DIRECT_HTTPS_PRODUCTION_COMPOSITION_V1 = Object.freeze({
  schemaVersion: 'seyeon-direct-https-production-composition-v1',
  defaultExposure: 'loopback-only',
  directNativeProviderOnly: true,
  governorMode: 'ENFORCE',
  fourRolesRequired: true,
  dedicatedCostDbRequired: true,
  productionPublicActivationApproved: false,
  vercelFetchProxyApproved: false,
  positiveAndHistoricalSourceRevealApproved: false,
} as const);

type FourSeyeonRoleV1 = 'preflight' | 'interpreter' | 'renderer' | 'reviewer';
const FOUR_ROLES: readonly FourSeyeonRoleV1[] = [
  'preflight', 'interpreter', 'renderer', 'reviewer',
] as const;
const MODEL_KEYS: Readonly<Record<FourSeyeonRoleV1, string>> = {
  preflight: 'SEYEON_MODEL_PREFLIGHT',
  interpreter: 'SEYEON_MODEL_INTERPRETER',
  renderer: 'SEYEON_MODEL_RENDERER',
  reviewer: 'SEYEON_MODEL_REVIEWER',
};

export interface CreateSeyeonDirectHttpsProductionCompositionInputV1 {
  readonly env: ProductionUserDataRuntimeEnvV1;
  /** Approved, immutable, server-owned cost model policy; never HTTP-sourced. */
  readonly governorApproval: SeyeonProductionChatGovernorApprovalV1;
  readonly certificatePem: string | Buffer;
  readonly privateKeyPem: string | Buffer;
  readonly expectedDnsHost: string;
  /** Reuse pre-existing Subject Pool ownership for internal acceptance only. */
  readonly pool?: PostgresSubjectPoolV1;
  readonly memberFetchImpl?: SupabaseMemberVerifierFetchV1;
  /**
   * Synthetic-only seam: never accepted outside Vitest. Production creates its
   * native Provider from the approved four-role Governor and segregated DB.
   */
  readonly testOnlyRuntimeFactory?: () => Pick<ProductionSeyeonChatRuntimeV1, 'run' | 'close'>;
}

export interface SeyeonDirectHttpsProductionCompositionLeaseV1 {
  readonly port: number;
  readonly server: SeyeonFirstZeroDirectHttpsLoopbackLeaseV1['server'];
  readonly transport: 'node-tls-loopback' ;
  close(): Promise<void>;
}

function requiredProductionString(
  env: ProductionUserDataRuntimeEnvV1,
  name: string,
  minimumLength = 1,
): string {
  const raw = env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length < minimumLength ||
      value.includes('\n') || value.includes('\r')) {
    throw new Error(`Direct HTTPS production runtime requires approved ${name}.`);
  }
  return value;
}

function requireDirectNativeProvider(
  env: ProductionUserDataRuntimeEnvV1,
): Readonly<{
  base: OpenAiSeyeonStructuredProviderConfigV1;
  roleProviders: Readonly<Record<FourSeyeonRoleV1, OpenAiSeyeonStructuredProviderConfigV1>>;
}> {
  // Vercel OIDC and AI Gateway are forbidden in a stand-alone TLS process.
  // Provider keys must come from the operator's protected secret store; no
  // API key, OIDC token, or model name is accepted from an HTTP request.
  const key = requiredProductionString(env, 'OPENAI_API_KEY', 20);
  const models = {} as Record<FourSeyeonRoleV1, OpenAiSeyeonStructuredProviderConfigV1>;
  for (const role of FOUR_ROLES) {
    const model = requiredProductionString(env, MODEL_KEYS[role]);
    models[role] = Object.freeze({ apiKey: key, model });
  }
  return Object.freeze({
    base: models.preflight,
    roleProviders: Object.freeze(models),
  });
}

/**
 * Composes existing canonical Supabase Member verification, strict PG login,
 * segregated ENFORCE cost Governor, four native model roles, immutable Pin
 * checks and fresh DB original retrieval into ONE direct Node/TLS host.
 *
 * This is an internal **loopback** acceptance service. It intentionally has
 * no public-network bind, domain, reverse proxy, Vercel dispatcher or CLI
 * boot path; the independent external delivery/revocation ACK contract must
 * be approved before any public serving is added.
 */
export async function startSeyeonDirectHttpsProductionCompositionV1(
  input: CreateSeyeonDirectHttpsProductionCompositionInputV1,
): Promise<SeyeonDirectHttpsProductionCompositionLeaseV1> {
  if (input.testOnlyRuntimeFactory !== undefined &&
      process.env.NODE_ENV !== 'test') {
    throw new Error('Synthetic direct HTTPS runtime override forbidden outside tests.');
  }
  const config = parseProductionUserDataRuntimeConfigV1(input.env);
  const native = requireDirectNativeProvider(input.env);
  // Every role must have a native provider, an approved price, tokenizer
  // budget, and binding. Missing governor approval blocks BEFORE any pool
  // is instantiated or network listener is opened.
  const governed = createSeyeonProductionChatGovernorsV1({
    baseProviderConfig: native.base,
    roleProviderConfigs: native.roleProviders,
    approval: input.governorApproval,
  });
  const costDbConfig = parseSeyeonGovernedDbConfigV1({
    env: input.env,
    ordinaryDatabaseUrl: config.databaseUrl,
    ordinaryDatabasePrincipal: config.databasePrincipal,
    rootCertificatePem: config.databaseSslRootCertificatePem ?? '',
  });
  const identityVerifier: IdentityEvidenceVerificationPortV1 =
    createProductionRequestIdentityVerifierV1({
      config,
      ...(input.memberFetchImpl === undefined ? {} : { memberFetchImpl: input.memberFetchImpl }),
    });
  const poolLease = createProductionPostgresSubjectPoolLeaseV1({
    config,
    ...(input.pool === undefined ? {} : { pool: input.pool }),
  });
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const active = new Set<Promise<unknown>>();
  let host: SeyeonFirstZeroDirectHttpsLoopbackLeaseV1;
  try {
    const runtime = Object.freeze({
      run: (request: Parameters<ProductionSeyeonChatRuntimeV1['run']>[0]) => {
        if (closing) {
          throw new Error('Direct HTTPS service is closing; no Provider may start.');
        }
        const pending = (async () => {
          const perTurn = input.testOnlyRuntimeFactory?.() ??
            createProductionSeyeonChatRuntimeV1({
              databaseConfig: config,
              pool: poolLease.pool,
              providerConfig: native.base,
              roleProviderConfigs: governed.roleProviderConfigs,
              costGovernorForRole: governed.costGovernorForRole,
              governedDbConfig: costDbConfig,
              governorMode: 'ENFORCE',
              clientCompatibilityProfile: SEYEON_PRODUCTION_WEB_COMPATIBILITY_PROFILE_V1,
            });
          try {
            return await perTurn.run(request);
          } finally {
            await perTurn.close();
          }
        })();
        active.add(pending);
        void pending.finally(() => { active.delete(pending); }).catch(() => undefined);
        return pending;
      },
    });
    host = await startSeyeonFirstZeroDirectHttpsLoopbackV1({
      certificatePem: input.certificatePem,
      privateKeyPem: input.privateKeyPem,
      expectedDnsHost: input.expectedDnsHost,
      identityEvidenceVerifier: identityVerifier,
      pool: poolLease.pool,
      runtime,
    });
  } catch (error) {
    await poolLease.close();
    throw error;
  }
  return Object.freeze({
    port: host.port,
    server: host.server,
    transport: 'node-tls-loopback' as const,
    close(): Promise<void> {
      closePromise ??= (async () => {
        closing = true;
        try {
          await host.close();
        } finally {
          try {
            await Promise.allSettled([...active]);
          } finally {
            await poolLease.close();
          }
        }
      })();
      return closePromise;
    },
  });
}
