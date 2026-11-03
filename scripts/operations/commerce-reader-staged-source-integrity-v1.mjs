// Watchtower-Track: commerce-payment
// Attests the existing 59-file reviewed staged Reader SQL catalog in place.
// It never executes SQL, mutates Git, or creates a new migration.
import {createHash} from 'node:crypto';
import {readFile as readFileDefault} from 'node:fs/promises';
import {COMMERCE_READER_EXPECTED_STAGED_VERSIONS_V1 as VERSIONS} from
  './commerce-reader-production-rollout-evidence-v1.mjs';

const MANIFEST=new URL('../../test/db/official_reader_staged_migration_hashes_v1.txt',import.meta.url);
const DIR=new URL('../../supabase/migrations/',import.meta.url);
const SQL_NAME=/^([0-9]{4})_([a-z][a-z0-9_]+)\.sql$/u;
const SHA1=/^[0-9a-f]{40}$/u;

function gitBlobHash(bytes){
  return createHash('sha1')
    .update('blob '+bytes.length+'\0')
    .update(bytes)
    .digest('hex');
}

function matchesReviewedGitBlob(bytes,expected){
  if(gitBlobHash(bytes)===expected)return true;
  // Git's Windows text filter stores LF even when a checkout contains CRLF.
  // Check the canonical source bytes without modifying executable SQL.
  try{
    const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!source.includes('\r\n'))return false;
    return gitBlobHash(Buffer.from(source.replace(/\r\n/gu,'\n'),'utf8'))===expected;
  }catch{return false;}
}

export async function inspectCommerceReaderStagedSqlIntegrityV1({
  readFile=readFileDefault,
}={}){
  if(typeof readFile!=='function')
    throw Error('READER_STAGED_SOURCE_READER_REQUIRED');
  let data;
  try{data=await readFile(MANIFEST);}catch{
    throw Error('READER_STAGED_MANIFEST_UNAVAILABLE');
  }
  if(!Buffer.isBuffer(data)||data.length>16_384||data.length<200)
    throw Error('READER_STAGED_MANIFEST_INVALID');
  const rows=data.toString('utf8').split(/\r?\n/u)
    .map(x=>x.trim()).filter(x=>x!==''&&!x.startsWith('#'));
  if(rows.length!==VERSIONS.length)
    throw Error('READER_STAGED_MANIFEST_INCOMPLETE');
  const map=new Map();
  for(const line of rows){
    const parts=line.split(/\s+/u);
    const match=parts.length===2?SQL_NAME.exec(parts[0]):null;
    if(!match||!SHA1.test(parts[1])||map.has(match[1])
      ||!VERSIONS.includes(match[1]))
      throw Error('READER_STAGED_MANIFEST_UNTRUSTED');
    map.set(match[1],{filename:parts[0],sha:parts[1]});
  }
  for(const version of VERSIONS){
    const item=map.get(version);
    if(!item)throw Error('READER_STAGED_MANIFEST_UNTRUSTED');
    let sql;
    try{sql=await readFile(new URL(item.filename,DIR));}catch{
      throw Error('READER_STAGED_SQL_UNAVAILABLE');
    }
    if(!Buffer.isBuffer(sql)||sql.length===0||sql.length>1_048_576
      ||!matchesReviewedGitBlob(sql,item.sha))
      throw Error('READER_STAGED_SQL_HASH_MISMATCH');
  }
  return Object.freeze({
    schemaVersion:'commerce-reader-staged-source-integrity-v1',
    state:'exact_staged_sources_observed',
    reviewedMigrationCount:VERSIONS.length,
    versions:Object.freeze([...VERSIONS]),
    allGitBlobsMatchManifest:true,
    productionMigrationAuthorized:false,
    paidReaderDeliveryAuthorized:false,
    customerRefundAuthorized:false,
    liveAuthorized:false,
    writesPerformed:false,
  });
}
