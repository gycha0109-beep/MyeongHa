/**
 * D3e20 TEST-SUPPORT ONLY. Advisory read-only catalogue assessment.
 * Never a runtime authorizer or deployment instruction.
 * Fabricated evidence is not real credential isolation proof.
 */
export const CANCEL_REQUIRED_ROUTINES_V1 = Object.freeze([
  'internal_private_cancel_review_v1',
  'internal_private_cancel_commit_review_approval_v1',
  'internal_apply_reviewed_official_reader_full_cancel_private_v1',
  'internal_apply_entitlement_effect_v1',
  'internal_apply_official_reader_verified_cancel_batch_v1',
  'internal_execute_official_reader_verified_cancel_v2',
] as const);

export const CANCEL_EXTERNAL_CUTOVER_PROOFS_V1 = Object.freeze([
  'administrator secret custody and emergency access audits',
  'dedicated process identity and NOLOGIN SQL object ownership',
  'independent signed double approvals and durable antirollback epoch',
  'direct legacy/DB owner/SQL grants and service_role table bypass removed or independently contained',
  'same transaction last authorization with real Reader payment and entitlement writer',
  'provider and Reader replay/ordering/restore/backup recovery verified',
  'Security Commerce Legal Privacy Ops explicit signoffs',
] as const);

export type CancelCutoverEvidenceV1=Readonly<{
  evidence_kind:'read_only_catalog_snapshot_not_authorization';
  release_authorized:false;
  observed_at:string;
  roles:readonly Readonly<{
    role_name:string;role_exists:boolean;can_login:boolean|null;
    superuser:boolean|null;bypass_rls:boolean|null;
    can_create_roles:boolean|null;member_of_dedicated_owner:boolean|null;
  }>[];
  functions:readonly Readonly<{
    routine_name:string;matching_overloads:number;owner_roles:string|null;
    public_execute:boolean|null;anon_execute:boolean|null;
    authenticated_execute:boolean|null;service_role_execute:boolean|null;
    api_executor_execute:boolean|null;commerce_executor_execute:boolean|null;
  }>[];
  entitlement_table:Readonly<{
    table_exists:boolean;
    service_role_all_mutations:boolean|null;
    postgres_all_mutations:boolean|null;
    commerce_executor_all_mutations:boolean|null;
  }>;
}>;

const ROLE_NAMES=[
  'anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner',
  'postgres','myeongha_cancel_verifier','myeongha_cancel_executor',
  'myeongha_cancel_owner',
];
function record(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}
function completeList(rows:unknown[],field:string,names:readonly string[]):boolean{
  if(rows.length!==names.length||!rows.every(record))return false;
  const seen=rows.map(r=>r[field]);
  return seen.every(x=>typeof x==='string'&&names.includes(x))
    &&new Set(seen).size===names.length;
}

/** Never reports authorization, even if the input snapshot looks healthy. */
export function assessCancelCutoverEvidenceV1(evidence:unknown):Readonly<{
  state:'HOLD';releaseAuthorized:false;
  blockers:readonly string[];
  externalProofs:readonly string[];
}>{
  const issues:string[]=[];
  if(!record(evidence)
    ||evidence.evidence_kind!=='read_only_catalog_snapshot_not_authorization'
    ||evidence.release_authorized!==false
    ||typeof evidence.observed_at!=='string'
    ||!Number.isFinite(Date.parse(evidence.observed_at))
    ||!Array.isArray(evidence.roles)||!Array.isArray(evidence.functions)
    ||!record(evidence.entitlement_table)){
    return Object.freeze({state:'HOLD',releaseAuthorized:false,
      blockers:Object.freeze(['catalogue evidence missing, stale or malformed']),
      externalProofs:CANCEL_EXTERNAL_CUTOVER_PROOFS_V1});
  }
  const roles=evidence.roles as unknown[];
  const funcs=evidence.functions as unknown[];
  if(!completeList(roles,'role_name',ROLE_NAMES)){
    issues.push('incomplete or duplicate required role evidence');
  }
  if(!completeList(funcs,'routine_name',CANCEL_REQUIRED_ROUTINES_V1)){
    issues.push('incomplete or duplicate protected function evidence');
  }
  for(const name of CANCEL_REQUIRED_ROUTINES_V1){
    const fn=funcs.find(r=>record(r)&&r.routine_name===name);
    if(!record(fn)||fn.matching_overloads!==1){
      issues.push('protected function absent or overloaded: '+name);
      continue;
    }
    for(const key of ['public_execute','anon_execute',
      'authenticated_execute','service_role_execute',
      'api_executor_execute','commerce_executor_execute']){
      if(fn[key]!==false)issues.push('direct execute grant unverified: '+name+':'+key);
    }
    if(fn.owner_roles!=='myeongha_cancel_owner'){
      issues.push('privileged function owner not dedicated NOLOGIN: '+name);
    }
  }
  const getRole=(name:string)=>{
    const role=roles.find(r=>record(r)&&r.role_name===name);
    return record(role)?role:null;
  };
  const owner=getRole('myeongha_cancel_owner');
  if(!owner||owner.role_exists!==true||owner.can_login!==false
    ||owner.superuser!==false||owner.bypass_rls!==false
    ||owner.can_create_roles!==false){
    issues.push('NOLOGIN function owner not independently configured');
  }
  for(const name of ['myeongha_cancel_verifier','myeongha_cancel_executor']){
    const role=getRole(name);
    if(!role||role.role_exists!==true||role.can_login!==true
      ||role.superuser!==false||role.bypass_rls!==false
      ||role.can_create_roles!==false
      ||role.member_of_dedicated_owner!==false){
      issues.push('dedicated verifier/executor role not isolated: '+name);
    }
  }
  for(const name of ROLE_NAMES.filter(name=>name!=='myeongha_cancel_owner')){
    const role=getRole(name);
    if(!role||role.role_exists!==true||role.member_of_dedicated_owner!==false){
      issues.push('non-owner role can impersonate owner or evidence is missing: '+name);
    }
  }
  const table=evidence.entitlement_table;
  if(table.table_exists!==true)issues.push('entitlement table absent');
  if(table.service_role_all_mutations!==false){
    issues.push('service_role direct entitlement DML is permitted or unknown');
  }
  if(table.commerce_executor_all_mutations!==false){
    issues.push('commerce executor direct entitlement DML is permitted or unknown');
  }
  if(table.postgres_all_mutations!==true){
    issues.push('DB administrator mutation access not conclusively inventoried');
  }
  return Object.freeze({
    state:'HOLD',releaseAuthorized:false,
    blockers:Object.freeze([...new Set(issues)]),
    externalProofs:CANCEL_EXTERNAL_CUTOVER_PROOFS_V1,
  });
}
