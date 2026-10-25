// Watchtower-Track: security
// Reuse canonical config, approved target and Hyperdrive pool authority.
import {parseProductionUserDataRuntimeConfigV1} from '../apps/api/src/production-user-data-runtime-config.js';
import {approvedCloudflarePostgresTargetV1} from './cloudflare-auth-db-api.mjs';
import {createCloudflareSeyeonSubjectPoolV1,createCloudflareSeyeonGovernedPoolV1} from './cloudflare-hyperdrive-subject-pool.mjs';
import {createProductionSeyeonFirstMemoryFetchRuntimeV1} from '../apps/api/src/production-seyeon-first-memory-fetch-runtime-v1.js';
const limits=Object.freeze({maxConnectionsPerRuntime:1,connectionTimeoutMs:5000,idleTimeoutMs:1000,statementTimeoutMs:5000});
export function createCloudflareSeyeonFirstMemoryRuntimeV1(input){
 const config=parseProductionUserDataRuntimeConfigV1(input.env);
 if(!approvedCloudflarePostgresTargetV1(config,input.env)){
   throw Error('Cloudflare requires explicitly verified Hyperdrive origin');
 }
 const pool=createCloudflareSeyeonSubjectPoolV1(input.env,limits);
 const governedCostPool=createCloudflareSeyeonGovernedPoolV1(input.env,limits);
 const runtime=createProductionSeyeonFirstMemoryFetchRuntimeV1({...input,pool,governedCostPool});
 return Object.freeze({handleRequest:request=>runtime.handleRequest(request),async close(){
   try{await runtime.close();}finally{try{await pool.close();}finally{await governedCostPool.close();}}
 }});
}
