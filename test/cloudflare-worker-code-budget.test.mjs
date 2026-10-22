import { describe, expect, it } from 'vitest';
import {
  WORKER_CODE_MAX_BYTES_V1,
  WORKER_DRY_RUN_WRANGLER_V1,
  assessCloudflareWorkerLocalCodeBudgetV1,
} from '../scripts/verify-cloudflare-worker-code-budget.mjs';

describe('Stage 9 local dry-run Worker CODE bundle free-limit guard',()=>{
  it('accepts bounded code and keeps Production and CPU evidence on HOLD',()=>{
    expect(WORKER_CODE_MAX_BYTES_V1).toBe(64*1024*1024);
    expect(WORKER_DRY_RUN_WRANGLER_V1).toBe('4.151.2');
    const result=assessCloudflareWorkerLocalCodeBudgetV1([
      {name:'index.js',bytes:65536},
      {name:'wasm/runtime.wasm',bytes:4096},
    ]);
    expect(result).toMatchObject({
      status:'PASS',codeBytes:69632,workerCodeFiles:2,
      cloudflareUploadedBundleSizeVerified:false,
      workerRuntimeCpuMemoryVerified:false,productionCutover:'HOLD',
    });
  });

  it('fails at excess 64MiB but allows exactly the local code-size cap',()=>{
    expect(assessCloudflareWorkerLocalCodeBudgetV1([
      {name:'index.js',bytes:WORKER_CODE_MAX_BYTES_V1},
    ]).status).toBe('PASS');
    expect(assessCloudflareWorkerLocalCodeBudgetV1([
      {name:'index.js',bytes:WORKER_CODE_MAX_BYTES_V1+1},
    ]).status).toBe('STOP_BUNDLE_LIMIT');
  });

  it('rejects empty, duplicate, map or path-injected code metadata',()=>{
    for(const invalid of [
      [],null,[{name:'index.js',bytes:0}],
      [{name:'index.js',bytes:1.5}],
      [{name:'index.js',bytes:Infinity}],
      [{name:'index.js',bytes:-1}],
      [{name:'index.js',bytes:1},{name:'index.js',bytes:1}],
      [{name:'index.js.map',bytes:10}],
      [{name:'../private.js',bytes:10}],
      [{name:'/etc/passwd.js',bytes:10}],
      [{name:'a\\secret.js',bytes:10}],
      [{name:'index.js',bytes:Number.MAX_SAFE_INTEGER}],
    ]) expect(()=>assessCloudflareWorkerLocalCodeBudgetV1(invalid)).toThrow();
  });
});
