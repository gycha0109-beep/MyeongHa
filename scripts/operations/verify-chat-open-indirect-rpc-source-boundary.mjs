// Watchtower-Track: ops
// Fail-closed static source evidence, never live execution or DR admission.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const CHAT_OPEN_SOURCE_BOUNDARY_VERSION='ops-chat-open-rpc-source-boundary-v1';
export const CHAT_OPEN_SOURCE_FILES=Object.freeze([
  'apps/api/src/production-chat-read-runtime.ts',
  'apps/api/src/chat-open-http.ts',
  'apps/api/src/postgres-subject-execution.ts',
]);
const META='docs/operations/POSTGRES_CURRENT_INDIRECT_RPC_REFERENCE_CANDIDATES_20261108.json';
const GRANTS='docs/operations/POSTGRES_CURRENT_RLS_DISABLED_ROLE_GRANTS_20261108.json';
const OUTPUT='docs/operations/POSTGRES_CHAT_OPEN_RPC_SOURCE_BOUNDARY_20261108.json';
const sha=s=>createHash('sha256').update(s).digest('hex');
function invalid(reason){throw Error('CHAT_OPEN_RPC_SOURCE_BOUNDARY_INVALID: '+reason);}
function exact(obj,keys){return obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&
  Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));}
function has(src,re,message){if(!re.test(src))invalid(message);}
function ordered(src,needles,message){
  let cursor=-1;
  for(const n of needles){const pos=src.indexOf(n,cursor+1);
    if(pos===-1)invalid(message+' / '+n);
    cursor=pos;
  }
}
export function collectChatOpenRpcBoundary({metadata,grants,sources}){
  if(metadata?.schemaVersion!=='ops-current-indirect-rpc-reference-census-report-v1'||
    metadata?.authorization?.indirectRpcContainmentVerified!==false||
    metadata?.authorization?.drReady!==false||
    grants?.schemaVersion!=='ops-rls-disabled-effective-grants-report-v1'||
    grants?.authority?.drReady!==false||
    grants?.summary?.distinctTables!==18||
    grants?.summary?.distinctRlsEnabledTables!==0||
    metadata?.productionProjectRef!==grants?.productionProjectRef||
    !['anon','authenticated','myeongha_api_executor'].every(role=>{
      const counts=grants?.summary?.effectiveRoleCounts?.[role];
      return counts?.readGrantAndSchemaUsage===0 &&
        counts?.anyWriteGrantAndSchemaUsage===0;
    }) ||
    !exact(sources,CHAT_OPEN_SOURCE_FILES))invalid('source inputs or authority');
  const candidates=metadata.evidence?.functions?.filter(f=>
    f.schema==='public'&&f.name==='cmd_open_member_single_character_thread_v1');
  if(!Array.isArray(candidates)||candidates.length!==1)invalid('function existence/overload');
  const f=candidates[0];
  const names=f.possibleTableReferences?.map(x=>x.name);
  if(f.securityDefiner!==true||f.apiExecutorCallable!==true||
     f.anonCallable!==false||f.authenticatedCallable!==false||
     f.serviceRoleCallable!==false||f.searchPathKind!=='nonempty'||
     f.owner!=='myeongha_chat_thread_open_owner'||
     f.signature!=='p_subject_id uuid, p_character_id text, p_thread_id uuid, p_thread_character_id uuid'||
     !/^[a-f0-9]{64}$/u.test(f.definitionSha256)||
     !Array.isArray(names)||names.length!==3||
     !['character_runtime_catalog','content_bundles','content_releases'].every(x=>names.includes(x))||
     f.possibleTableReferences.some(r=>r.catalogDependency!==false))
    invalid('current database command metadata');
  const [runtime,http,tx]=CHAT_OPEN_SOURCE_FILES.map(p=>sources[p]);
  if(![runtime,http,tx].every(x=>typeof x==='string'&&x.length>0))
    invalid('source text');
  ordered(runtime,[
    "const url = new URL(requestInput.request.url);",
    "url.pathname === '/api/chat'",
    'await handleChatOpenRequestV1({',
  ],'composition root');
  const openRoute = runtime.split("url.pathname === '/api/chat'")[1]
    ?.split(': await handleChatReadRequestV1(')[0];
  if (!openRoute || !/await handleChatOpenRequestV1\(\{[\s\S]*?identityEvidenceVerifier,\s*pool: poolLease\.pool,/u.test(openRoute))
    invalid('chat-open only: verifier + leased pool');
  has(runtime,/createProductionRequestIdentityVerifierV1\(\{/u,'production identity verifier');
  has(runtime,/createProductionPostgresSubjectPoolLeaseV1\(\{/u,'production DB pool');
  ordered(http,[
    "const POST_METHOD = 'POST'",
    "const ROUTE = '/api/chat'",
    'export async function handleChatOpenRequestV1(',
    'if (!matchesRoute(input.request))',
    'if (input.request.method !== POST_METHOD)',
    'const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(',
    'if (verifiedEvidence === null)',
    'body = await readChatOpenJsonRequestBodyV1(input.request);',
    'if (!CHAT_LAUNCH_CHARACTER_ID_SET_V1.has(characterId))',
    'const data = await executePostgresSubjectTransactionV1({',
    'verifiedEvidence,',
    'execute: async ({ resolvedSubject, client }) => {',
    "if (resolvedSubject.subjectKind !== 'member')",
    'client.query<ChatOpenCommandRowV1>(OPEN_MEMBER_THREAD_SQL, [',
    'resolvedSubject.subjectId,',
  ],'HTTP authenticated member and subject scope');
  has(http,/commandAuthority:\s*'public\.cmd_open_member_single_character_thread_v1'/u,
    'bound command declaration');
  const sql=http.match(/const OPEN_MEMBER_THREAD_SQL = \x60([\s\S]*?)\x60\.trim\(\);/u)?.[1];
  if(!sql||sql.includes(String.fromCharCode(36,123))||
     !/\bfrom\s+public\.cmd_open_member_single_character_thread_v1\s*\(/iu.test(sql))
    invalid('SQL command not pinned');
  const binds=[...sql.matchAll(/\$(\d+)::(uuid|text)\b/gu)].map(m=>m[1]+':'+m[2]);
  if(JSON.stringify(binds)!==JSON.stringify(['1:uuid','2:text','3:uuid','4:uuid']))
    invalid('SQL parameter signature');
  has(http,/client\.query<ChatOpenCommandRowV1>\(OPEN_MEMBER_THREAD_SQL,\s*\[\s*resolvedSubject\.subjectId,\s*characterId,\s*candidateThreadId,\s*candidateThreadCharacterId,\s*\]\)/u,
    'bound source-to-SQL parameter order');
  has(tx,/const BEGIN_SQL = 'BEGIN'/u,'transaction begin');
  has(tx,/const ENTER_EXECUTION_ROLE_SQL = 'SET LOCAL ROLE myeongha_api_executor'/u,
    'transaction role');
  has(tx,/assert_myeongha_subject_context_v1\(\$1::uuid\)/u,
    'subject assertion statement');
  ordered(tx,[
    'await connection.query(BEGIN_SQL);',
    'await connection.query(ENTER_EXECUTION_ROLE_SQL);',
    'const resolvedSubject = await resolveSubjectIdentity({',
    'verifiedEvidence: input.verifiedEvidence,',
    'await connection.query(ASSERT_SUBJECT_CONTEXT_SQL, [resolvedSubject.subjectId]);',
    'const result = await input.execute(',
    'await connection.query(COMMIT_SQL);',
    'await connection.query(ROLLBACK_SQL);',
    'connection.release(discardConnectionError);',
  ],'transaction-local subject and rollback');
  has(tx,/resolvedSubject,\s*client: connection,/u,'subject-scoped client');
  const sourceSha256=Object.fromEntries(CHAT_OPEN_SOURCE_FILES.map(p=>[p,sha(sources[p])]));
  return Object.freeze({
    schemaVersion:CHAT_OPEN_SOURCE_BOUNDARY_VERSION,
    metadataSource:META,grantSource:GRANTS,
    projectRef:metadata.productionProjectRef,
    method:'POST',route:'/api/chat',
    command:Object.freeze({
      schema:f.schema,name:f.name,signature:f.signature,owner:f.owner,
      definitionSha256:f.definitionSha256,securityDefiner:true,
      apiExecutorCallable:true,anonCallable:false,authenticatedCallable:false,
      serviceRoleCallable:false,searchPathKind:f.searchPathKind,
      tableNameHints:Object.freeze([...names].sort()),
      concreteCatalogDependenciesConfirmed:false,
    }),
    sourceSha256:Object.freeze(sourceSha256),
    sourceChecks:Object.freeze({
      routeMountMatched:true,identityVerificationBeforeBodyMatched:true,
      memberOnlyCheckBeforeQueryMatched:true,parameterizedCommandMatched:true,
      transactionLocalRoleMatched:true,subjectAssertionBeforeQueryMatched:true,
      rollbackAndReleaseTextMatched:true,
    }),
    authority:Object.freeze({
      staticSourceBoundaryMatched:true,liveFunctionGrantsObserved:true,
      deployedRouteAndCallerContextTested:false,
      databaseFunctionBodyAuthorizationAudited:false,
      SQLCallGraphProven:false,isolatedRestoreParityProven:false,
      drReady:false,serviceResumptionAllowed:false,
    }),
  });
}
export function verifyChatOpenRpcBoundary(saved,current){
  if(!exact(saved,Object.keys(current))||JSON.stringify(saved)!==JSON.stringify(current))
    invalid('snapshot, source, grant or authority drift');
  if(Object.values(saved.sourceSha256).some(h=>!/^[a-f0-9]{64}$/u.test(h)))
    invalid('source hash malformed');
  return Object.freeze({state:'source_contract_only',route:saved.route,
    command:saved.command.name,sourceCount:CHAT_OPEN_SOURCE_FILES.length,
    deployedRouteAndCallerContextTested:false,drReady:false});
}
export async function readChatOpenSourceInputs(){
  const [metadata,grants,...texts]=await Promise.all([
    readFile(META,'utf8').then(JSON.parse),readFile(GRANTS,'utf8').then(JSON.parse),
    ...CHAT_OPEN_SOURCE_FILES.map(path=>readFile(path,'utf8')),
  ]);
  return {metadata,grants,
    sources:Object.fromEntries(CHAT_OPEN_SOURCE_FILES.map((p,i)=>[p,texts[i]]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const evidence=collectChatOpenRpcBoundary(await readChatOpenSourceInputs());
  if(process.argv.length===3&&process.argv[2]==='--write'){
    await writeFile(OUTPUT,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
    console.log('New static source snapshot created (not runtime or DR approval)');
  }else if(process.argv.length===2){
    const saved=JSON.parse(await readFile(OUTPUT,'utf8'));
    console.log('Phase 8-A Chat open boundary PASS '+JSON.stringify(
      verifyChatOpenRpcBoundary(saved,evidence)));
  }else throw Error('Usage: node verify-chat-open-indirect-rpc-source-boundary.mjs [--write]');
}
