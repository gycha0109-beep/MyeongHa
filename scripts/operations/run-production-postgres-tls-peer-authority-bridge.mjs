import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import {
  ProductionPostgresTlsPeerPreflightError,
  inspectProductionSessionPoolerHost,
  inspectServerRootCertificatePem,
} from './run-production-postgres-tls-peer-preflight.mjs';

export const AUTHORITY_BRIDGE_MARKER_PATH =
  'config/operations/run-once/production-postgres-tls-peer-authority-b2a.marker';
export const AUTHORITY_BRIDGE_MARKER_VALUE =
  'VERIFY_POSTGRES_TLS_PEER_B2A_AUTHORITY_ONCE\n';
export const AUTHORITY_BRIDGE_TRACK = 'security';

export function validateProductionPostgresTlsAuthorityBridge(input) {
  if (input.eventName !== 'push') {
    throw new ProductionPostgresTlsPeerPreflightError(
      'AUTHORITY_BRIDGE_EVENT_INVALID',
      'TLS authority bridge requires a push event.',
    );
  }
  if (input.ref !== 'refs/heads/main') {
    throw new ProductionPostgresTlsPeerPreflightError(
      'AUTHORITY_BRIDGE_REF_INVALID',
      'TLS authority bridge requires main.',
    );
  }
  if (input.track !== AUTHORITY_BRIDGE_TRACK) {
    throw new ProductionPostgresTlsPeerPreflightError(
      'AUTHORITY_BRIDGE_TRACK_INVALID',
      'TLS authority bridge requires the security track.',
    );
  }
  if (input.markerPath !== AUTHORITY_BRIDGE_MARKER_PATH) {
    throw new ProductionPostgresTlsPeerPreflightError(
      'AUTHORITY_BRIDGE_PATH_INVALID',
      'TLS authority bridge marker path is invalid.',
    );
  }
  if (input.markerContent !== AUTHORITY_BRIDGE_MARKER_VALUE) {
    throw new ProductionPostgresTlsPeerPreflightError(
      'AUTHORITY_BRIDGE_MARKER_INVALID',
      'TLS authority bridge marker value is invalid.',
    );
  }

  return Object.freeze({
    event: 'push',
    ref: 'refs/heads/main',
    track: AUTHORITY_BRIDGE_TRACK,
    markerPath: AUTHORITY_BRIDGE_MARKER_PATH,
    markerExact: true,
  });
}

export function buildProductionPostgresTlsAuthorityBridgeEvidence(input) {
  const authority = inspectServerRootCertificatePem(
    input.rootCertificatePem,
    input.now,
  );
  const pooler = inspectProductionSessionPoolerHost(input.sessionPoolerHost);

  return Object.freeze({
    schemaVersion: 'myeongha-production-postgres-tls-authority-bridge-v1',
    projectRef: 'cnsfpcdiyofqvhpcegfc',
    certificateSource: authority.certificateSource,
    certificateParse: authority.certificateParse,
    certificateValidNow: authority.certificateValidNow,
    certificatePrivateKeyPresent: authority.certificatePrivateKeyPresent,
    certificateFingerprint256: authority.certificateFingerprint256,
    certificatePemEmitted: false,
    sessionPoolerHostPresent: pooler.sessionPoolerHostPresent,
    sessionPoolerHostShapeValid: pooler.sessionPoolerHostShapeValid,
    sessionPoolerHostnameEmitted: false,
    productionDatabaseConnectionAttempted: false,
    productionDatabaseUrlRead: false,
    productionDatabaseUrlMutated: false,
    productionVercelBindingMutated: false,
    credentialMaterialEmitted: false,
  });
}

function requireSecret(value, code) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ProductionPostgresTlsPeerPreflightError(
      code,
      'Required Production authority secret is absent.',
    );
  }
  return value;
}

export function runProductionPostgresTlsAuthorityBridge(env = process.env) {
  const markerPath =
    env.MYEONGHA_POSTGRES_TLS_PEER_AUTHORITY_BRIDGE_MARKER_PATH ?? '';

  let markerContent = '';
  try {
    markerContent = readFileSync(markerPath, 'utf8');
  } catch {
    throw new ProductionPostgresTlsPeerPreflightError(
      'AUTHORITY_BRIDGE_MARKER_MISSING',
      'TLS authority bridge marker is missing.',
    );
  }

  validateProductionPostgresTlsAuthorityBridge({
    eventName: env.GITHUB_EVENT_NAME,
    ref: env.GITHUB_REF,
    track: env.MYEONGHA_WATCHTOWER_TRACK,
    markerPath,
    markerContent,
  });

  return buildProductionPostgresTlsAuthorityBridgeEvidence({
    rootCertificatePem: requireSecret(
      env.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM,
      'ROOT_CERTIFICATE_MISSING',
    ),
    sessionPoolerHost: requireSecret(
      env.SUPABASE_PRODUCTION_SESSION_POOLER_HOST,
      'SESSION_POOLER_HOST_MISSING',
    ),
  });
}

function printEvidence(evidence) {
  console.log('postgres_tls_authority_bridge=pass');
  console.log(`project_ref=${evidence.projectRef}`);
  console.log(`certificate_source=${evidence.certificateSource}`);
  console.log(`certificate_parse=${evidence.certificateParse}`);
  console.log(`certificate_valid_now=${evidence.certificateValidNow}`);
  console.log(
    `certificate_private_key_present=${evidence.certificatePrivateKeyPresent}`,
  );
  console.log(
    `certificate_fingerprint256=${evidence.certificateFingerprint256}`,
  );
  console.log(
    `certificate_pem_emitted=${evidence.certificatePemEmitted}`,
  );
  console.log(
    `session_pooler_host_present=${evidence.sessionPoolerHostPresent}`,
  );
  console.log(
    `session_pooler_host_shape_valid=${evidence.sessionPoolerHostShapeValid}`,
  );
  console.log(
    `session_pooler_hostname_emitted=${evidence.sessionPoolerHostnameEmitted}`,
  );
  console.log(
    `production_database_connection_attempted=${evidence.productionDatabaseConnectionAttempted}`,
  );
  console.log(
    `production_database_url_read=${evidence.productionDatabaseUrlRead}`,
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
    printEvidence(runProductionPostgresTlsAuthorityBridge());
  } catch (error) {
    const code =
      error instanceof ProductionPostgresTlsPeerPreflightError
        ? error.code
        : 'UNEXPECTED_AUTHORITY_BRIDGE_FAILURE';
    console.error(`postgres_tls_authority_bridge=fail code=${code}`);
    process.exitCode = 1;
  }
}
