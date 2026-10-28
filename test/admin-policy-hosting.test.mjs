import{describe,it,expect}from'vitest';
import worker,{validateAdminMaintenanceBindingsV1} from'../cloudflare/admin-worker.mjs';
describe('admin policy maintenance activation',()=>{
 it('does not open any retention origin by default and rejects enabled jobs without a dedicated origin',async()=>{
  let queued=0;const ctx={waitUntil(){queued++;}};
  await worker.scheduled({}, {},ctx);expect(queued).toBe(0);
  // Both the isolated retention policy and the dedicated DB origin must be
  // configured; a missing policy may fail before any origin is inspected.
  await expect(worker.scheduled({}, {MYEONGHA_ADMIN_RETENTION_ENABLED:'true'},ctx)).rejects.toThrow('Dedicated retention policy unavailable');
  await expect(worker.scheduled({}, {
    MYEONGHA_ADMIN_RETENTION_ENABLED:'true',
    MYEONGHA_ADMIN_HYPERDRIVE_POLICY:'dedicated-admin-verify-full-v1',
  },ctx)).rejects.toThrow('Dedicated audit retention origin unavailable');
  await expect(worker.scheduled({}, {MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED:'true'},ctx))
    .rejects.toThrow('Dedicated retention policy unavailable');
  await expect(worker.scheduled({}, {
    MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED:'true',
    MYEONGHA_ADMIN_HYPERDRIVE_POLICY:'dedicated-admin-verify-full-v1',
  },ctx)).rejects.toThrow('Dedicated analytics retention origin unavailable');
  expect(queued).toBe(0);
 });
 it('preflights all active retention origins and rejects DB-role reuse before launching any work',async()=>{
  const cfg={MYEONGHA_ADMIN_HYPERDRIVE_POLICY:'dedicated-admin-verify-full-v1',
    MYEONGHA_ADMIN_RETENTION_ENABLED:'true',MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED:'true',
    ADMIN_RETENTION_HYPERDRIVE:{connectionString:'postgresql://retention-audit'},
    ADMIN_ANALYTICS_RETENTION_HYPERDRIVE:{connectionString:'postgresql://retention-analytics'}};
  expect(validateAdminMaintenanceBindingsV1(cfg)).toEqual({auditEnabled:true,analyticsEnabled:true});
  expect(()=>validateAdminMaintenanceBindingsV1({...cfg,ADMIN_ANALYTICS_RETENTION_HYPERDRIVE:undefined}))
    .toThrow('Dedicated analytics retention origin unavailable');
  expect(()=>validateAdminMaintenanceBindingsV1({...cfg,
    ADMIN_ANALYTICS_RETENTION_HYPERDRIVE:cfg.ADMIN_RETENTION_HYPERDRIVE}))
    .toThrow('Retention origin reuses');
  expect(()=>validateAdminMaintenanceBindingsV1({...cfg,
    ADMIN_READ_HYPERDRIVE:cfg.ADMIN_ANALYTICS_RETENTION_HYPERDRIVE}))
    .toThrow('Retention origin reuses');
  let queued=0;
  const ctx={waitUntil(){queued++;}};
  await expect(worker.scheduled({},{
    ...cfg,ADMIN_ANALYTICS_RETENTION_HYPERDRIVE:undefined,
  },ctx)).rejects.toThrow('Dedicated analytics retention origin unavailable');
  expect(queued).toBe(0);
 });
});
