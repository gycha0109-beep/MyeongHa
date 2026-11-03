import {describe,it,expect} from 'vitest';
import {readFile as read} from 'node:fs/promises';
import {inspectCommerceReaderStagedSqlIntegrityV1 as inspect} from
  '../scripts/operations/commerce-reader-staged-source-integrity-v1.mjs';
const manifest=new URL('../test/db/official_reader_staged_migration_hashes_v1.txt',import.meta.url);
async function original(){return read(manifest);}

describe('Reader staged migration Git blob contract before any DB connection',()=>{
  it('checks all 59 real source migrations against their reviewed manifest',async()=>{
    const r=await inspect();
    expect(r).toMatchObject({
      state:'exact_staged_sources_observed',reviewedMigrationCount:59,
      allGitBlobsMatchManifest:true,
      productionMigrationAuthorized:false,
      paidReaderDeliveryAuthorized:false,
      customerRefundAuthorized:false,
      liveAuthorized:false,writesPerformed:false,
    });
    expect(r.versions[0]).toBe('1740');
    expect(r.versions.at(-1)).toBe('2320');
    expect(new Set(r.versions).size).toBe(59);
  });
  it('rejects a manifest with fewer than 59 rows',async()=>{
    const initial=(await original()).toString('utf8');
    const rows=initial.split(/\r?\n/);
    rows.splice(2,1);
    const altered=Buffer.from(rows.join('\n'));
    await expect(inspect({
      readFile:async url=>url.href===manifest.href?altered:read(url),
    })).rejects.toThrow('READER_STAGED_MANIFEST_INCOMPLETE');
  });
  it('rejects duplicated source versions and paths in the manifest',async()=>{
    const initial=(await original()).toString('utf8');
    const rows=initial.split(/\r?\n/);
    rows[2]=rows[1];
    await expect(inspect({
      readFile:async url=>url.href===manifest.href?
        Buffer.from(rows.join('\n')):read(url),
    })).rejects.toThrow('READER_STAGED_MANIFEST_UNTRUSTED');
  });
  it('rejects path traversal or nonreviewed migrations before opening SQL',async()=>{
    const initial=(await original()).toString('utf8');
    const rows=initial.split(/\r?\n/);
    rows[1]=rows[1].replace(/^1740_[^ ]+/u,'../../sensitive.sql');
    await expect(inspect({
      readFile:async url=>url.href===manifest.href?
        Buffer.from(rows.join('\n')):read(url),
    })).rejects.toThrow('READER_STAGED_MANIFEST_UNTRUSTED');
  });
  it('rejects even a one-byte staged migration source change',async()=>{
    let modified=false;
    await expect(inspect({
      readFile:async url=>{
        const b=await read(url);
        if(url.pathname.endsWith('1740_official_reader_scope_lock_private_v1.sql')){
          modified=true;
          return Buffer.concat([b,Buffer.from(' ')]);
        }
        return b;
      },
    })).rejects.toThrow('READER_STAGED_SQL_HASH_MISMATCH');
    expect(modified).toBe(true);
  });
  it('fails closed on inaccessible manifest without exposing filesystem details',async()=>{
    await expect(inspect({readFile:async()=>{throw Error('private path: C:/secret');}}))
      .rejects.toThrow('READER_STAGED_MANIFEST_UNAVAILABLE');
  });
  it('rejects invalid non-buffer manifest input',async()=>{
    await expect(inspect({readFile:async()=> 'fake manifest'}))
      .rejects.toThrow('READER_STAGED_MANIFEST_INVALID');
  });
  it('rejects an unavailable migration source before any launch approval',async()=>{
    await expect(inspect({readFile:async url=>{
      if(url.href===manifest.href)return original();
      throw Error('my private path / secret');
    }})).rejects.toThrow('READER_STAGED_SQL_UNAVAILABLE');
  });
});
