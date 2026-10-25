// Watchtower-Track: security
// Actual TCP -> PostgreSQL-style SSLRequest -> TLS, no remote DB/Provider.
import{mkdtempSync,readFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join,resolve,sep}from'node:path';
import{execFileSync}from'node:child_process';
import{createServer}from'node:net';
import{createSecureContext,TLSSocket}from'node:tls';
import{describe,it,expect}from'vitest';
import{CloudflareSocket}from'../cloudflare/postgres-native-socket.mjs';

describe('PostgreSQL native TLS socket adapter',()=>{
  it('authenticates its CA/hostname and rejects the wrong hostname or absent verification',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'myeongha-s0-tls-'));
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
      '-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-subj','/CN=localhost',
      '-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
    const cert=readFileSync(join(dir,'cert.pem'),'utf8');
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
      '-keyout',join(dir,'other-key.pem'),'-out',join(dir,'other-cert.pem'),'-subj','/CN=other-root'],{stdio:'ignore'});
    const otherCert=readFileSync(join(dir,'other-cert.pem'),'utf8');
    const context=createSecureContext({key:readFileSync(join(dir,'key.pem')),cert});
    const server=createServer(raw=>{
      raw.once('data',packet=>{
        expect(packet.equals(Buffer.from([0,0,0,8,4,210,22,47]))).toBe(true);
        raw.write('S');
        const socket=new TLSSocket(raw,{isServer:true,secureContext:context});
        socket.on('error',()=>{});
        socket.on('data',value=>socket.write(value));
      });
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;
    async function probe(overrides={}){
      return new Promise(resolve=>{
        const socket=new CloudflareSocket(true);
        const timer=setTimeout(()=>{socket.destroy();resolve('timeout');},3000);
        const finish=value=>{clearTimeout(timer);socket.destroy();resolve(value);};
        socket.on('error',()=>finish('denied'));
        socket.once('connect',()=>socket.write(Buffer.from([0,0,0,8,4,210,22,47])));
        socket.once('data',sslReply=>{
          expect(String(sslReply)).toBe('S');
          socket.startTls({socket,ca:cert,rejectUnauthorized:true,servername:'localhost',...overrides});
          socket.once('secureConnect',()=>{
            expect(socket.authorized).toBe(true);
            socket.once('data',value=>finish(String(value)));socket.write('authenticated');
          });
        });
        socket.connect(port,'127.0.0.1');
      });
    }
    try{
      expect(await probe()).toBe('authenticated');
      expect(await probe({servername:'wrong-host.invalid'})).toBe('denied');
      expect(await probe({ca:otherCert})).toBe('denied');
      expect(await probe({rejectUnauthorized:false})).toBe('denied');
      expect(await probe({ca:''})).toBe('denied');
    }finally{
      await new Promise(resolve=>server.close(resolve));
      if(!resolve(dir).startsWith(resolve(tmpdir())+sep+'myeongha-s0-tls-'))throw Error('Unsafe fixture cleanup target');
      rmSync(dir,{recursive:true});
    }
  });
});
