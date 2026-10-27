import{describe,it,expect}from'vitest';
import worker from'../cloudflare/admin-worker.mjs';
describe('admin policy maintenance activation',()=>{
 it('does not open any retention origin by default and rejects enabled jobs without a dedicated origin',async()=>{
  let queued=0;const ctx={waitUntil(){queued++;}};
  await worker.scheduled({}, {},ctx);expect(queued).toBe(0);
  await expect(worker.scheduled({}, {MYEONGHA_ADMIN_RETENTION_ENABLED:'true'},ctx)).rejects.toThrow('Dedicated retention origin');
  expect(queued).toBe(0);
 });
});
