import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  readChatOpenSourceInputs, collectChatOpenRpcBoundary, verifyChatOpenRpcBoundary,
  CHAT_OPEN_SOURCE_FILES,
} from './verify-chat-open-indirect-rpc-source-boundary.mjs';
import {readFile} from 'node:fs/promises';

const base=await readChatOpenSourceInputs();
const saved=JSON.parse(await readFile(
  'docs/operations/POSTGRES_CHAT_OPEN_RPC_SOURCE_BOUNDARY_20261108.json','utf8'));
const make=()=>structuredClone(base);
const fail=x=>assert.throws(()=>collectChatOpenRpcBoundary(x),
  /CHAT_OPEN_RPC_SOURCE_BOUNDARY_INVALID/u);
const http='apps/api/src/chat-open-http.ts';
const tx='apps/api/src/postgres-subject-execution.ts';
const mount='apps/api/src/production-chat-read-runtime.ts';

test('current source contract and observed function grants; no runtime or DR admission',()=>{
  const snap=collectChatOpenRpcBoundary(make());
  assert.deepEqual(snap,saved);
  assert.deepEqual(verifyChatOpenRpcBoundary(saved,snap),{
    state:'source_contract_only',route:'/api/chat',
    command:'cmd_open_member_single_character_thread_v1',
    sourceCount:CHAT_OPEN_SOURCE_FILES.length,
    deployedRouteAndCallerContextTested:false,drReady:false,
  });
  assert.equal(snap.command.securityDefiner,true);
  assert.equal(snap.command.apiExecutorCallable,true);
  assert.equal(snap.command.anonCallable,false);
  assert.equal(snap.command.authenticatedCallable,false);
});

test('fail closed on catalog privilege grant, signature, owner or inferred call graph',()=>{
  for(const key of ['anonCallable','authenticatedCallable','serviceRoleCallable']){
    const x=make();x.metadata.evidence.functions.find(f=>f.name===snapName())[key]=true;
    fail(x);
  }
  for(const [key,value] of [
    ['owner','postgres'],['signature','p_subject_id uuid'],['searchPathKind','unset'],
  ]){
    const x=make();x.metadata.evidence.functions.find(f=>f.name===snapName())[key]=value;
    fail(x);
  }
  const x=make();x.metadata.evidence.functions.find(f=>f.name===snapName())
    .possibleTableReferences[0].catalogDependency=true;fail(x);
});
function snapName(){return 'cmd_open_member_single_character_thread_v1';}

test('route composition must pass server verifier and leased pool',()=>{
  const x=make();
  x.sources[mount]=x.sources[mount].replace('pool: poolLease.pool,','pool: requestInput.request,');
  fail(x);
  const y=make();
  y.sources[mount]=y.sources[mount].replace(
    'identityEvidenceVerifier,','identityEvidenceVerifier: undefined,');
  fail(y);
});

test('route must verify identity before reading body or entering SQL',()=>{
  const x=make();
  x.sources[http]=x.sources[http].replace(
    'body = await readChatOpenJsonRequestBodyV1(input.request);',
    'body = await readBodyUnsafe(input.request);');
  fail(x);
  const y=make();
  y.sources[http]=y.sources[http].replace(
    'const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(',
    'const verifiedEvidence = input.request.headers.get(');
  fail(y);
});

test('guest/member boundary must occur before database command',()=>{
  const x=make();x.sources[http]=x.sources[http].replace(
    "if (resolvedSubject.subjectKind !== 'member')",
    "if (resolvedSubject.subjectKind === 'member')");
  fail(x);
});

test('SQL function and bound subject argument must remain exact',()=>{
  const x=make();x.sources[http]=x.sources[http].replace(
    'from public.cmd_open_member_single_character_thread_v1(',
    'from public.cmd_open_member_single_character_thread_legacy(');
  fail(x);
  const y=make();y.sources[http]=y.sources[http].replace(
    /resolvedSubject\.subjectId,\s*characterId,/u,
    'characterId, resolvedSubject.subjectId,');
  fail(y);
  const z=make();z.sources[http]=z.sources[http].replace(
    '$2::text,','$2::uuid,');
  fail(z);
});

test('transaction must keep local role, subject assertion and rollback',()=>{
  for(const [original,replacement] of [
    ['SET LOCAL ROLE myeongha_api_executor','SET ROLE postgres'],
    ['await connection.query(ASSERT_SUBJECT_CONTEXT_SQL, [resolvedSubject.subjectId]);',
     'await connection.query(COMMIT_SQL);'],
    ['await connection.query(ROLLBACK_SQL);','await connection.query(COMMIT_SQL);'],
  ]){
    const x=make();x.sources[tx]=x.sources[tx].replace(original,replacement);fail(x);
  }
});

test('source and grant snapshot modifications do not silently verify',()=>{
  const x=make();x.grants.authority.drReady=true;fail(x);
  const addedGrant=make();
  addedGrant.grants.summary.effectiveRoleCounts.authenticated.readGrantAndSchemaUsage=1;
  fail(addedGrant);
  const y=make();y.metadata.authorization.indirectRpcContainmentVerified=true;fail(y);
  const altered=structuredClone(saved);
  altered.authority.drReady=true;
  assert.throws(()=>verifyChatOpenRpcBoundary(altered,collectChatOpenRpcBoundary(make())),
    /CHAT_OPEN_RPC_SOURCE_BOUNDARY_INVALID/u);
  const wrongHash=structuredClone(saved);
  wrongHash.sourceSha256[http]='a'.repeat(64);
  assert.throws(()=>verifyChatOpenRpcBoundary(wrongHash,collectChatOpenRpcBoundary(make())),
    /CHAT_OPEN_RPC_SOURCE_BOUNDARY_INVALID/u);
});

test('LF and CRLF checkouts produce the same pinned source SHA and result',()=>{
  const lf=make();
  for(const path of CHAT_OPEN_SOURCE_FILES)
    lf.sources[path]=lf.sources[path].replace(/\r\n/gu,'\n');
  const crlf=make();
  for(const path of CHAT_OPEN_SOURCE_FILES)
    crlf.sources[path]=crlf.sources[path].replace(/\r?\n/gu,'\r\n');
  assert.deepEqual(collectChatOpenRpcBoundary(lf),saved);
  assert.deepEqual(collectChatOpenRpcBoundary(crlf),saved);
});

test('no raw database SQL definitions or client identifiers in public evidence',()=>{
  assert.equal('sourceText' in saved,false);
  assert.equal('functionDefinition' in saved.command,false);
  assert.equal(saved.authority.databaseFunctionBodyAuthorizationAudited,false);
  assert.equal(saved.authority.deployedRouteAndCallerContextTested,false);
  for(const value of Object.values(saved.sourceSha256))
    assert.match(value,/^[a-f0-9]{64}$/u);
});
