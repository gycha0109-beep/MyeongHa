import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  CLOUDFLARE_STAGE5_BINDING_CATALOG_V1,
  inspectCloudflareStage5BindingInventoryV1,
  inspectCloudflareStage5SourceReferencesV1,
} from '../scripts/verify-cloudflare-auth-binding-inventory.mjs';

const config = JSON.parse(await readFile(new URL('../wrangler.ops.jsonc', import.meta.url), 'utf8'));

describe('Stage 5 Cloudflare Auth/DB binding registry and deploy HOLD', () => {
  it('passes only the approved workers.dev config without binding material', () => {
    const report = inspectCloudflareStage5BindingInventoryV1(config);
    expect(report.status).toBe('PASS');
    expect(report.bindingNames).toBe(CLOUDFLARE_STAGE5_BINDING_CATALOG_V1.length);
    expect(report.sensitiveNames).toBe(7);
    expect(report.stage5ActivationEnabledByWrangler).toBe(false);
    expect(CLOUDFLARE_STAGE5_BINDING_CATALOG_V1.map(x=>x.name))
      .toContain('MYEONGHA_CLOUDFLARE_OAUTH_CALLBACK_ORIGIN');
  });

  it('rejects any plaintext variables, secret declaration, routing or paid DB binding', () => {
    for (const section of [
      { vars: { MYEONGHA_DATABASE_URL: 'DO_NOT_LEAK_THIS' } },
      { vars: {} }, { secrets: [] }, { unsafe: {} },
      { hyperdrive: [] }, { routes: [] }, { kv_namespaces: [] },
      { d1_databases: [] }, { r2_buckets: [] }, { queues: {} },
    ]) {
      const report = inspectCloudflareStage5BindingInventoryV1({ ...config, ...section });
      expect(report.status).toBe('FAIL');
      expect(JSON.stringify(report)).not.toContain('DO_NOT_LEAK_THIS');
    }
  });

  it('rejects disabled workers.dev and Worker entrypoint drift', () => {
    for (const changed of [
      { workers_dev: false },
      { preview_urls: false },
      { main: './workers/auth-production.mjs' },
      { name: 'myeongha-production' },
    ]) {
      expect(inspectCloudflareStage5BindingInventoryV1({ ...config, ...changed }).status).toBe('FAIL');
    }
  });

  it('rejects missing, duplicate or unreviewed binding inventory entries', () => {
    const first = CLOUDFLARE_STAGE5_BINDING_CATALOG_V1[0];
    for (const row of [
      { ...first, name: 'PROD_DB_URL' },
      { ...first, kind: 'approved' },
      { ...first, reviewer: '' },
      { ...first, source: '../../secret.env' },
    ]) {
      expect(inspectCloudflareStage5BindingInventoryV1(
        config, [first, row],
      ).status).toBe('FAIL');
    }
  });

  it('traces each inventory name back to its real source without opening secrets', async () => {
    const files = new Map();
    for (const row of CLOUDFLARE_STAGE5_BINDING_CATALOG_V1) {
      if (!files.has(row.source)) {
        files.set(row.source,
          await readFile(new URL('../' + row.source, import.meta.url), 'utf8'));
      }
    }
    expect(inspectCloudflareStage5SourceReferencesV1(
      CLOUDFLARE_STAGE5_BINDING_CATALOG_V1, files,
    ).status).toBe('PASS');
    files.set(CLOUDFLARE_STAGE5_BINDING_CATALOG_V1[0].source, 'empty');
    expect(inspectCloudflareStage5SourceReferencesV1(
      CLOUDFLARE_STAGE5_BINDING_CATALOG_V1, files,
    ).status).toBe('FAIL');
  });
});
