import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {inspectAdminHostedDeploymentV1,prepareAdminHostedConfigV1,ADMIN_HOSTED_REQUIRED_V1,ADMIN_WORKERS_DEV_ORIGIN_V1} from './deployment-check.mjs';
const config=JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
describe('isolated Admin deployment configuration',()=>{
  it('reports exact missing names and never reuses the ordinary public principal',()=>{
    const empty=inspectAdminHostedDeploymentV1({},config);expect(empty.missing).toEqual(ADMIN_HOSTED_REQUIRED_V1);expect(empty.configurationReady).toBe(false);
    const invalid=inspectAdminHostedDeploymentV1({MYEONGHA_ADMIN_READ_HYPERDRIVE_ID:'1ffe61390c064c0480a0a1e933e4d2c9'},config);
    expect(invalid.invalid).toContain('ordinary_user_database_binding_forbidden');
    expect(inspectAdminHostedDeploymentV1({}, {...config,workers_dev:false}).invalid).toContain('isolated_private_worker_config');
  });
  it('pins a single account-specific workers.dev hostname and requires the verified Access tenant',()=>{
    expect(config.workers_dev).toBe(true);
    expect(config.preview_urls).toBe(false);
    expect(ADMIN_WORKERS_DEV_ORIGIN_V1).toBe('https://myeongha-admin.gycha0109.workers.dev');
    expect(inspectAdminHostedDeploymentV1({MYEONGHA_ADMIN_ORIGIN:'https://myeongha-admin.other.workers.dev'},config).invalid).toContain('dedicated_workers_dev_origin_required');
    expect(inspectAdminHostedDeploymentV1({MYEONGHA_ADMIN_ORIGIN:ADMIN_WORKERS_DEV_ORIGIN_V1,MYEONGHA_ADMIN_ACCESS_ISSUER:'https://attacker.cloudflareaccess.com'},config).invalid).toContain('dedicated_admin_access_issuer_required');
    expect(inspectAdminHostedDeploymentV1({MYEONGHA_ADMIN_ACCESS_ISSUER:'%invalid'},config).invalid).toContain('MYEONGHA_ADMIN_ACCESS_ISSUER');
    expect(inspectAdminHostedDeploymentV1({MYEONGHA_ADMIN_ORIGIN:ADMIN_WORKERS_DEV_ORIGIN_V1,MYEONGHA_ADMIN_ACCESS_ISSUER:'https://noisy-star-3d9a.cloudflareaccess.com',MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN:ADMIN_WORKERS_DEV_ORIGIN_V1},config).invalid).toContain('separate_admin_origin');
  });
  it('generates separate origins without writing an API key or enabling activation',()=>{
    const env={MYEONGHA_ADMIN_ORIGIN:ADMIN_WORKERS_DEV_ORIGIN_V1,MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN:'https://member.example.test',
      MYEONGHA_ADMIN_ACCESS_ISSUER:'https://noisy-star-3d9a.cloudflareaccess.com',MYEONGHA_ADMIN_ACCESS_AUD:'a'.repeat(64),
      MYEONGHA_ADMIN_OWNER_EMAIL:'owner@example.test',MYEONGHA_ADMIN_OWNER_AUTH_USER_ID:'123e4567-e89b-42d3-a456-426614174000',
      MYEONGHA_ADMIN_SUPABASE_ORIGIN:'https://cnsfpcdiyofqvhpcegfc.supabase.co',MYEONGHA_SUPABASE_API_KEY:'synthetic-publishable-key-test-only',
      MYEONGHA_ADMIN_READ_HYPERDRIVE_ID:'a'.repeat(32),MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID:'b'.repeat(32)};
    const output=prepareAdminHostedConfigV1(env,config);
    expect(output.hyperdrive).toHaveLength(2);expect(output.workers_dev).toBe(true);expect(output.preview_urls).toBe(false);expect(output.vars.MYEONGHA_ADMIN_PRIVATE_ENABLED).toBe('false');
    expect(JSON.stringify(output)).not.toContain(env.MYEONGHA_SUPABASE_API_KEY);
    const command={...env,MYEONGHA_ADMIN_COMMAND_HYPERDRIVE_ID:'c'.repeat(32)};
    expect(inspectAdminHostedDeploymentV1(command,config).missing).toContain('MYEONGHA_ADMIN_CONFIRMATION_SECRET');
    const secret='synthetic-confirmation-secret-at-least32';
    const generated=prepareAdminHostedConfigV1({...command,MYEONGHA_ADMIN_CONFIRMATION_SECRET:secret},config);
    expect(generated.hyperdrive).toHaveLength(3);expect(JSON.stringify(generated)).not.toContain(secret);
    expect(inspectAdminHostedDeploymentV1({...command,MYEONGHA_ADMIN_COMMAND_HYPERDRIVE_ID:env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID},config).invalid).toContain('dedicated_admin_command_origin');
    const maintenance=prepareAdminHostedConfigV1({...env,MYEONGHA_ADMIN_RETENTION_HYPERDRIVE_ID:'d'.repeat(32)},config);
    expect(maintenance.hyperdrive.at(-1).binding).toBe('ADMIN_RETENTION_HYPERDRIVE');
    expect(inspectAdminHostedDeploymentV1({...env,MYEONGHA_ADMIN_RETENTION_HYPERDRIVE_ID:env.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID},config).invalid).toContain('dedicated_admin_retention_origin');
    const analytics=prepareAdminHostedConfigV1({...env,MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID:'e'.repeat(32)},config);
    expect(analytics.hyperdrive.at(-1)).toEqual({binding:'ADMIN_ANALYTICS_RETENTION_HYPERDRIVE',id:'e'.repeat(32)});
    expect(analytics.vars.MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED).toBe('false');
    expect(inspectAdminHostedDeploymentV1({...env,MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID:env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID},config).invalid).toContain('dedicated_admin_analytics_retention_origin');
    expect(inspectAdminHostedDeploymentV1({...env,MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID:'1ffe61390c064c0480a0a1e933e4d2c9'},config).invalid).toContain('dedicated_admin_analytics_retention_origin');
    expect(inspectAdminHostedDeploymentV1({...env,MYEONGHA_ADMIN_RETENTION_HYPERDRIVE_ID:'e'.repeat(32),MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID:'e'.repeat(32)},config).invalid).toContain('dedicated_admin_analytics_retention_origin');
  });
});
