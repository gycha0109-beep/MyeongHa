import { describe, expect, it } from 'vitest';

import {
  VERCEL_METADATA_BRIDGE_MARKER_PATH,
  VERCEL_METADATA_BRIDGE_MARKER_VALUE,
  buildProductionPostgresTlsVercelMetadataBridgeEvidence,
  validateProductionPostgresTlsVercelMetadataBridge,
} from '../scripts/operations/run-production-postgres-tls-peer-vercel-metadata-bridge.mjs';
import { ProductionPostgresTlsPeerPreflightError } from '../scripts/operations/run-production-postgres-tls-peer-preflight.mjs';

function expectCode(action, code) {
  try {
    action();
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ProductionPostgresTlsPeerPreflightError);
    expect(error).toMatchObject({ code });
  }
}

describe('Production PostgreSQL TLS Vercel metadata one-shot bridge', () => {
  it('accepts only the exact main push marker and security track', () => {
    expect(
      validateProductionPostgresTlsVercelMetadataBridge({
        eventName: 'push',
        ref: 'refs/heads/main',
        track: 'security',
        markerPath: VERCEL_METADATA_BRIDGE_MARKER_PATH,
        markerContent: VERCEL_METADATA_BRIDGE_MARKER_VALUE,
      }),
    ).toMatchObject({
      event: 'push',
      ref: 'refs/heads/main',
      track: 'security',
      markerExact: true,
    });

    expectCode(
      () =>
        validateProductionPostgresTlsVercelMetadataBridge({
          eventName: 'pull_request',
          ref: 'refs/heads/main',
          track: 'security',
          markerPath: VERCEL_METADATA_BRIDGE_MARKER_PATH,
          markerContent: VERCEL_METADATA_BRIDGE_MARKER_VALUE,
        }),
      'VERCEL_METADATA_BRIDGE_EVENT_INVALID',
    );
    expectCode(
      () =>
        validateProductionPostgresTlsVercelMetadataBridge({
          eventName: 'push',
          ref: 'refs/heads/main',
          track: 'ops',
          markerPath: VERCEL_METADATA_BRIDGE_MARKER_PATH,
          markerContent: VERCEL_METADATA_BRIDGE_MARKER_VALUE,
        }),
      'VERCEL_METADATA_BRIDGE_TRACK_INVALID',
    );
    expectCode(
      () =>
        validateProductionPostgresTlsVercelMetadataBridge({
          eventName: 'push',
          ref: 'refs/heads/main',
          track: 'security',
          markerPath: VERCEL_METADATA_BRIDGE_MARKER_PATH,
          markerContent: 'WRONG\n',
        }),
      'VERCEL_METADATA_BRIDGE_MARKER_INVALID',
    );
  });

  it('classifies a sensitive Production DB binding without reading its value', () => {
    const evidence = buildProductionPostgresTlsVercelMetadataBridgeEvidence({
      envs: [
        {
          key: 'MYEONGHA_DATABASE_URL',
          type: 'sensitive',
          target: ['production'],
          value: 'must-not-be-inspected',
        },
      ],
    });

    expect(evidence).toMatchObject({
      vercelDatabaseEnvExists: true,
      vercelDatabaseEnvTarget: 'production',
      vercelDatabaseEnvType: 'sensitive',
      vercelDatabaseEnvValueRead: false,
      preferredB2bExecution: 'vercel-runtime-required',
      vercelDecryptRequested: false,
      productionDatabaseConnectionAttempted: false,
      productionDatabaseUrlRead: false,
      productionDatabaseUrlEmitted: false,
      productionDatabaseUrlMutated: false,
      productionVercelBindingMutated: false,
      credentialMaterialEmitted: false,
    });
    expect(JSON.stringify(evidence)).not.toContain('must-not-be-inspected');
  });

  it('classifies an encrypted binding as Vercel-runtime preferred', () => {
    const evidence = buildProductionPostgresTlsVercelMetadataBridgeEvidence({
      envs: [
        {
          key: 'MYEONGHA_DATABASE_URL',
          type: 'encrypted',
          target: ['production'],
        },
      ],
    });

    expect(evidence).toMatchObject({
      vercelDatabaseEnvType: 'encrypted',
      preferredB2bExecution: 'vercel-runtime-preferred',
      vercelDatabaseEnvValueRead: false,
      vercelDecryptRequested: false,
    });
  });
});
