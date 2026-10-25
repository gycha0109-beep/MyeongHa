#!/usr/bin/env node
// Deploy only the MyeongHa Ops Worker. Every publish must retain its
// workers.dev routing and preserve production secrets.
// Watchtower-Track: ops
import { readFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = 'myeongha';
const APPROVED_BRANCH = 'feat/ops/cloudflare-authdb-clean-snapshot-20261021';
const BASE = 'https://myeongha.gycha0109.workers.dev';
const CHECK_ONLY = process.argv.includes('--check');

export function resolveCloudflareOpsVersionMetadataV1(commitSha) {
  if (typeof commitSha !== 'string' || !/^[a-f0-9]{40}$/.test(commitSha)) {
    throw Error('Cloudflare Ops deployment requires an exact Git commit SHA');
  }
  return Object.freeze({
    tag: `ops-${commitSha}`,
    message: `ops-${APPROVED_BRANCH}@${commitSha}`,
  });
}

function command(bin, args) {
  return new Promise((resolveCommand, reject) => {
    const p = spawn(bin, args, { stdio: CHECK_ONLY ? 'pipe' : 'inherit', windowsHide: true });
    let result = '';
    if (CHECK_ONLY) p.stdout.on('data', d => { result += d.toString(); });
    p.once('error', reject);
    p.once('close', code => code === 0 ? resolveCommand(result.trim()) :
      reject(Error('Command exited unsuccessfully: ' + bin + ' (' + code + ')')));
  });
}

async function assertDeployOwnership() {
  const config=JSON.parse(await readFile(resolve('wrangler.ops.jsonc'),'utf8'));
  if(config.name!==WORKER ||
     config.main!=='./workers/cloudflare-static-preview.mjs' ||
     config.workers_dev!==true || config.preview_urls!==true ||
     config.assets?.directory!=='./public' ||
     !Array.isArray(config.assets?.run_worker_first) ||
     !config.assets.run_worker_first.includes('/api/*')) {
    throw Error('Unsafe Cloudflare worker config: exact Ops Worker and workers_dev=true required');
  }
  const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();
  if(branch!==APPROVED_BRANCH) {
    throw Error('Refusing to publish shared myeongha Worker from non-Ops branch');
  }
  const workingTree=execFileSync('git',['status','--porcelain','--untracked-files=all'],
    {encoding:'utf8'}).trim();
  if(workingTree) {
    throw Error('Refusing to publish shared myeongha Worker from a dirty worktree');
  }
  const commitSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  return {commitSha, ...resolveCloudflareOpsVersionMetadataV1(commitSha)};
}

async function verifyPublicRoutes() {
  for (const path of ['/','/auth.html','/api/health']) {
    let response=await fetch(BASE+path,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(response.status!==200) {
      // Cloudflare route propagation can briefly lag a successful deployment.
      // One bounded retry avoids reporting a successful publish as a failure.
      await new Promise(resolveDelay=>setTimeout(resolveDelay,2500));
      response=await fetch(BASE+path,{redirect:'manual',signal:AbortSignal.timeout(12000)});
    }
    if(response.status!==200){
      throw Error('Cloudflare route '+path+' returned '+response.status+
        '. Check Worker subdomain.enabled: false/other deployments.');
    }
    if(path!=='/api/health' &&
       !response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
      throw Error('Unexpected non-HTML asset response at '+path);
    }
  }
}

async function main() {
  const provenance=await assertDeployOwnership();
  console.log('Ops Worker ownership/config preflight PASS: workers_dev=true');
  if(CHECK_ONLY)return;
  // Independent tracks MUST use their own Worker name. Another deployment
  // with workers_dev=false will disable this hostname for everyone.
  if(process.platform==='win32') {
    await command('cmd.exe',['/d','/s','/c',
      `npx.cmd --yes wrangler@4.151.2 deploy --config wrangler.ops.jsonc --keep-vars --tag ${provenance.tag} --message ${provenance.message}`]);
  } else {
    await command('npx',['--yes','wrangler@4.151.2','deploy','--config','wrangler.ops.jsonc','--keep-vars',
      '--tag',provenance.tag,'--message',provenance.message]);
  }
  await verifyPublicRoutes();
  console.log('Cloudflare Ops published; workers.dev HTML + health HTTP 200 PASS');
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1});
}
