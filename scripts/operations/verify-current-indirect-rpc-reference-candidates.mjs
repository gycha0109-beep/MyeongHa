import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION = 'ops-current-indirect-rpc-reference-census-report-v1';
const SUM_KEYS = [
  'matched_functions', 'security_definer_functions',
  'client_callable_definer_candidates', 'api_executor_callable_definer_candidates',
  'unpinned_definer_candidates', 'nonempty_search_path_definer_candidates',
  'anon_callable_matches', 'authenticated_callable_matches',
  'api_executor_callable_matches', 'table_name_reference_pairs',
];
const HASHTEST = /^[a-f0-9]{64}$/u;
function sameKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value,k));
}
function fail(message) { throw Error('INDIRECT_RPC_EVIDENCE_INVALID: '+message); }

export function verifyCurrentIndirectRpcReferences(report, grants, sql) {
  if (!sameKeys(report, ['schemaVersion','sourceQuery','sourceRoleGrants',
    'productionProjectRef','evidence','authorization','limitations']) ||
      report.schemaVersion!==VERSION ||
      report.sourceQuery!=='scripts/operations/production-rls-disabled-indirect-function-candidates-readonly.sql' ||
      report.sourceRoleGrants!=='docs/operations/POSTGRES_CURRENT_RLS_DISABLED_ROLE_GRANTS_20261108.json' ||
      report.productionProjectRef!==grants?.productionProjectRef)
    fail('source/version mismatch');
  const a=report.authorization;
  if (!sameKeys(a,['productionReadOnly','sourceDefinitionBodyExported',
    'sourceTextMatchIsConfirmedCallEdge','callerContextAuthorizationVerified',
    'indirectRpcContainmentVerified','restoredSchemaParityVerified',
    'drReady','serviceResumptionAllowed']) ||
      a.productionReadOnly!==true ||
      Object.entries(a).some(([k,v])=>k==='productionReadOnly'?v!==true:v!==false))
    fail('authority promotion');
  if (!Array.isArray(report.limitations)||report.limitations.length<4 ||
      report.limitations.some(v=>typeof v!=='string'))
    fail('research limitations absent');
  if (!/BEGIN TRANSACTION READ ONLY;/u.test(sql)||!/ROLLBACK;\s*$/u.test(sql) ||
      !/pg_catalog\.has_function_privilege/u.test(sql) ||
      !/pg_catalog\.pg_get_functiondef/u.test(sql) ||
      !/pg_catalog\.pg_depend/u.test(sql))
    fail('SQL safety/cross-check');
  const targets=[...sql.matchAll(/\('public','([a-z_]+)'\)/gu)].map(x=>'public.'+x[1]);
  const grantTargets=grants?.evidence?.tables?.map(x=>x.schema+'.'+x.table);
  if (targets.length!==18||new Set(targets).size!==18 ||
      !Array.isArray(grantTargets)||grantTargets.length!==18 ||
      targets.some(x=>!grantTargets.includes(x)) ||
      grants?.evidence?.transactionReadOnly!==true ||
      grants?.summary?.distinctRlsEnabledTables!==0 ||
      grants?.authority?.drReady!==false ||
      grants?.authority?.serviceResumptionAllowed!==false)
    fail('target or grant witness drift');
  const e=report.evidence;
  if (!sameKeys(e,['schemaVersion','observedAtUtc','transactionReadOnly',
      'postgresVersion','targetDistinctTables','publicFunctionsScanned',
      'summary','functions']) ||
      e.schemaVersion!=='ops-rls-disabled-indirect-routine-candidates-v1' ||
      !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(e.observedAtUtc) ||
      !Number.isFinite(Date.parse(e.observedAtUtc)) ||
      Date.parse(e.observedAtUtc)<Date.parse(grants.evidence.observedAtUtc) ||
      e.transactionReadOnly!==true ||
      e.targetDistinctTables!==18 ||
      !/^\d+\.\d+/u.test(e.postgresVersion) ||
      !Number.isInteger(e.publicFunctionsScanned) ||
      e.publicFunctionsScanned<e.functions?.length ||
      !Array.isArray(e.functions) ||
      !sameKeys(e.summary,SUM_KEYS))
    fail('catalog scope');
  const summary=Object.fromEntries(SUM_KEYS.map(x=>[x,0]));
  const functionKeys=['schema','name','signature','securityDefiner','owner',
    'searchPathKind','definitionSha256','anonCallable','authenticatedCallable',
    'apiExecutorCallable','serviceRoleCallable','possibleTableReferences'];
  const seen=new Set();
  for(const f of e.functions){
    if (!sameKeys(f,functionKeys) || f.schema!=='public' ||
        !/^[a-z_][a-z_0-9]*$/u.test(f.name) ||
        typeof f.signature!=='string'||typeof f.owner!=='string'||
        !['unset','empty','nonempty'].includes(f.searchPathKind)||
        !HASHTEST.test(f.definitionSha256)||
        !['securityDefiner','anonCallable','authenticatedCallable',
          'apiExecutorCallable','serviceRoleCallable'].every(k=>typeof f[k]==='boolean') ||
        !Array.isArray(f.possibleTableReferences)||f.possibleTableReferences.length===0)
      fail('malformed function');
    const key=f.schema+'.'+f.name+'('+f.signature+')';
    if(seen.has(key))fail('overload collision');
    seen.add(key);
    const refs=new Set();
    for(const match of f.possibleTableReferences){
      if (!sameKeys(match,['name','catalogDependency']) ||
          typeof match.name!=='string' ||
          !targets.includes('public.'+match.name) ||
          typeof match.catalogDependency!=='boolean' ||
          refs.has(match.name))
        fail('invalid dependency or table candidate');
      refs.add(match.name);
      summary.table_name_reference_pairs++;
    }
    summary.matched_functions++;
    if (f.securityDefiner){
      summary.security_definer_functions++;
      if (f.anonCallable||f.authenticatedCallable)
        summary.client_callable_definer_candidates++;
      if (f.apiExecutorCallable)
        summary.api_executor_callable_definer_candidates++;
      if (f.searchPathKind==='unset')
        summary.unpinned_definer_candidates++;
      if (f.searchPathKind==='nonempty')
        summary.nonempty_search_path_definer_candidates++;
    }
    summary.anon_callable_matches+=Number(f.anonCallable);
    summary.authenticated_callable_matches+=Number(f.authenticatedCallable);
    summary.api_executor_callable_matches+=Number(f.apiExecutorCallable);
  }
  if (SUM_KEYS.some(k=>summary[k]!==e.summary[k]) ||
      summary.anon_callable_matches!==0 ||
      summary.authenticated_callable_matches!==0 ||
      summary.client_callable_definer_candidates!==0 ||
      summary.matched_functions!==116 ||
      summary.table_name_reference_pairs!==228 ||
      summary.security_definer_functions!==68 ||
      summary.api_executor_callable_matches!==49 ||
      summary.api_executor_callable_definer_candidates!==48)
    fail('summary mismatch or client-executable candidate');
  return Object.freeze({
    matchedFunctions:summary.matched_functions,
    nameReferencePairs:summary.table_name_reference_pairs,
    definerCandidates:summary.security_definer_functions,
    apiCallableDefinerCandidates:summary.api_executor_callable_definer_candidates,
    unprivilegedCallableCandidates:summary.anon_callable_matches+
      summary.authenticated_callable_matches,
    evidenceIsHeuristic:true, indirectAccessAuthorized:false,
  });
}

