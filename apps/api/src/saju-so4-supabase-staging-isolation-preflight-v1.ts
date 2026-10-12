/**
 * SO-4 Supabase segregation planning gate. NO I/O and NO OPERATIONAL AUTHORITY.
 * Inventory classifications are caller claims, not authenticated Supabase evidence.
 * Even a structurally consistent plan never grants credentials, DB access or Runner.
 */
import { MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF } from './production-user-data-runtime-config.js';

export const SAJU_SO4_SUPABASE_PREFLIGHT_VERSION_V1 =
  'myeongha-saju-so4-supabase-isolation-preflight-v1' as const;

const TOP=['version','provider','environmentId','observedProjects','proposal','maxIncrementalCostUsdCents'] as const;
const PROJECT=['ref','classification'] as const;
const PLAN=['authProjectRef','subjectProjectRef','nonceProjectRef','admissionProjectRef'] as const;
const REF=/^[a-z0-9]{20}$/u;
const ENV=/^myeongha-staging-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;

function plain(value:unknown, keys:readonly string[]):value is Record<string,unknown> {
  try {
    if (!value || typeof value!=='object' || Array.isArray(value)) return false;
    const proto:unknown=Object.getPrototypeOf(value);
    if (proto!==Object.prototype && proto!==null) return false;
    if (Reflect.ownKeys(value).length!==keys.length || Object.keys(value).length!==keys.length) return false;
    return keys.every(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      return descriptor?.enumerable===true && Object.hasOwn(descriptor,'value');
    });
  } catch { return false; }
}
function projectRef(x:unknown):x is string {
  return typeof x==='string' && REF.test(x);
}
type ResultKind='BLOCKED'|'NO_STAGING_RESOURCES'|'CONSISTENT_UNVERIFIED_ORIGIN';
export type SajuSo4SupabasePreflightV1=Readonly<{
  version:typeof SAJU_SO4_SUPABASE_PREFLIGHT_VERSION_V1;
  planShape:ResultKind;
  observedProviderAuthority:'NOT_VERIFIED';
  authProjectAuthority:'NOT_VERIFIED';
  independentSubjectDbAuthority:'NOT_VERIFIED';
  independentNonceDbAuthority:'NOT_VERIFIED';
  independentAdmissionDbAuthority:'NOT_VERIFIED';
  keyCustodyAuthority:'NOT_VERIFIED';
  auditDurability:'NOT_VERIFIED';
  costAuthority:'NOT_VERIFIED';
  evidenceR01ToR14:'NOT_VERIFIED';
  stagingConnection:'NOT_VERIFIED';
  stagingAdmission:'HOLD';
  mayCreateResource:false;
  mayAccessProduction:false;
  mayRunProbe:false;
  mayRetryConsumption:false;
  canRunOnce:false;
  canExecute:false;
  canPublish:false;
  canSell:false;
}>;

/** Zero-I/O checks; inventory is never an authenticated attestation. */
export function assessSajuSo4SupabaseStagingIsolationClaimV1(input:unknown):SajuSo4SupabasePreflightV1 {
  let result:ResultKind='BLOCKED';
  try {
    if (plain(input,TOP)
      && input.version===SAJU_SO4_SUPABASE_PREFLIGHT_VERSION_V1
      && input.provider==='SUPABASE'
      && typeof input.environmentId==='string' && ENV.test(input.environmentId)
      && input.maxIncrementalCostUsdCents===0
      && Array.isArray(input.observedProjects)
      && input.observedProjects.length>0 && input.observedProjects.length<=100
      && plain(input.proposal,PLAN)) {
      const projects=new Map<string,string>();
      let inventoryValid=true;
      for (const entry of input.observedProjects as unknown[]) {
        if (!plain(entry,PROJECT) || !projectRef(entry.ref)
          || !['PRODUCTION','UNRELATED','STAGING_CANDIDATE'].includes(entry.classification as string)
          || projects.has(entry.ref)) { inventoryValid=false; break; }
        projects.set(entry.ref,entry.classification as string);
      }
      if (inventoryValid
        && projects.get(MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF)==='PRODUCTION'
        && [...projects.entries()].filter(([,role])=>role==='PRODUCTION').length===1) {
        const proposed=PLAN.map(k=>(input.proposal as Record<string,unknown>)[k]);
        if (proposed.every(x=>x===null)) {
          result='NO_STAGING_RESOURCES';
        } else if (proposed.every(projectRef)) {
          const [auth,subject,nonce,admission]=proposed as string[];
          // Auth and Subject may share a project *for planning only*. The three
          // ledgers must nevertheless use distinct Postgres projects/clusters.
          if (auth!==undefined && subject!==undefined && nonce!==undefined && admission!==undefined
            && new Set([subject,nonce,admission]).size===3
            && [auth,subject,nonce,admission].every(ref=>projects.get(ref)==='STAGING_CANDIDATE')
            && ![auth,subject,nonce,admission].includes(MYEONGHA_PRODUCTION_SUPABASE_PROJECT_REF)) {
            result='CONSISTENT_UNVERIFIED_ORIGIN';
          }
        }
      }
    }
  } catch { /* Untrusted getters, proxies and malformed claims always HOLD. */ }
  return Object.freeze({
    version:SAJU_SO4_SUPABASE_PREFLIGHT_VERSION_V1,planShape:result,
    observedProviderAuthority:'NOT_VERIFIED' as const,
    authProjectAuthority:'NOT_VERIFIED' as const,
    independentSubjectDbAuthority:'NOT_VERIFIED' as const,
    independentNonceDbAuthority:'NOT_VERIFIED' as const,
    independentAdmissionDbAuthority:'NOT_VERIFIED' as const,
    keyCustodyAuthority:'NOT_VERIFIED' as const,
    auditDurability:'NOT_VERIFIED' as const,
    costAuthority:'NOT_VERIFIED' as const,
    evidenceR01ToR14:'NOT_VERIFIED' as const,
    stagingConnection:'NOT_VERIFIED' as const,
    stagingAdmission:'HOLD' as const,
    mayCreateResource:false as const,
    mayAccessProduction:false as const,
    mayRunProbe:false as const,
    mayRetryConsumption:false as const,
    canRunOnce:false as const,canExecute:false as const,
    canPublish:false as const,canSell:false as const,
  });
}
