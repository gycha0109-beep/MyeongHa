/**
 * TEST SUPPORT ONLY: isolated Linux/POSIX file-backed durable watermark.
 *
 * Never import into API production code. This intentionally demonstrates
 * restart persistence, fsync+atomic rename, fail-closed missing/corrupt data
 * and cross-instance serialized compare/update through atomic mkdir lock.
 *
 * IMPORTANT: a local filesystem controlled by the SAME user as an executor
 * cannot be an independent trust authority: that user can delete, replace or
 * restore the file and may re-seed it. No real nonrollbackable storage,
 * trusted remote state, OS identity, network authentication or DB GRANT exists.
 *
 * On any lock collision, corruption, IO failure, crash-left lock or missing
 * file, operations deny. No stale-lock recovery/bypass is implemented.
 */
import {
  closeSync,existsSync,fsyncSync,mkdirSync,openSync,
  readFileSync,renameSync,rmdirSync,unlinkSync,writeFileSync,
} from 'node:fs';
import {dirname} from 'node:path';
import type {
  PrivateCancelVerifiedEpochV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-execution-epoch-v1.js';
import {
  comparePrivateCancelDurableEpochV1,
  isPrivateCancelDurableEpochRecordV1,
  seedPrivateCancelDurableEpochRecordV1,
  type PrivateCancelDurableEpochRecordV1,
  type PrivateCancelDurableEpochWatermarkPortV1,
} from '../../apps/api/src/official-reader-portone-cancel-private-durable-epoch-watermark-v1.js';

function atomicWrite(path:string,record:PrivateCancelDurableEpochRecordV1):void{
  const tmp=path+'.write-pending';
  let fd:number|undefined;
  try{
    fd=openSync(tmp,'wx',0o600);
    writeFileSync(fd,JSON.stringify(record)+'\n','utf8');
    fsyncSync(fd);closeSync(fd);fd=undefined;
    renameSync(tmp,path);
    // Durable metadata commit on POSIX; a failure is never considered success.
    const dir=openSync(dirname(path),'r');
    try{fsyncSync(dir)}finally{closeSync(dir)}
  }catch(error){
    if(fd!==undefined)closeSync(fd);
    if(existsSync(tmp)){try{unlinkSync(tmp)}catch{/* fail closed */}}
    throw error;
  }
}
export function seedIsolatedTestEpochWatermarkV1(
  path:string,verified:PrivateCancelVerifiedEpochV1,
):void{
  const record=seedPrivateCancelDurableEpochRecordV1(verified);
  const dir=dirname(path);
  if(!existsSync(dir))throw new Error('Test watermark directory not independently pre-provisioned.');
  // The issuer/owner MUST provision this before executor starts, once.
  if(existsSync(path)||existsSync(path+'.lock')){
    throw new Error('Test watermark state already provisioned: cannot re-seed.');
  }
  mkdirSync(path+'.lock',0o700);
  try{
    if(existsSync(path))throw new Error('Test watermark seed exists.');
    atomicWrite(path,record);
  }finally{
    rmdirSync(path+'.lock');
  }
}

export function makeIsolatedFileEpochWatermarkV1(
  path:string,
):PrivateCancelDurableEpochWatermarkPortV1{
  if(typeof path!=='string'||!path.startsWith('/')
    ||path.includes('\0')){
    throw new Error('Test watermark requires one pre-provisioned absolute path.');
  }
  return Object.freeze({
    async observeVerifiedEpoch(epoch:PrivateCancelVerifiedEpochV1):Promise<void>{
      // A shared filesystem lock serializes independent test instances.
      // No waiting: contention is a temporary DENY rather than fail-open.
      try{
        mkdirSync(path+'.lock',0o700);
      }catch{
        throw new Error('Test durable epoch is locked or unavailable.');
      }
      try{
        const bytes=readFileSync(path,'utf8');
        if(bytes.length>4096){
          throw new Error('Test durable epoch record exceeded size bound.');
        }
        const previous:unknown=JSON.parse(bytes);
        if(!isPrivateCancelDurableEpochRecordV1(previous)){
          throw new Error('Test durable epoch missing or corrupted.');
        }
        const decision=comparePrivateCancelDurableEpochV1(previous,epoch);
        if(decision.nextRecord!==previous){
          atomicWrite(path,decision.nextRecord);
        }
        if(!decision.allowed){
          throw new Error('Test durable epoch rejected '+decision.reason);
        }
      }finally{
        // If a crash terminates before this point, the lock remains.
        // A failed/uncertain release also denies future calls.
        rmdirSync(path+'.lock');
      }
    },
  });
}
