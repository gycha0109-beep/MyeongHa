import { execFileSync, spawnSync } from 'node:child_process';
import { accessSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_CD = Object.freeze({
  branch: 'main',
  worker: 'myeongha-web',
  apiWorker: 'myeongha',
  config: 'wrangler.web.jsonc',
  version: '4.152.0',
});

export function assertMainWebCdEnvironment({ workersCi, branch, sha, checkoutSha }) {
  if (workersCi !== '1' || branch !== WEB_CD.branch ||
      !/^[a-f0-9]{40}$/u.test(sha ?? '') || sha !== checkoutSha) {
    throw new Error('Cloudflare live web CD requires the exact merged main commit from Workers Builds.');
  }
}

export function assertMainWebConfig(config) {
  if (config?.name !== WEB_CD.worker ||
      config?.main !== './cloudflare/web-worker.mjs' ||
      config?.workers_dev !== true ||
      config?.assets?.directory !== './public' ||
      config?.assets?.binding !== 'ASSETS' ||
      config?.assets?.run_worker_first !== true ||
      config?.assets?.html_handling !== 'none' ||
      config?.assets?.not_found_handling !== 'none' ||
      config?.services?.length !== 1 ||
      config.services[0]?.binding !== 'AUTHORITY_API' ||
      config.services[0]?.service !== WEB_CD.apiWorker ||
      config?.route !== undefined || config?.routes !== undefined) {
    throw new Error('Live web CD cannot replace the existing Auth/DB/Saju Worker or bypass its Service Binding.');
  }
}

function deploy() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8',
  }).trim();
  if (process.env.WRANGLER_CI_OVERRIDE_NAME !== WEB_CD.worker) {
    throw new Error('Cloudflare Workers Builds target must be myeongha-web; refusing to replace the API Worker.');
  }
  assertMainWebCdEnvironment({
    workersCi: process.env.WORKERS_CI,
    branch: process.env.WORKERS_CI_BRANCH,
    sha: process.env.WORKERS_CI_COMMIT_SHA,
    checkoutSha,
  });
  assertMainWebConfig(JSON.parse(readFileSync(resolve(root, WEB_CD.config), 'utf8')));
  for (const path of ['public/index.html', 'public/hall.html', 'public/reading.html', 'public/saju-preview-landing.css']) {
    accessSync(resolve(root, path));
  }
  const args = ['--yes', `wrangler@${WEB_CD.version}`, 'deploy', '--config', WEB_CD.config];
  console.log(`Cloudflare merged-main web CD: ${checkoutSha} -> ${WEB_CD.worker}`);
  const child = spawnSync('npx', args, {
    cwd: root, stdio: 'inherit', env: process.env,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Live web deployment failed: exit ${child.status ?? 'unknown'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) deploy();
