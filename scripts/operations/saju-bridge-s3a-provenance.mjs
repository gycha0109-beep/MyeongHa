// S3A metadata-only authority gate. No production SQL or sensitive backup bytes.
import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const S3A = Object.freeze({
  repo: 'gycha0109-beep/MyeongHa',
  actor: 'gycha0109-beep',
  project: 'cnsfpcdiyofqvhpcegfc',
  confirm: 'APPLY_SAJU_BRIDGE_S3A_DORMANT_1730_ONLY',
  sqlSha256: '900e0771915776b4a7c2a8b3cf60e24b83c79fcec14f27cf6356b44685b385e2',
  sqlBlob: '42e076799d627bc9e19fe28e1ad25b4548e05e61',
  migrationFrontier: 20261008090417,
  backupWorkflow: '.github/workflows/production-postgres-backup.yml',
  restoreWorkflow: '.github/workflows/postgres-isolated-restore-drill.yml',
});

function requireCondition(ok, code) {
  if (!ok) throw new Error('S3A_HOLD_' + code);
}
function canonicalUtc(v) {
  requireCondition(typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) &&
    new Date(v).toISOString().replace('.000Z', 'Z') === v, 'INVALID_UTC_WINDOW');
  return Date.parse(v);
}
function numericId(x) {
  return /^[1-9][0-9]*$/.test(String(x)) ? String(x) : null;
}
export function validateAuthority(env, now = Date.now()) {
  requireCondition(env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    env.GITHUB_REPOSITORY === S3A.repo &&
    env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_ACTOR === S3A.actor, 'UNAUTHORIZED_DISPATCH');
  requireCondition(env.MYEONGHA_WATCHTOWER_TRACK === 'saju-bridge' &&
    env.S3A_CONFIRM === S3A.confirm &&
    env.SUPABASE_PROJECT_ID === S3A.project, 'OWNER_SCOPE_MISMATCH');
  requireCondition(/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? ''), 'INVALID_HEAD_SHA');
  requireCondition(numericId(env.S3A_BACKUP_RUN_ID) &&
    numericId(env.S3A_RESTORE_RUN_ID) &&
    env.S3A_BACKUP_RUN_ID !== env.S3A_RESTORE_RUN_ID, 'INVALID_RUN_IDS');
  const end = canonicalUtc(env.S3A_WINDOW_END_UTC);
  requireCondition(end > now && end - now <= 30 * 60 * 1000,
    'OUTSIDE_MAX_30_MINUTE_OWNER_WINDOW');
  return Object.freeze({
    backupId: String(env.S3A_BACKUP_RUN_ID),
    restoreId: String(env.S3A_RESTORE_RUN_ID),
    windowEnd: end,
  });
}
function checkedAge(value, now, maxMs, code) {
  const date = Date.parse(value);
  requireCondition(Number.isFinite(date) && now >= date && now - date <= maxMs, code);
  return date;
}
export function validateRunGraph(input, now = Date.now()) {
  const { backupId, restoreId, backup, restore, backupRuns, restoreArtifacts, branch } = input;
  requireCondition(branch?.commit?.sha === input.expectedMainSha, 'MAIN_SHA_MOVED');
  requireCondition(backup?.id?.toString() === backupId &&
    backup?.path === S3A.backupWorkflow &&
    backup?.status === 'completed' && backup?.conclusion === 'success' &&
    backup?.head_branch === 'main' &&
    ['schedule', 'workflow_dispatch', 'push'].includes(backup?.event) &&
    backup?.repository?.full_name === S3A.repo &&
    /^[0-9a-f]{40}$/.test(backup?.head_sha ?? ''), 'BACKUP_SOURCE_MISMATCH');
  const completed = checkedAge(backup.updated_at, now, 30 * 3600_000, 'BACKUP_TOO_OLD');
  requireCondition(Array.isArray(backupRuns?.workflow_runs), 'BACKUP_RUN_LIST_MISSING');
  const newest = backupRuns.workflow_runs.filter(run => run.head_branch === 'main' &&
    run.path === S3A.backupWorkflow);
  requireCondition(newest.length > 0 &&
    newest[0].id?.toString() === backupId &&
    newest[0].conclusion === 'success' &&
    newest[0].status === 'completed', 'NOT_LATEST_SUCCESSFUL_BACKUP');
  requireCondition(restore?.id?.toString() === restoreId &&
    restore?.path === S3A.restoreWorkflow &&
    restore?.event === 'workflow_dispatch' &&
    restore?.head_branch === 'main' &&
    restore?.status === 'completed' && restore?.conclusion === 'success' &&
    restore?.repository?.full_name === S3A.repo, 'RESTORE_RUN_NOT_VERIFIED');
  const restoreCompleted = checkedAge(restore.updated_at, now, 4 * 3600_000,
    'RESTORE_TOO_OLD');
  requireCondition(restoreCompleted > completed &&
    Date.parse(restore.created_at) >= Date.parse(backup.created_at),
    'RESTORE_PREDATES_BACKUP');
  const artifact = (restoreArtifacts?.artifacts || []).find(a =>
    a.name === 'postgres-isolated-restore-drill-' + restoreId &&
    !a.expired && Number(a.size_in_bytes) > 0 && numericId(a.id));
  requireCondition(artifact, 'RESTORE_EVIDENCE_ARTIFACT_MISSING');
  return Object.freeze({
    backupSha: backup.head_sha,
    backupId,
    restoreId,
    restoreArtifactId: String(artifact.id),
  });
}
export function validateRestoreEvidence(ev, graph, now = Date.now()) {
  requireCondition(ev && typeof ev === 'object' &&
    ev.evidence_envelope_version === 'myeongha-postgres-isolated-restore-evidence-envelope-v1' &&
    ev.schema_version === 'myeongha-postgres-isolated-restore-drill-v1' &&
    ev.restore_target === 'github-actions-loopback-supabase-postgres' &&
    ev.project_ref === S3A.project &&
    ev.backup_workflow_run_id === graph.backupId &&
    ev.source_sha === graph.backupSha &&
    ev.backup_migration_frontier === S3A.migrationFrontier &&
    ev.dr_ready === false &&
    ev.privacy_reconciliation === 'not_exercised_by_this_workflow' &&
    ev.source_artifact_name?.startsWith('myeongha-postgres-') &&
    /^[0-9a-f]{64}$/.test(ev.source_encrypted_sha256 ?? ''),
    'RESTORE_ENVELOPE_MISMATCH');
  requireCondition(canonicalUtc(ev.source_artifact_expires_at) > now,
    'BACKUP_ARTIFACT_EXPIRED');
  requireCondition(Date.parse(ev.restore_completed_at_utc) <= now,
    'RESTORE_COMPLETION_INVALID');
  return true;
}
async function fetchApi(path, token) {
  const res = await fetch('https://api.github.com' + path, {
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(10_000),
  });
  requireCondition(res.ok, 'GITHUB_EVIDENCE_HTTP_' + res.status);
  return res.json();
}
async function graphFromGitHub(env) {
  const credentials = env.GH_TOKEN;
  requireCondition(!!credentials, 'MISSING_GITHUB_METADATA_TOKEN');
  const backupId = String(env.S3A_BACKUP_RUN_ID);
  const restoreId = String(env.S3A_RESTORE_RUN_ID);
  const root = '/repos/' + S3A.repo;
  const [backup, restore, backupRuns, restoreArtifacts, branch] = await Promise.all([
    fetchApi(root + '/actions/runs/' + backupId, credentials),
    fetchApi(root + '/actions/runs/' + restoreId, credentials),
    fetchApi(root + '/actions/workflows/production-postgres-backup.yml/runs?per_page=30', credentials),
    fetchApi(root + '/actions/runs/' + restoreId + '/artifacts?per_page=100', credentials),
    fetchApi(root + '/branches/main', credentials),
  ]);
  return validateRunGraph({
    backupId, restoreId, backup, restore, backupRuns, restoreArtifacts, branch,
    expectedMainSha: env.GITHUB_SHA,
  });
}
async function main(env = process.env) {
  const phase = process.argv[2];
  requireCondition(phase === 'source' || phase === 'verify', 'INVALID_PHASE');
  validateAuthority(env);
  const graph = await graphFromGitHub(env);
  if (phase === 'verify') {
    const content = await readFile(resolve(env.S3A_RESTORE_EVIDENCE_DIR,
      'restore-evidence.json'), 'utf8');
    validateRestoreEvidence(JSON.parse(content), graph);
  } else {
    requireCondition(!!env.GITHUB_OUTPUT, 'MISSING_GITHUB_OUTPUT');
    await appendFile(env.GITHUB_OUTPUT,
      'restore_artifact_id=' + graph.restoreArtifactId + '\n');
  }
  console.log('s3a_' + phase + '_authority=pass');
  console.log('backup_run_id=' + graph.backupId);
  console.log('restore_run_id=' + graph.restoreId);
  console.log('source_sha=' + graph.backupSha);
  console.log('production_ddl_performed=false');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof Error && /^S3A_HOLD_/.test(error.message)
      ? error.message : 'S3A_HOLD_UNEXPECTED_PREFLIGHT_FAILURE');
    process.exitCode = 1;
  });
}
