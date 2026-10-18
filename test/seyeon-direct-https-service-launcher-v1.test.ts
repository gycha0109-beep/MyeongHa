// Watchtower-Track: security
// Offline executable-preflight tests: no live Subject, AI, Vercel or public bind.
import { execFileSync } from 'node:child_process';
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SEYEON_DIRECT_HTTPS_SERVICE_LAUNCHER_V1,
  SeyeonDirectHttpsLauncherErrorV1,
  prepareSeyeonDirectHttpsLauncherOptionsV1,
} from '../apps/api/src/seyeon-direct-https-service-launcher-v1.js';

const hostname = 'seyeon.local.test';
const approval = {
  reservedHeadroomTokens:64,
  policies:{ preflight:{},interpreter:{},renderer:{},reviewer:{} },
};
let scratch='';
let certFile='',keyFile='',policyFile='';
const argv=['--internal-zero-source-only'];

beforeAll(()=>{
  scratch=mkdtempSync(join(tmpdir(),'myeongha-seyeon-direct-launch-'));
  certFile=join(scratch,'owned-cert.pem');
  keyFile=join(scratch,'owned-key.pem');
  policyFile=join(scratch,'governor.json');
  execFileSync('openssl',[
    'req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1',
    '-keyout',keyFile,'-out',certFile,
    '-subj',`/CN=${hostname}`,
    '-addext',`subjectAltName=DNS:${hostname}`,
  ],{stdio:'ignore'});
  chmodSync(keyFile,0o600);
  writeFileSync(policyFile,JSON.stringify(approval),{mode:0o600});
  chmodSync(policyFile,0o600);
});
afterAll(()=>{
  if(scratch)rmSync(scratch,{recursive:true,force:true});
});

function env():Record<string,string> {
  return {
    MYEONGHA_SEYEON_DIRECT_TLS_CERT_FILE:certFile,
    MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE:keyFile,
    MYEONGHA_SEYEON_GOVERNOR_APPROVAL_FILE:policyFile,
    MYEONGHA_SEYEON_DIRECT_DNS_HOST:hostname,
  };
}

describe('Direct HTTPS Node24 operator launcher (scope/secret isolation)',()=>{
  it('cannot be used as public/proxy server without separate approved host implementation',()=>{
    expect(SEYEON_DIRECT_HTTPS_SERVICE_LAUNCHER_V1).toMatchObject({
      launchArgument:'--internal-zero-source-only',
      bindAddress:'127.0.0.1',
      productionExternalExposureApproved:false,
      automaticPaidActivation:false,
      vercelProxyEnabled:false,
    });
  });

  it('accepts real, in-date matching cert/key and a private governor policy file',()=>{
    const prepared=prepareSeyeonDirectHttpsLauncherOptionsV1({env:env(),args:argv});
    expect(prepared.expectedDnsHost).toBe(hostname);
    expect(prepared.governorApproval).toMatchObject(approval);
    expect(prepared.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(prepared.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(prepared.env.MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE).toBe(keyFile);
  });

  it.each([
    [],
    ['--public'],
    ['--internal-zero-source-only','--public'],
    ['--vercel-proxy'],
  ])('rejects non-internal launch args before reading secrets (%j)',args=>{
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:{},args}))
      .toThrow(SeyeonDirectHttpsLauncherErrorV1);
  });

  it('rejects missing, relative or mismatched TLS material',()=>{
    const missing=env();delete missing.MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:missing,args:argv}))
      .toThrow('Missing or invalid');
    const relative=env();relative.MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE='./relative-key.pem';
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:relative,args:argv}))
      .toThrow('absolute file');
    const wrong=env();wrong.MYEONGHA_SEYEON_DIRECT_DNS_HOST='unexpected.local.test';
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:wrong,args:argv}))
      .toThrow('certificate, private key or DNS');
  });

  it('rejects symlinked keys and policies before any data is read',()=>{
    const keyLink=join(scratch,'key-link');
    const policyLink=join(scratch,'policy-link');
    symlinkSync(keyFile,keyLink);
    symlinkSync(policyFile,policyLink);
    const badKey=env();badKey.MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE=keyLink;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:badKey,args:argv}))
      .toThrow('symbolic links');
    const badPolicy=env();badPolicy.MYEONGHA_SEYEON_GOVERNOR_APPROVAL_FILE=policyLink;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:badPolicy,args:argv}))
      .toThrow('valid JSON');
  });

  it.skipIf(process.platform==='win32')('rejects group/world-readable private key and governor approval files',()=>{
    const looseKey=join(scratch,'insecure.key');
    writeFileSync(looseKey,readFileSync(keyFile),{mode:0o644});
    chmodSync(looseKey,0o644);
    const badKey=env();badKey.MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE=looseKey;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:badKey,args:argv}))
      .toThrow('unprotected or oversized');
    const loosePolicy=join(scratch,'insecure.json');
    writeFileSync(loosePolicy,JSON.stringify(approval),{mode:0o644});
    chmodSync(loosePolicy,0o644);
    const badPolicy=env();badPolicy.MYEONGHA_SEYEON_GOVERNOR_APPROVAL_FILE=loosePolicy;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:badPolicy,args:argv}))
      .toThrow('valid JSON');
  });

  it('rejects malformed protected governor policy without binding a socket',()=>{
    const broken=join(scratch,'broken.json');
    writeFileSync(broken,'{broken',{mode:0o600});
    const config=env();config.MYEONGHA_SEYEON_GOVERNOR_APPROVAL_FILE=broken;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:config,args:argv}))
      .toThrow('valid JSON');
  });

  it('rejects any attempt to use an expired, unrelated or untrusted certificate pair',()=>{
    const secondCert=join(scratch,'second-cert.pem');
    const secondKey=join(scratch,'second-key.pem');
    execFileSync('openssl',[
      'req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1',
      '-keyout',secondKey,'-out',secondCert,
      '-subj',`/CN=${hostname}`,'-addext',`subjectAltName=DNS:${hostname}`,
    ],{stdio:'ignore'});
    chmodSync(secondKey,0o600);
    const forged=env();forged.MYEONGHA_SEYEON_DIRECT_TLS_KEY_FILE=secondKey;
    expect(()=>prepareSeyeonDirectHttpsLauncherOptionsV1({env:forged,args:argv}))
      .toThrow('certificate, private key or DNS');
  });
});
