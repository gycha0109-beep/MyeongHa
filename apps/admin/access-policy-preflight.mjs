/**
 * Verify the LIVE dedicated Cloudflare Access policy before staging an Admin
 * Worker. Fail closed on missing or broad access. Never logs API tokens,
 * policy owner addresses or remote error bodies.
 */
const HOST='myeongha-admin.gycha0109.workers.dev';
const APP_NAME='MyeongHa Admin Owner Only';
const REFS=/^[a-f0-9]{32}$/iu;
const AUD=/^[a-f0-9]{64}$/iu;

export async function verifyAdminAccessPolicyV1(input){
 const {accountId,apiToken,audience,ownerEmail,fetchImpl=fetch}=input;
 if(!REFS.test(accountId??'')||typeof apiToken!=='string'||apiToken.length<10||
    !AUD.test(audience??'')||typeof ownerEmail!=='string'||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(ownerEmail))
   throw Error('Dedicated Admin Access verification configuration unavailable');
 const base='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/access/apps';
 async function read(path){
  const res=await fetchImpl(path,{method:'GET',redirect:'error',
   headers:{Authorization:'Bearer '+apiToken,Accept:'application/json'},
   signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('Dedicated Admin Access readback unavailable');
  const value=await res.json();
  if(value?.success!==true||!Array.isArray(value.result))
   throw Error('Invalid Admin Access readback');
  return value.result;
 }
 const apps=await read(base);
 const selected=apps.filter(a=>a?.name===APP_NAME&&a?.domain===HOST&&a?.type==='self_hosted');
 if(selected.length!==1||selected[0].aud!==audience||!REFS.test(selected[0].id??''))
   throw Error('Dedicated Admin Access application identity mismatch');
 const app=selected[0];
 const policies=await read(base+'/'+app.id+'/policies');
 if(policies.length!==1||!REFS.test(policies[0]?.id??'')||
    policies[0].decision!=='allow'||policies[0].name!=='Owner email only'||
    !Array.isArray(policies[0].include)||policies[0].include.length!==1||
    !policies[0].include[0]?.email||
    Object.keys(policies[0].include[0]).length!==1||
    Object.keys(policies[0].include[0].email).length!==1||
    policies[0].include[0].email.email!==ownerEmail||
    !Array.isArray(policies[0].exclude)||policies[0].exclude.length!==0||
    !Array.isArray(policies[0].require)||policies[0].require.length!==0||
    !Array.isArray(app.policies)||app.policies.length!==1||
    app.policies[0]?.id!==policies[0].id)
   throw Error('Dedicated Admin Access Owner allow policy unavailable');
 return Object.freeze({appVerified:true,ownerOnlyVerified:true});
}

if(process.argv[1]&&new URL('file://'+process.argv[1].replaceAll('\\','/')).href===import.meta.url){
 try{
  const result=await verifyAdminAccessPolicyV1({
   accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
   apiToken:process.env.CLOUDFLARE_API_TOKEN,
   audience:process.env.MYEONGHA_ADMIN_ACCESS_AUD,
   ownerEmail:process.env.MYEONGHA_ADMIN_OWNER_EMAIL,
  });
  console.log(JSON.stringify(result));
 }catch{
  console.error('Dedicated Admin Access Owner-policy readback failed');
  process.exitCode=2;
 }
}
