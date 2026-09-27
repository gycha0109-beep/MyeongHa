import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import {
  ProductionPostgresTlsPeerPreflightError,
  fetchGovernedVercelProductionEnvMetadata,
  inspectVercelDatabaseEnvMetadata,
} from './run-production-postgres-tls-peer-preflight.mjs';

export const VERCEL_METADATA_BRIDGE_MARKER_PATH =
  'config/operations/run-once/production-postgres-tls-peer-vercel-metadata-b2a.marker';
export const VERCEL_METADATA_BRIDGE_MARKER_VALUE =
  'VERIFY_POSTGRES_TLS_PEER_B2A_VERCEL_METADATA_ONCE\n';
export const VERCEL_METADATA_BRIDGE_TRACK = 'security';

function fail(code, message) {
  throw new ProductionPostgresTlsPeerPreflightError(code, message);
}

function requireNonEmptyString(value, code, message) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(code, message);
  }
  return value.trim();
}

export function validateProductionPostgresTlsVercelMetadataBridge(input) {
  if (input.eventName !== 'push') {
    return fail(
      'VERCEL_METADATA_BRIDGE_EVENT_INVALID',
      'Vercel metadata bridge requires a push event.',
    );
  }
  if (input.ref !== 'refs/heads/main') {
    return fail(
      'VERCEL_METADATA_BRIDGE_REF_INVALID',
      'Vercel metadata bridge requires main.',
    );
  }
  if (input.track !== VERCEL_METADATA_BRIDGE_TRACK) {
    return fail(
      'VERCEL_METADATA_BRIDGE_TRACK_INVALID',
      'Vercel metadata bridge requires the security track.',
    );
  }
  if (input.markerPath !== VERCEL_METADATA_BRIDGE_MARKER_PATH) {
    return fail(
      'VERCEL_METADATA_BRIDGE_PATH_INVALID',
      'Vercel metadata bridge marker path is invalid.',
    );
  }
  if (input.markerContent !== VERCEL_METADATA_BRIDGE_MARKER_VALUE) {
    return fail(
      'VERCEL_METADATA_BRIDGE_MARKER_INVALID',
      'Vercel metadata bridge marker value is invalid.',
    );
  }

  return Object.freeze({
    event: 'push',
    ref: 'refs/heads/main',
    track: VERCEL_METADATA_BRIDGE_TRACK,
    markerPath: VERCEL_METADATA_BRIDGE_MARKER_PATH,
    markerExact: true,
  });
}

export function buildProductionPostgresTlsVercelMetadataBridgeEvidence(payload) {
  const metadata = inspectVercelDatabaseEnvMetadata(payload);
  return Object.freeze({
    schemaVersion:
      'myeongha-production-postgres-tls-vercel-metadata-bridge-v1',
    ...metadata,
    vercelDecryptRequested: false,
    productionDatabaseConnectionAttempted: false,
    productionDatabaseUrlRead: false,
    productionDatabaseUrlEmitted: false,
    productionDatabaseUrlMutated: false,
    productionVercelBindingMutated: false,
    credentialMaterialEmitted: false,
  });
}

export async function runProductionPostgresTlsVercelMetadataBridge(
  env = process.env,
) {
  const markerPath =
    env.MYEONGHA_POSTGRES_TLS_PEER_VERCEL_METADATA_BRIDGE_MARKER_PATH ?? '';

  let markerContent = '';
  try {
    markerContent = readFileSync(markerPath, 'utf8');
  } catch {
    return fail(
      'VERCEL_METADATA_BRIDGE_MARKER_MISSING',
      'Vercel metadata bridge marker is missing.',
    );
  }

  validateProductionPostgresTlsVercelMetadataBridge({
    eventName: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    track: env.MYEONGHA_WATCHTOWER_TRACK,
    markerPath,
    markerContent,
  });

  const vercelToken = requireNonEmptyString(
    env.VERCEL_TOKEN,
    'VERCEL_TOKEN_MISSING',
    'VERCEL_TOKEN is required for metadata-only Vercel preflight.',
  );

  const payload = await fetchGovernedVercelProductionEnvMetadata({
    vercelToken,
  });

  return buildProductionPostgresTlsVercelMetadataBridgeEvidence(payload);
}

function printEvidence(evidence) {
  console.log('postgres_tls_vercel_metadata_bridge=pass');
  console.log(
    `vercel_database_env_exists=${evidence.vercelDatabaseEnvExists}`,
  );
  console.log(
    `vercel_database_env_target=${evidence.vercelDatabaseEnvTarget}`,
  );
  console.log(
    `vercel_database_env_type=${evidence.vercelDatabaseEnvType}`,
  );
  console.log(
    `vercel_database_env_value_read=${evidence.vercelDatabaseEnvValueRead}`,
  );
  console.log(
    `preferred_b2b_execution=${evidence.preferredB2bExecution}`,
  );
  console.log(
    `vercel_decrypt_requested=${evidence.vercelDecryptRequested}`,
  );
  console.log(
    `production_database_connection_attempted=${evidence.productionDatabaseConnectionAttempted}`,
  );
  console.log(
    `production_database_url_read=${evidence.productionDatabaseUrlRead}`,
  );
  console.log(
    `production_database_url_emitted=${evidence.productionDatabaseUrlEmitted}`,
  );
  console.log(
    `production_database_url_mutated=${evidence.productionDatabaseUrlMutated}`,
  );
  console.log(
    `production_vercel_binding_mutated=${evidence.productionVercelBindingMutated}`,
  );
  console.log(
    `credential_material_emitted=${evidence.credentialMaterialEmitted}`,
  );
}

const directExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (directExecution) {
  try {
    printEvidence(await runProductionPostgresTlsVercelMetadataBridge());
  } catch (error) {
    const code =
      error instanceof ProductionPostgresTlsPeerPreflightError
        ? error.code
        : 'UNEXPECTED_VERCEL_METADATA_BRIDGE_FAILURE';
    console.error(`postgres_tls_vercel_metadata_bridge=fail code=${code}`);
    process.exitCode = 1;
  }
}
