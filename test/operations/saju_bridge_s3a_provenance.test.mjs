import test from 'node:test';
import assert from 'node:assert/strict';
import { S3A, validateAuthority, validateRunGraph, validateRestoreEvidence } from '../../scripts/operations/saju-bridge-s3a-provenance.mjs';
const t0=Date.parse('2026-10-16T10:00:00Z');
const SHA='a'.repeat(40);
const auth=()=>({
  GITHUB_EVENT_NAME:'workflow_dispatch',
  GITHUB_REPOSITORY:S3A.repo,
  GITHUB_REF:'refs/heads/main',
  GITHUB_ACTOR:S3A.actor,
  GITHUB_TRIGGERING_ACTOR:S3A.actor,
  GITHUB_RUN_ATTEMPT:'1',
  MYEONGHA_WATCHTOWER_TRACK:'saju-bridge',
  S3A_CONFIRM:S3A.confirm,
  S3A_STOP_OWNER:S3A.actor,
  SUPABASE_PROJECT_ID:S3A.project,
  GITHUB_SHA:SHA,
  S3A_BACKUP_RUN_ID:'100',
  S3A_RESTORE_RUN_ID:'200',
  S3A_WINDOW_END_UTC:'2026-10-16T10:20:00Z',
});
function fixture() {
  const backup={
    id:100,path:S3A.backupWorkflow,status:'completed',conclusion:'success',
    head_branch:'main',event:'schedule',repository:{full_name:S3A.repo},
    head_sha:SHA,created_at:'2026-10-16T07:00:00Z',updated_at:'2026-10-16T07:03:00Z',
  };
  return {
    backupId:'100',restoreId:'200',expectedMainSha:SHA,
    backup,
    restore:{
      id:200,path:S3A.restoreWorkflow,status:'completed',conclusion:'success',
      event:'workflow_dispatch',head_branch:'main',repository:{full_name:S3A.repo},
      created_at:'2026-10-16T09:40:00Z',updated_at:'2026-10-16T09:42:00Z',
    },
    backupRuns:{workflow_runs:[backup]},
    restoreArtifacts:{artifacts:[{
      id:321,name:'postgres-isolated-restore-drill-200',
      expired:false,size_in_bytes:1000,
    }]},
    branch:{commit:{sha:SHA}},
  };
}
const envelope=(graph)=>({
  schema_version:'myeongha-postgres-isolated-restore-drill-v1',
  evidence_envelope_version:'myeongha-postgres-isolated-restore-evidence-envelope-v1',
  restore_target:'github-actions-loopback-supabase-postgres',
  project_ref:S3A.project,
  backup_workflow_run_id:graph.backupId,
  source_sha:graph.backupSha,
  backup_migration_frontier:S3A.migrationFrontier,
  dr_ready:false,privacy_reconciliation:'not_exercised_by_this_workflow',
  source_artifact_name:'myeongha-postgres-20261016T070000Z',
  source_encrypted_sha256:'f'.repeat(64),
  source_artifact_expires_at:'2026-11-16T07:03:00Z',
  restore_completed_at_utc:'2026-10-16T09:42:00Z',
});

test('requires exact Owner actor, project, scope and bounded UTC stop window',()=>{
  assert.equal(validateAuthority(auth(),t0).backupId,'100');
  for(const [field,value] of [
    ['GITHUB_ACTOR','someone-else'],['GITHUB_TRIGGERING_ACTOR','someone-else'],
    ['GITHUB_RUN_ATTEMPT','2'],['GITHUB_EVENT_NAME','push'],
    ['SUPABASE_PROJECT_ID','different'],['S3A_CONFIRM','approve'],
    ['S3A_STOP_OWNER','somebody-else'],
    ['MYEONGHA_WATCHTOWER_TRACK','ops'],
    ['S3A_WINDOW_END_UTC','2026-10-16T10:35:00Z'],
    ['S3A_WINDOW_END_UTC','2026-10-16T09:59:59Z'],
    ['S3A_BACKUP_RUN_ID','100;rm -rf /'],
  ]) {
    assert.throws(()=>validateAuthority({...auth(),[field]:value},t0),{message:/S3A_HOLD_/},field);
  }
});
test('only exact current successful latest backup and fresh isolated restore',()=>{
  const a=fixture();
  const x=validateRunGraph(a,t0);
  assert.equal(x.restoreArtifactId,'321');
  assert.equal(x.backupSha,SHA);
  const overrides=[
    {branch:{commit:{sha:'b'.repeat(40)}}},
    {backupRuns:{workflow_runs:[{...a.backup,id:201},a.backup]}},
    {backup:{...a.backup,conclusion:'failure'}},
    {restore:{...a.restore,conclusion:'failure'}},
    {restore:{...a.restore,updated_at:'2026-10-16T02:00:00Z'}},
    {restoreArtifacts:{artifacts:[]}},
  ];
  for(const mutation of overrides) {
    assert.throws(()=>validateRunGraph({...a,...mutation},t0),{message:/S3A_HOLD_/});
  }
});
test('exact bound metadata envelope, no DR promotion',()=>{
  const g=validateRunGraph(fixture(),t0);
  assert.equal(validateRestoreEvidence(envelope(g),g,t0),true);
  const orig=envelope(g);
  for(const mutation of [
    {backup_workflow_run_id:'other'},{source_sha:'b'.repeat(40)},
    {project_ref:'other'},{dr_ready:true},
    {backup_migration_frontier:1510},
    {source_artifact_expires_at:'2026-10-16T09:59:59Z'},
    {source_encrypted_sha256:'INVALID'},
    {privacy_reconciliation:'authoritative'},
  ]) {
    assert.throws(()=>validateRestoreEvidence({...orig,...mutation},g,t0),
      {message:/S3A_HOLD_/});
  }
});
