// Watchtower-Track: security
// The same atomic source assembly is used by scratch/restore and managed apply.
import{readFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{SEYEON_SECURITY_S0_SQL_SOURCES}from'./plan.mjs';

export async function buildSeyeonSecurityS0InstallationBundle(){
  const files=[];
  for(const source of SEYEON_SECURITY_S0_SQL_SOURCES){
    const text=(await readFile(new URL(source,import.meta.url),'utf8')).replace(/\r\n/gu,'\n');
    if((text.match(/^begin;$/gmu)??[]).length!==1||
       (text.match(/^commit;$/gmu)??[]).length!==1||!/^commit;\s*$/mu.test(text.split('\n').slice(-3).join('\n'))){
      throw Error('S0 source transaction envelope changed: '+source);
    }
    const sha256=createHash('sha256').update(text,'utf8').digest('hex');
    files.push({source,sha256,sql:text.replace(/^begin;\n/mu,'').replace(/\ncommit;\s*$/u,'')});
  }
  const sql="-- Watchtower-Track: security\n-- Atomic S0 receipt runtime, default CLOSED.\n"+
    "set local lock_timeout='5s';\nset local statement_timeout='60s';\n"+
    files.map(f=>`-- SOURCE ${f.source} LF-SHA256 ${f.sha256}\n${f.sql}\n`).join('\n');
  return Object.freeze({sql,sha256LfUtf8:createHash('sha256').update(sql,'utf8').digest('hex'),
    bytesLfUtf8:Buffer.byteLength(sql,'utf8'),files:files.map(({source,sha256})=>({source,sha256}))});
}
