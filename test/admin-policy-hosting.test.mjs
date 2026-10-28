import{describe,it,expect}from'vitest';
import worker from'../cloudflare/admin-worker.mjs';
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
});
