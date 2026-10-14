// Exact Git blob-guarded 1650 replay in a disposable PG17 transaction.
// Only top-level BEGIN/COMMIT fences are stripped from a byte-verified source.
// This does NOT validate original COMMIT atomicity or approve Production.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const hold=s=>{throw new Error('HOLD_R2_H_1650_'+s);};
export const pinnedBlob='702166644092b8bc4b91ef8428b36901c636811b';
export function normalized1650(raw,expected=pinnedBlob){
 if(typeof raw!=='string'||raw.length===0)hold('MISSING_SOURCE');
 const blob=createHash('sha1').update('blob '+Buffer.byteLength(raw,'utf8')+'\0'+raw).digest('hex');
 if(blob!==expected)hold('GIT_BLOB_DRIFT');
 const lines=raw.split(/\n/u);
 const begin=lines.flatMap((s,i)=>s.trim().toLowerCase()==='begin;'?[i]:[]);
 const commit=lines.flatMap((s,i)=>s.trim().toLowerCase()==='commit;'?[i]:[]);
 if(begin.length!==1||commit.length!==1||begin[0]>=commit[0])hold('TRANSACTION_FENCE_SHAPE');
 if(lines.slice(0,begin[0]).some(s=>s.trim()!==''&&!s.trim().startsWith('--')))
  hold('PRE_BEGIN_SQL');
 if(lines.slice(commit[0]+1).some(s=>s.trim()!==''))hold('POST_COMMIT_SQL');
 const out=lines.filter((_,i)=>i!==begin[0]&&i!==commit[0]).join('\n');
 if(!out.includes('for share;')||!out.includes("s.status = 'active'")
 ||!out.includes('perform public.seyeon_ai_lock_active_subject_for_cost_v1(p_subject_id);')
 ||!out.includes('where d.bucket_utc_date=v_day'))
  hold('LOCK_ORDER_SOURCE_DRIFT');
 if(!/revoke all on function public\.seyeon_ai_lock_active_subject_for_cost_v1\(uuid\)/u.test(out))
  hold('LOCK_HELPER_ACL_SOURCE_DRIFT');
 return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4)hold('USAGE');
  const source=readFileSync('supabase/migrations/1650_seyeon_governed_active_subject_lock_v1.sql','utf8');
  writeFileSync(process.argv[2],normalized1650(source),'utf8');
  if(process.argv[3]!=='--isolated-pg17-only')hold('ISOLATION_ACK_REQUIRED');
  console.log('PREPARED_R2_H_1650_BLOB_VERIFIED_TRANSACTION_FENCES_NORMALIZED_NOT_PRODUCTION');
 }catch(e){console.error(String(e.message).slice(0,200));process.exitCode=1;}
}
