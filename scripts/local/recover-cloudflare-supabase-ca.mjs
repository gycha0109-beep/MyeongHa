#!/usr/bin/env node
// Read-only TLS certificate recovery for MyeongHa's pinned Supabase root.
// No authentication, PostgreSQL query, DB password or external data writes.
// Watchtower-Track: ops
import net from 'node:net';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const SUPABASE_POOLER = /^aws-[0-9]+-ap-southeast-1\.pooler\.supabase\.com$/;
const FINGERPRINT = /PRODUCTION_POSTGRES_TLS_ROOT_FINGERPRINT256_V1\s*=\s*'((?:[A-F0-9]{2}:){31}[A-F0-9]{2})'/;

export function approvedSupabaseCaTargetV1(host,port) {
  return typeof host === 'string' && SUPABASE_POOLER.test(host) &&
    (port === 5432 || port === 6543);
}

export function extractPinnedSupabaseRootCaV1(peer,host,expectedFingerprint,now=new Date()) {
  if (!peer?.raw || typeof expectedFingerprint !== 'string') throw Error('Missing TLS peer or root authority');
  if (tls.checkServerIdentity(host,peer) !== undefined) throw Error('Supabase certificate hostname mismatch');
  const nodes=[];
  let cursor=peer;
  const seen=new Set();
  while (cursor?.raw && nodes.length < 8 && !seen.has(cursor.fingerprint256)) {
    nodes.push(new X509Certificate(cursor.raw));
    seen.add(cursor.fingerprint256);
    cursor=cursor.issuerCertificate;
  }
  if (nodes.length < 2) throw Error('Incomplete Supabase TLS certificate chain');
  for(const cert of nodes){
    if (Date.parse(cert.validFrom) > now.getTime() || Date.parse(cert.validTo) < now.getTime()) {
      throw Error('Expired or future Supabase TLS certificate');
    }
  }
  for(let i=0;i<nodes.length-1;i++){
    if (!nodes[i].verify(nodes[i+1].publicKey)) throw Error('Supabase certificate signature invalid');
    if (i>0 && !nodes[i].ca) throw Error('Supabase intermediate is not a CA');
  }
  const root=nodes.at(-1);
  if (!root.ca || root.fingerprint256 !== expectedFingerprint ||
      !root.verify(root.publicKey) || root.subject !== root.issuer) {
    throw Error('Supabase root CA fingerprint or chain authority mismatch');
  }
  return root.toString();
}

async function readServerPeer(host,port) {
  return new Promise((resolvePeer,rejectPeer)=>{
    const plain=net.connect({host,port});
    let done=false;
    const finish=(error,peer)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      try{plain.destroy();}catch{}
      if(error)rejectPeer(error);else resolvePeer(peer);
    };
    const timer=setTimeout(()=>finish(Error('Supabase certificate handshake timeout')),10_000);
    plain.once('error',()=>finish(Error('Supabase certificate TCP connection failed')));
    plain.once('connect',()=>{
      const sslRequest=Buffer.alloc(8);
      sslRequest.writeUInt32BE(8,0);
      sslRequest.writeUInt32BE(80877103,4);
      plain.write(sslRequest);
      plain.once('data',answer=>{
        if(answer[0]!==83){finish(Error('Supabase PostgreSQL SSL refused'));return;}
        plain.removeAllListeners('error');
        const secure=tls.connect({socket:plain,servername:host,rejectUnauthorized:false},()=>{
          // The insecurely sampled peer is NEVER trusted or reused.
          // The caller verifies hostname, expiry, signature chain and pinned
          // root fingerprint before accepting or saving any certificate.
          const cert=secure.getPeerCertificate(true);
          finish(null,cert);
        });
        secure.once('error',()=>finish(Error('Supabase TLS handshake failed')));
      });
    });
  });
}

async function main(){
  const args=process.argv.slice(2);
  if(args.length!==4 || args[0]!=='--host' || args[2]!=='--output'){
    throw Error('Usage: --host aws-0-ap-southeast-1.pooler.supabase.com --output ABSOLUTE_FILE_OUTSIDE_REPO');
  }
  const host=args[1],dest=resolve(args[3]);
  if(!approvedSupabaseCaTargetV1(host,5432))throw Error('Unexpected Supabase host');
  const repo=process.cwd(), rel=relative(repo,dest);
  if(rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'))throw Error('CA output must be outside Git repository');
  const source=await readFile(resolve(repo,'apps/api/src/production-postgres-tls-peer-verification.ts'),'utf8');
  const fingerprint=FINGERPRINT.exec(source)?.[1];
  if(!fingerprint)throw Error('Pinned DB root fingerprint not found');
  const peer=await readServerPeer(host,5432);
  const rootPem=extractPinnedSupabaseRootCaV1(peer,host,fingerprint);
  await writeFile(dest,rootPem,{flag:'wx',mode:0o600});
  console.log('MyeongHa pinned Supabase root CA recovered and verified: '+fingerprint);
  console.log('Root CA saved outside repository: '+dest);
}

if(import.meta.url===new URL('file://'+process.argv[1]?.replaceAll('\\','/')).href){
  main().catch(error=>{console.error('Supabase CA recovery failed: '+error.message);process.exitCode=1;});
}


[executed on device: DESKTOP-6C3L8O4 (ce2df589-e94f-48db-9209-150790d2734e)]