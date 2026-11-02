import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Verified Cloudflare account workers.dev subdomain (2026-10-28). No purchased domain required.
export const ADMIN_WORKERS_DEV_HOSTNAME_V1 = 'myeongha-admin.gycha0109.workers.dev';
export const ADMIN_WORKERS_DEV_ORIGIN_V1 = 'https://' + ADMIN_WORKERS_DEV_HOSTNAME_V1;
// A separate Cloudflare Access app for THIS Worker, and existing Member auth,
// must both be configured before the Owner console can be activated.
export const ADMIN_HOSTED_REQUIRED_V1=Object.freeze([
  'MYEONGHA_ADMIN_ORIGIN','MYEONGHA_ADMIN_ACCESS_ISSUER','MYEONGHA_ADMIN_ACCESS_AUD','MYEONGHA_ADMIN_OWNER_EMAIL',
  'MYEONGHA_ADMIN_OWNER_AUTH_USER_ID','MYEONGHA_ADMIN_SUPABASE_ORIGIN','MYEONGHA_SUPABASE_API_KEY','MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN',
  'MYEONGHA_ADMIN_READ_HYPERDRIVE_ID','MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID',
]);
export function inspectAdminHostedDeploymentV1(env,config) {
  const missing=ADMIN_HOSTED_REQUIRED_V1.filter(key=>typeof env[key]!=='string'||!env[key].trim());
  const invalid=[];
  if(config.name!=='myeongha-admin'||config.workers_dev!==true||config.preview_urls!==false||
    config.assets?.binding!=='ASSETS'||config.assets?.directory!=='./dist'||config.assets?.run_worker_first!==true||
    config.main!=='../../cloudflare/admin-worker.mjs'||config.routes!==undefined||config.route!==undefined) invalid.push('isolated_private_worker_config');
  for(const key of ['MYEONGHA_ADMIN_ORIGIN','MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN','MYEONGHA_ADMIN_ACCESS_ISSUER']) {
    if(!env[key])continue;
    try {const url=new URL(env[key]);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)invalid.push(key);}catch{invalid.push(key);}
  }
  if(env.MYEONGHA_ADMIN_ORIGIN && env.MYEONGHA_ADMIN_ORIGIN!==ADMIN_WORKERS_DEV_ORIGIN_V1)
    invalid.push('dedicated_workers_dev_origin_required');
  // This account's active Zero Trust organization. An untrusted Access tenant
  // cannot establish the required one-Owner deployment boundary.
  if(env.MYEONGHA_ADMIN_ACCESS_ISSUER &&
     env.MYEONGHA_ADMIN_ACCESS_ISSUER.replace(/\/$/u,'')!=='https://noisy-star-3d9a.cloudflareaccess.com')
    invalid.push('dedicated_admin_access_issuer_required');
  if(env.MYEONGHA_ADMIN_ACCESS_ISSUER&&!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\/?$/.test(env.MYEONGHA_ADMIN_ACCESS_ISSUER))invalid.push('MYEONGHA_ADMIN_ACCESS_ISSUER');
  if(env.MYEONGHA_ADMIN_ACCESS_AUD&&!/^[a-f0-9]{64}$/i.test(env.MYEONGHA_ADMIN_ACCESS_AUD))invalid.push('MYEONGHA_ADMIN_ACCESS_AUD');
  if(env.MYEONGHA_ADMIN_OWNER_EMAIL&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.MYEONGHA_ADMIN_OWNER_EMAIL))invalid.push('MYEONGHA_ADMIN_OWNER_EMAIL');
  if(env.MYEONGHA_SUPABASE_API_KEY&&(env.MYEONGHA_SUPABASE_API_KEY.length<20||env.MYEONGHA_SUPABASE_API_KEY.startsWith('sb_secret_')))invalid.push('MYEONGHA_SUPABASE_API_KEY');
  if(env.MYEONGHA_ADMIN_ORIGIN&&env.MYEONGHA_ADMIN_ORIGIN===env.MYEONGHA_ADMIN_MEMBER_AUTH_ORIGIN)invalid.push('separate_admin_origin');
  if(env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(env.MYEONGHA_ADMIN_OWNER_AUTH_USER_ID))invalid.push('MYEONGHA_ADMIN_OWNER_AUTH_USER_ID');
  if(env.MYEONGHA_ADMIN_SUPABASE_ORIGIN&&env.MYEONGHA_ADMIN_SUPABASE_ORIGIN!=='https://cnsfpcdiyofqvhpcegfc.supabase.co')invalid.push('MYEONGHA_ADMIN_SUPABASE_ORIGIN');
  const ids=['MYEONGHA_ADMIN_READ_HYPERDRIVE_ID','MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID'].map(key=>env[key]);
  for(let i=0;i<ids.length;i++)if(ids[i]&&!/^[a-f0-9]{32}$/.test(ids[i]))invalid.push(i===0?'MYEONGHA_ADMIN_READ_HYPERDRIVE_ID':'MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID');
  if(ids[0]&&ids[0]===ids[1])invalid.push('distinct_admin_database_origins');
  if(ids.some(id=>['1ffe61390c064c0480a0a1e933e4d2c9','8ee320f55db94f66b2681fcc43995219','64e88db2afcd4118afe1fe29bdf31742'].includes(id)))invalid.push('ordinary_user_database_binding_forbidden');
  const command=env.MYEONGHA_ADMIN_COMMAND_HYPERDRIVE_ID;
  if(command&&(!/^[a-f0-9]{32}$/.test(command)||ids.includes(command)||['1ffe61390c064c0480a0a1e933e4d2c9','8ee320f55db94f66b2681fcc43995219','64e88db2afcd4118afe1fe29bdf31742'].includes(command)))invalid.push('dedicated_admin_command_origin');
  if(command&&(!env.MYEONGHA_ADMIN_CONFIRMATION_SECRET||Buffer.byteLength(env.MYEONGHA_ADMIN_CONFIRMATION_SECRET)<32))missing.push('MYEONGHA_ADMIN_CONFIRMATION_SECRET');
  if(command&&env.MYEONGHA_ADMIN_CONFIRMATION_SECRET&&Buffer.byteLength(env.MYEONGHA_ADMIN_CONFIRMATION_SECRET)>256)invalid.push('MYEONGHA_ADMIN_CONFIRMATION_SECRET');
  const retention=env.MYEONGHA_ADMIN_RETENTION_HYPERDRIVE_ID;
  if(retention&&(!/^[a-f0-9]{32}$/.test(retention)||[...ids,command,'1ffe61390c064c0480a0a1e933e4d2c9','8ee320f55db94f66b2681fcc43995219','64e88db2afcd4118afe1fe29bdf31742'].includes(retention)))invalid.push('dedicated_admin_retention_origin');
  const analyticsRetention=env.MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID;
  if(analyticsRetention&&(!/^[a-f0-9]{32}$/.test(analyticsRetention)||[...ids,command,retention,'1ffe61390c064c0480a0a1e933e4d2c9','8ee320f55db94f66b2681fcc43995219','64e88db2afcd4118afe1fe29bdf31742'].includes(analyticsRetention)))invalid.push('dedicated_admin_analytics_retention_origin');
  return {configurationReady:missing.length===0&&invalid.length===0,missing,invalid,
    operationalVerification:'requires_Access_policy_and_dedicated_origin_role_audit_readback',activationEnabled:env.MYEONGHA_ADMIN_PRIVATE_ENABLED==='true'};
}
export function prepareAdminHostedConfigV1(env,config) {
  const report=inspectAdminHostedDeploymentV1(env,config);
  if(!report.configurationReady)throw Error('Admin deployment configuration is incomplete: '+[...report.missing,...report.invalid].join(', '));
  // workers.dev is a publicly routable hostname; never generate a live
  // activation. The Worker itself fails closed, even before the Access app exists.
  if(config.workers_dev!==true||config.preview_urls!==false)
    throw Error('Isolated workers.dev routing required.');
  const vars={MYEONGHA_ADMIN_PRIVATE_ENABLED:'false',MYEONGHA_ADMIN_CREDIT_COMMANDS_ENABLED:'false',MYEONGHA_ADMIN_RETENTION_ENABLED:'false',MYEONGHA_ADMIN_ANALYTICS_RETENTION_ENABLED:'false',MYEONGHA_ADMIN_HYPERDRIVE_POLICY:'dedicated-admin-verify-full-v1'};
  for(const key of ADMIN_HOSTED_REQUIRED_V1.filter(key=>!key.endsWith('_HYPERDRIVE_ID')&&key!=='MYEONGHA_SUPABASE_API_KEY'))vars[key]=env[key];
  return {...config,vars,hyperdrive:[{binding:'ADMIN_READ_HYPERDRIVE',id:env.MYEONGHA_ADMIN_READ_HYPERDRIVE_ID},
    {binding:'ADMIN_AUDIT_HYPERDRIVE',id:env.MYEONGHA_ADMIN_AUDIT_HYPERDRIVE_ID},
    ...(env.MYEONGHA_ADMIN_COMMAND_HYPERDRIVE_ID?[{binding:'ADMIN_COMMAND_HYPERDRIVE',id:env.MYEONGHA_ADMIN_COMMAND_HYPERDRIVE_ID}]:[]),
    ...(env.MYEONGHA_ADMIN_RETENTION_HYPERDRIVE_ID?[{binding:'ADMIN_RETENTION_HYPERDRIVE',id:env.MYEONGHA_ADMIN_RETENTION_HYPERDRIVE_ID}]:[]),
    ...(env.MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID?[{binding:'ADMIN_ANALYTICS_RETENTION_HYPERDRIVE',id:env.MYEONGHA_ADMIN_ANALYTICS_RETENTION_HYPERDRIVE_ID}]:[])]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=JSON.parse(readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
  const report=inspectAdminHostedDeploymentV1(process.env,config);
  console.log(JSON.stringify(report,null,2)); // Names/status only; never environment values.
  if(process.argv.includes('--write-config')) {
    const path=process.argv[process.argv.indexOf('--write-config')+1];
    if(!path)throw Error('Provide a local generated configuration path.');
    const generated=prepareAdminHostedConfigV1(process.env,config);
    generated.main=fileURLToPath(new URL('../../cloudflare/admin-worker.mjs',import.meta.url));
    generated.assets.directory=fileURLToPath(new URL('./dist',import.meta.url));
    writeFileSync(path,JSON.stringify(generated,null,2)+'\n',{flag:'wx'});
  }
  if(!report.configurationReady&&!process.argv.includes('--allow-blocked'))process.exitCode=2;
}