export async function findStaticProductionApiCallHints(functions, root='apps/api/src') {
  const files=[];
  async function visit(dir){
    for(const dirent of await readdir(dir,{withFileTypes:true})){
      const file=join(dir,dirent.name);
      if(dirent.isDirectory())await visit(file);
      else if(/\.tsx?$/u.test(file) && !/\.(test|spec)\./u.test(file))
        files.push(file);
    }
  }
  await visit(root);
  const bodies=await Promise.all(files.map(f=>readFile(f,'utf8')));
  let matchedNames=0,totalFileMatches=0,apiDefinersWithoutStaticCall=0,apiDefiners=0;
  for(const f of functions){
    if(!f.apiExecutorCallable)continue;
    const regexp=new RegExp('(^|[^A-Za-z0-9_])'+f.name+'\\s*\\(','iu');
    const count=bodies.filter(body=>regexp.test(body)).length;
    matchedNames+=Number(count>0);
    totalFileMatches+=count;
    if(f.securityDefiner){
      apiDefiners++;
      apiDefinersWithoutStaticCall+=Number(count===0);
    }
  }
  return Object.freeze({
    productionApiFilesScanned:files.length,
    candidateNamesWithFunctionCallText:matchedNames,
    sourceFileTextMatches:totalFileMatches,
    apiDefinerCandidateNamesNotTextMatched:apiDefinersWithoutStaticCall,
    apiDefinerCandidateCount:apiDefiners,
    staticReferenceIsVerifiedExecutionPath:false,
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [report,grants,sql]=await Promise.all([
    readFile('docs/operations/POSTGRES_CURRENT_INDIRECT_RPC_REFERENCE_CANDIDATES_20261108.json','utf8').then(JSON.parse),
    readFile('docs/operations/POSTGRES_CURRENT_RLS_DISABLED_ROLE_GRANTS_20261108.json','utf8').then(JSON.parse),
    readFile('scripts/operations/production-rls-disabled-indirect-function-candidates-readonly.sql','utf8'),
  ]);
  const summary=verifyCurrentIndirectRpcReferences(report,grants,sql);
  const sourceHints=await findStaticProductionApiCallHints(report.evidence.functions);
  console.log('Phase 8-A indirect RPC reference candidates PASS '+
    JSON.stringify({summary,sourceHints}));
}
