// Stage 9 actual local Wrangler Worker CODE bundle accounting.
// Runs a pinned --dry-run; must never contact the Cloudflare account or deploy.
// Includes .js/.mjs/.cjs/.wasm code files, not uploaded/static assets or maps.
// Watchtower-Track: ops
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, lstat, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORKER_CODE_MAX_BYTES_V1=64*1024*1024;
export const WORKER_DRY_RUN_WRANGLER_V1='4.151.2';
const CODE_SUFFIX=/\.(?:js|mjs|cjs|wasm)$/i;

export function assessCloudflareWorkerLocalCodeBudgetV1(files) {
  if (!Array.isArray(files)||files.length<1||files.length>512) {
    throw Error('Invalid local Worker code file count');
  }
  const names=new Set();
  let codeBytes=0;
  for(const file of files){
    if(!file||typeof file.name!=='string'||
       !/^[A-Za-z0-9_.\/-]{1,256}$/.test(file.name)||
       file.name.startsWith('/')||file.name.split('/').includes('..')||
       !CODE_SUFFIX.test(file.name)||names.has(file.name)||
       !Number.isSafeInteger(file.bytes)||file.bytes<1) {
      throw Error('Invalid local Worker code file metadata');
    }
    names.add(file.name);
    codeBytes+=file.bytes;
    if(!Number.isSafeInteger(codeBytes))throw Error('Local code size overflow');
  }
  return Object.freeze({
    schema:'myeongha-stage9-local-worker-code-budget-v1',
    status:codeBytes<=WORKER_CODE_MAX_BYTES_V1?'PASS':'STOP_BUNDLE_LIMIT',
    workerCodeFiles:files.length,
    codeBytes,maxCodeBytes:WORKER_CODE_MAX_BYTES_V1,
    // Static assets, sourcemaps and gzip/brotli Cloudflare accounting omitted.
    evidence:'LOCAL_WRANGLER_DRY_RUN_CODE_ONLY',
    cloudflareUploadedBundleSizeVerified:false,
    workerRuntimeCpuMemoryVerified:false,
    productionCutover:'HOLD',
  });
}

async function collectCode(root,directory,out,hash) {
  const entries=await readdir(directory,{withFileTypes:true});
  entries.sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of entries) {
    const abs=join(directory,entry.name);
    if(entry.isSymbolicLink())throw Error('Symlink in local Wrangler build');
    if(entry.isDirectory()) {
      await collectCode(root,abs,out,hash);
    } else if(entry.isFile()&&CODE_SUFFIX.test(entry.name)) {
      const s=await lstat(abs);
      const name=relative(root,abs).replaceAll('\\','/');
      if(s.size<1||s.size>WORKER_CODE_MAX_BYTES_V1+1) {
        throw Error('Local Worker code size outside expected bounds');
      }
      // Digest only bounded code bytes; never print JS source.
      const contents=await readFile(abs);
      hash.update(name).update('\0').update(contents).update('\0');
      out.push({name,bytes:s.size});
    }
  }
  if(out.length>512)throw Error('Excessive local Worker bundle files');
}

async function main() {
  if(process.platform!=='linux')throw Error('Stage 9 bundle guard is Linux CI-only');
  const cfg=JSON.parse(await readFile(resolve('wrangler.ops.jsonc'),'utf8'));
  if(cfg.name!=='myeongha'||cfg.main!=='./workers/cloudflare-static-preview.mjs'||
    cfg.workers_dev!==true||cfg.preview_urls!==true||
    cfg.assets?.directory!=='./public') {
    throw Error('Approved workers.dev Worker configuration changed');
  }
  await stat(resolve('public','index.html'));
  const root=await mkdtemp(join(tmpdir(),'myeongha-wrangler-dry-run-'));
  const outdir=join(root,'bundle');
  try {
    const started=performance.now();
    // Explicit --dry-run prevents Cloudflare Worker uploads. Use a minimal
    // environment to avoid inheriting GitHub/Cloudflare/Provider credentials.
    execFileSync('npm',[
      'exec','--yes','--package=wrangler@'+WORKER_DRY_RUN_WRANGLER_V1,
      '--','wrangler','deploy','--dry-run','--config','wrangler.ops.jsonc',
      '--outdir',outdir,
    ],{
      cwd:process.cwd(),timeout:120_000,
      stdio:['ignore','ignore','ignore'],
      env:{
        PATH:process.env.PATH||'',
        HOME:process.env.HOME||'',
        CI:'true',WRANGLER_SEND_METRICS:'false',NO_COLOR:'1',
        npm_config_audit:'false',npm_config_fund:'false',
      },
    });
    const files=[];
    const hash=createHash('sha256');
    await collectCode(outdir,outdir,files,hash);
    const budget=assessCloudflareWorkerLocalCodeBudgetV1(files);
    console.log('Cloudflare local Worker code bundle budget:',JSON.stringify({
      ...budget,bundleSourceSha256:hash.digest('hex'),
      localDryRunWallMs:Math.round(performance.now()-started),
    }));
    if(budget.status!=='PASS')process.exitCode=1;
  }catch{
    console.error('Cloudflare Worker code bundle dry-run failed (details redacted)');
    process.exitCode=1;
  }finally {
    await rm(root,{recursive:true,force:true});
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await main();
}
