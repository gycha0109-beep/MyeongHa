#!/usr/bin/env node
// Run the existing disposable GitHub Actions Docker verification from Windows or Linux.
// No production credentials, database URLs, or execution permissions are accepted.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const REPOSITORY = 'github.com/gycha0109-beep/MyeongHa';
const WORKFLOW = 'saju-bridge-cross-repo-local-http.yml';
const REF = 'main';
const TIMEOUT_MS = 120_000;
const PAUSE_MS = 3_000;

function gh(args, { inherit = false } = {}) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8', shell: false,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  });
  if (result.error || result.status !== 0) {
    const reason = result.error?.code ?? result.stderr?.trim() ?? `exit ${result.status}`;
    throw new Error(`GitHub CLI command failed: ${String(reason).slice(0, 280)}`);
  }
  return result.stdout ?? '';
}

function findRunId(output, requestId) {
  const direct = output.match(/https:\/\/github\.com\/gycha0109-beep\/MyeongHa\/actions\/runs\/(\d+)/u);
  if (direct) return direct[1];
  const runs = JSON.parse(gh(['run', 'list', '--repo', REPOSITORY,
    '--workflow', WORKFLOW, '--branch', REF, '--event', 'workflow_dispatch',
    '--limit', '100', '--json', 'databaseId,displayTitle']));
  if (!Array.isArray(runs)) throw new Error('Unexpected GitHub run list response.');
  const matches = runs.filter(run => run.displayTitle === `Saju Bridge ${requestId}`
    && Number.isSafeInteger(run.databaseId) && run.databaseId > 0);
  if (matches.length > 1) throw new Error('Ambiguous GitHub run identity.');
  return matches[0] ? String(matches[0].databaseId) : undefined;
}

function run() {
  if (process.argv.length > 2) {
    throw new Error('No local checkout path or connection URL is accepted. Run without arguments.');
  }
  gh(['auth', 'status']);
  const requestId = randomBytes(12).toString('hex');
  console.log('[사주 브릿지] 기존 GitHub 임시 Docker 통합 시험을 실행합니다.');
  console.log('[사주 브릿지] 실제 Supabase·운영 데이터·유료 인프라는 사용하지 않습니다.');
  const output = gh(['workflow', 'run', WORKFLOW, '--repo', REPOSITORY,
    '--ref', REF, '-f', `request_id=${requestId}`, '-f', 'watchtower_track=saju-bridge']);
  let runId;
  const until = Date.now() + TIMEOUT_MS;
  while (!runId && Date.now() < until) {
    runId = findRunId(output, requestId);
    if (!runId) {
      spawnSync(process.execPath, ['-e',
        `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${PAUSE_MS})`]);
    }
  }
  if (!runId) {
    throw new Error(`Run submitted but not identified. Inspect GitHub Actions (request ${requestId}); do not submit again blindly.`);
  }
  console.log(`검사 현황: https://github.com/gycha0109-beep/MyeongHa/actions/runs/${runId}`);
  gh(['run', 'watch', runId, '--repo', REPOSITORY, '--exit-status', '--compact'], { inherit: true });
  console.log('[사주 브릿지] 검사 성공. 운영 실행·공개·결제 권한은 부여되지 않습니다.');
}

try { run(); }
catch (error) {
  console.error('[사주 브릿지] 검사 미완료:', error instanceof Error ? error.message : 'unknown');
  process.exitCode = 1;
}
