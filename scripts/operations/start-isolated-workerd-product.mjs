import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const localOrigin = /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/u;
const wranglerVersion = '4.152.0';

export async function startIsolatedWorkerdProduct({ repoRoot, wranglerEntry, authOrigin, sajuOrigin, pgPort }) {
  if (process.platform !== 'linux' || !localOrigin.test(authOrigin) || !localOrigin.test(sajuOrigin) ||
      !Number.isInteger(pgPort) || pgPort < 1 || pgPort > 65535) {
    throw Error('Only the disposable Linux loopback fixture is supported');
  }
  const config = JSON.parse(await readFile(join(repoRoot, 'wrangler.jsonc'), 'utf8'));
  const wrangler = JSON.parse(await readFile(resolve(dirname(wranglerEntry), '../package.json'), 'utf8'));
  const workerd = JSON.parse(await readFile(resolve(dirname(wranglerEntry), '../../workerd/package.json'), 'utf8'));
  if (wrangler.name !== 'wrangler' || wrangler.version !== wranglerVersion || workerd.name !== 'workerd') {
    throw Error('Unexpected isolated Wrangler runtime');
  }
  const scratch = await mkdtemp(join(tmpdir(), 'myeongha-ops-workerd-'));
  const configPath = join(scratch, 'wrangler.json');
  let child;
  let output = '';
  let failed = false;
  const running = () => child && child.exitCode === null && child.signalCode === null && child.pid;
  function signalGroup(signal) {
    if (!child?.pid) return false;
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') return false;
      throw error;
    }
  }
  async function close() {
    try {
      if (signalGroup('SIGTERM')) {
        for (let wait = 0; wait < 30 && signalGroup(0); wait++) await sleep(100);
        if (signalGroup('SIGKILL')) {
          for (let wait = 0; wait < 20 && signalGroup(0); wait++) await sleep(100);
        }
        if (signalGroup(0)) throw Error('Isolated Wrangler did not exit');
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
  try {
    await writeFile(configPath, JSON.stringify({
      name: 'myeongha-ops-isolated-workerd-product',
      main: join(repoRoot, 'test/ops/fixtures/workerd-product-entry.mjs'),
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      vars: { MH_OPS_WORKERD_AUTH_ORIGIN: authOrigin, MH_OPS_WORKERD_SAJU_ORIGIN: sajuOrigin },
      hyperdrive: [{ binding: 'HYPERDRIVE', id: '00000000000000000000000000000000',
        localConnectionString: 'postgres://myeongha_ops_phase11_login:local-only@127.0.0.1:' + pgPort + '/postgres' }],
    }), { mode: 0o600 });
    child = spawn(process.execPath, [wranglerEntry, 'dev', '--local', '--config', configPath,
      '--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0', '--persist-to', join(scratch, 'state'),
      '--show-interactive-dev-session=false'], {
      cwd: scratch, env: { PATH: process.env.PATH, WRANGLER_SEND_METRICS: 'false' },
      detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.on('error', () => { failed = true; });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', data => { output = (output + data.toString()).slice(-16000); });
    }
    for (let attempt = 0; attempt < 60 && !failed && running(); attempt++) {
      const match = /Ready on (http:\/\/127\.0\.0\.1:[1-9]\d*)/u.exec(output);
      if (match) {
        return { origin: match[1], wranglerVersion, workerdVersion: workerd.version, close };
      }
      await sleep(500);
    }
    throw Error('Isolated workerd did not become ready');
  } catch (error) {
    await close();
    throw error;
  }
}
