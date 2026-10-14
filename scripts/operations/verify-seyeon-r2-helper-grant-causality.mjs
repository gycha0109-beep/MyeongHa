// Reproduce a possible one-edge ACL mechanism in disposable PG17 only.
// Watchtower-Track: ops. No public SQL body/ACL source or role graph output.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
 validateR2AclSnapshot, validateR2ProductionAclEnvelope, compareR2AclSnapshots,
} from './verify-seyeon-r2-acl-grants.mjs';

const helper='assert_seyeon_chat_thread_runtime_v1';
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function hold(reason){throw new Error('HOLD_R2_CAUSAL_FIXTURE_'+reason);}
export function verifyR2TransientGrantCausality(baseline,transient,restored,productionEnvelope){
 const a=validateR2AclSnapshot(baseline);
 const b=validateR2AclSnapshot(transient);
 const r=validateR2AclSnapshot(restored);
 const prod=validateR2ProductionAclEnvelope(productionEnvelope);
 const before=compareR2AclSnapshots(baseline,productionEnvelope.snapshot);
 const simulated=compareR2AclSnapshots(transient,productionEnvelope.snapshot);
 const after=compareR2AclSnapshots(restored,productionEnvelope.snapshot);
 if(!eq(before.canonicalGrantDifferences,[helper])
   || !eq(before.edgeCountDifferences,[helper])
   || before.explicitAclDifferences.length!==0
   || before.rawOnly.length!==0)
   hold('BASELINE_NOT_SINGLE_PRIVILEGED_EDGE');
 if(a.get(helper).grantEdges!==1 || prod.get(helper).grantEdges!==2
   || b.get(helper).grantEdges!==2)
   hold('GRANT_CARDINALITY');
 for (const [name,prev] of a){
   const next=b.get(name),rewound=r.get(name);
   if (!eq(prev,rewound)) hold('ROLLBACK_NOT_CLEAN');
   if (name!==helper&&!eq(prev,next)) hold('UNRELATED_RPC_MUTATED');
   if (next.anonExecute!==false || next.authenticatedExecute!==false)
     hold('BROWSER_PERMISSION_ELEVATED');
 }
 if (!simulated.normalizedGrantGraphMatch
   || simulated.canonicalGrantDifferences.length!==0
   || simulated.edgeCountDifferences.length!==0
   || simulated.explicitAclDifferences.length!==0)
   hold('ONE_EDGE_NOT_SUFFICIENT');
 if(!eq(before,after))hold('POST_ROLLBACK_DIAGNOSTIC_CHANGED');
 return {
  status:'PASS_R2_ONE_EDGE_ACL_EFFECT_REPRODUCED_ORIGIN_UNVERIFIED',
  exactRawAclMatch:simulated.rawOnly.length===0,
  rawAclRemainingDifferences:simulated.rawOnly,
  normalizedGrantGraphMatch:true,
  changedFunction:helper,
  functions:19,
  browserExecExposures:0,
  authorizedForProduction:false,
  drReady:false,
  originEstablished:false,
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==6)throw Error('HOLD_R2_CAUSAL_FIXTURE_USAGE');
  const inp=i=>JSON.parse(readFileSync(process.argv[i],'utf8'));
  console.log(JSON.stringify(verifyR2TransientGrantCausality(inp(2),inp(3),inp(4),inp(5))));
 }catch(e){
  console.error(String(e?.message??e).slice(0,280));
  process.exitCode=1;
 }
}
