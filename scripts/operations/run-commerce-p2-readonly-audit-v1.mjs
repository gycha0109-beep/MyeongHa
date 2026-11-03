// Watchtower-Track: commerce-payment
// Explicit owner-initiated, read-only P2 catalog + charge-term snapshot.
// No HTTP route, no environment autodiscovery, no DB writes or PSP request.
import { X509Certificate } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  inspectCommerceP2SingleSnapshotHoldV1,
} from './commerce-p2-single-snapshot-readiness-hold-v1.mjs';

const CONFIG_KEYS=Object.freeze([
  'MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL',
  'MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_HOST',
  'MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT',
  'MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_ROLE',
  'MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM',
  'MYEONGHA_COMMERCE_P2_AUDIT_CA_FINGERPRINT256',
]);
const FINGERPRINT=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/u;

function strictCa(pem,fingerprint){
  try{
    if(typeof pem!=='string'||pem.length>16384
      ||!pem.includes('-----BEGIN CERTIFICATE-----')
      ||pem.includes('PRIVATE KEY')
      ||typeof fingerprint!=='string'||!FINGERPRINT.test(fingerprint))
      return false;
    const cert=new X509Certificate(pem);
    return cert.ca===true&&cert.fingerprint256===fingerprint
      &&Date.parse(cert.validFrom)<=Date.now()
      &&Date.now()<Date.parse(cert.validTo);
  }catch{return false;}
}

export function buildCommerceP2AuditDbTargetV1(env,{
  validateCa=strictCa,
}={}){
  try{
    // PEM commonly ends with a newline; do not reject a valid root for it.
    if(CONFIG_KEYS.some(k=>typeof env?.[k]!=='string'||env[k].length===0)
      ||CONFIG_KEYS.filter(k=>k!=='MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM')
        .some(k=>env[k].trim()!==env[k]))
      return null;
    const url=new URL(env.MYEONGHA_COMMERCE_P2_AUDIT_DATABASE_URL);
    const host=env.MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_HOST;
    const port=env.MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_PORT;
    const user=env.MYEONGHA_COMMERCE_P2_AUDIT_EXPECTED_ROLE;
    if(!['postgres:','postgresql:'].includes(url.protocol)
      ||!host||!/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}$/u.test(host)
      ||url.hostname!==host
      ||!/^[1-9][0-9]{0,4}$/u.test(port)
      ||Number(port)>65535||url.port!==port
      ||!/^[a-zA-Z0-9_.-]{3,128}$/u.test(user)
      ||decodeURIComponent(url.username)!==user
      ||!url.password
      ||url.pathname!=='/postgres'
      ||url.hash
      ||[...url.searchParams.keys()].some(k=>k!=='sslmode')
      ||url.searchParams.get('sslmode')!=='verify-full'
      ||!validateCa(env.MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM,
        env.MYEONGHA_COMMERCE_P2_AUDIT_CA_FINGERPRINT256))
      return null;
    url.searchParams.delete('sslmode');
    return Object.freeze({
      connectionString:url.toString(),
      ssl:Object.freeze({
        ca:env.MYEONGHA_COMMERCE_P2_AUDIT_CA_PEM,
        rejectUnauthorized:true,
        servername:host,
      }),
      options:'-c default_transaction_read_only=on',
      connectionTimeoutMillis:8000,
      query_timeout:10000,
      statement_timeout:10000,
      application_name:'myeongha_commerce_p2_readonly_audit',
    });
  }catch{return null;}
}

function fail(code){
  return Object.freeze({
    exitCode:2,
    output:Object.freeze({
      status:'HOLD',
      code,
      saleActivationAuthorized:false,
      checkoutAuthorized:false,
      productionReaderFulfillmentAuthorized:false,
      writesPerformed:false,
    }),
  });
}

/**
 * Call only with a separately provided trusted full-visibility P2 audit login,
 * independently approved host and pinned CA fingerprint.
 * Never logs a DSN, SQL error, credential or private database row.
 * A successful exit means only the expected *HOLD* was observed, NOT launch.
 */
export async function runCommerceP2ReadOnlyAuditOperatorV1(env,{
  validateCa,
  clientFactory,
}={}){
  const options=buildCommerceP2AuditDbTargetV1(env,{
    ...(validateCa?{validateCa}:{}),
  });
  if(!options)return fail('P2_AUDIT_CONFIGURATION_NOT_TRUSTED');
  let client;
  try{
    if(clientFactory)client=await clientFactory(options);
    else{
      const {Client}=await import('pg');
      client=new Client(options);
    }
    if(!client||typeof client.connect!=='function'
      ||typeof client.query!=='function'||typeof client.end!=='function')
      return fail('P2_AUDIT_INVALID_CLIENT');
    await client.connect();
    const evidence=await inspectCommerceP2SingleSnapshotHoldV1(client);
    if(!evidence||evidence.writesPerformed!==false
      ||evidence.saleActivationAuthorized!==false
      ||evidence.checkoutAuthorized!==false
      ||evidence.productionReaderFulfillmentAuthorized!==false
      ||!['hold_observed','investigation_required'].includes(evidence.status))
      return fail('P2_AUDIT_UNTRUSTED_EVIDENCE');
    return Object.freeze({
      exitCode:evidence.status==='hold_observed'?0:2,
      output:Object.freeze({
        status:evidence.status==='hold_observed'?'HOLD_OBSERVED':'INVESTIGATION_REQUIRED',
        schemaVersion:evidence.schemaVersion,
        productKey:evidence.productKey,
        decisionAuthority:evidence.decisionAuthority,
        driftKeys:evidence.driftKeys,
        blockers:evidence.blockers,
        counts:evidence.counts,
        saleActivationAuthorized:false,
        checkoutAuthorized:false,
        productionReaderFulfillmentAuthorized:false,
        writesPerformed:false,
      }),
    });
  }catch{
    return fail('P2_AUDIT_EXECUTION_UNVERIFIED');
  }finally{
    if(client&&typeof client.end==='function'){
      try{await client.end();}catch{/* never expose private errors */}
    }
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const outcome=await runCommerceP2ReadOnlyAuditOperatorV1(process.env);
  process.stdout.write(JSON.stringify(outcome.output)+'\n');
  process.exitCode=outcome.exitCode;
}
