// Watchtower-Track: security
// pg-cloudflare compatibility surface backed by actual node:tls. Its generic
// cloudflare:sockets startTls path cannot establish our explicit-CA contract.
import {Duplex} from 'node:stream';
import {Socket} from 'node:net';
import {connect as connectTls} from 'node:tls';

export class CloudflareSocket extends Duplex{
  constructor(ssl){
    super();
    if(!ssl)throw Error('PostgreSQL requires strict TLS');
    this.transport=new Socket();
    this.upgraded=false;
    this.forwardData=chunk=>{if(!this.push(chunk))this.transport.pause();};
    this.forwardEnd=()=>this.push(null);
    this.forwardError=()=>this.destroy(Error('PostgreSQL socket failed'));
    this.forwardClose=()=>{if(!this.destroyed)this.destroy();};
    this.attach(this.transport);
  }
  attach(socket){
    socket.on('data',this.forwardData);
    socket.on('end',this.forwardEnd);
    socket.on('error',this.forwardError);
    socket.on('close',this.forwardClose);
  }
  detach(socket){
    socket.off('data',this.forwardData);socket.off('end',this.forwardEnd);
    socket.off('error',this.forwardError);socket.off('close',this.forwardClose);
  }
  connect(port,host){
    this.transport.once('connect',()=>this.emit('connect'));
    this.transport.connect(port,host);return this;
  }
  startTls(options){
    if(this.upgraded||options?.rejectUnauthorized!==true||
       typeof options.ca!=='string'||!options.ca.includes('-----BEGIN CERTIFICATE-----')||
       typeof options.servername!=='string'||options.servername===''){
      this.destroy(Error('PostgreSQL strict TLS authority unavailable'));return;
    }
    this.upgraded=true;
    const plain=this.transport;
    this.detach(plain);
    try{
      this.transport=connectTls({...options,socket:plain,rejectUnauthorized:true});
      this.attach(this.transport);
      this.transport.once('secureConnect',()=>{
        if(this.transport.authorized!==true){
          this.destroy(Error('PostgreSQL TLS peer not verified'));return;
        }
        this.emit('secureConnect');
      });
    }catch{
      plain.destroy();this.destroy(Error('PostgreSQL TLS setup failed'));
    }
  }
  _read(){this.transport.resume();}
  _write(chunk,encoding,callback){this.transport.write(chunk,encoding,callback);}
  _final(callback){this.transport.end(callback);}
  _destroy(error,callback){this.transport.destroy();callback(error);}
  setNoDelay(value){this.transport.setNoDelay(value);return this;}
  setKeepAlive(value,delay){this.transport.setKeepAlive(value,delay);return this;}
  ref(){this.transport.ref();return this;}
  unref(){this.transport.unref();return this;}
  get encrypted(){return this.upgraded;}
  get authorized(){return this.transport.authorized===true;}
  get authorizationError(){return this.transport.authorizationError;}
  getPeerCertificate(...args){return this.transport.getPeerCertificate?.(...args);}
}
