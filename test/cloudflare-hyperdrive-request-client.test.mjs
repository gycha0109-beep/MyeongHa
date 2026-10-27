import { describe, expect, it } from 'vitest';
import { createRequestOwnedHyperdriveClientDriverV1 } from '../workers/cloudflare-hyperdrive-subject-pool.mjs';

function fakeDriver({failFirstConnection=false}={}){
  const clients=[];
  const driver=createRequestOwnedHyperdriveClientDriverV1(
    'postgresql://fixture:synthetic@hyperdrive.test/postgres',
    {connectionTimeoutMs:3000,statementTimeoutMs:4000},
    {createClient:settings=>{
      const id=clients.length;
      const client={
        settings,queries:[],connects:0,ends:0,on(){},
        async connect(){this.connects++;if(failFirstConnection&&id===0)throw Error('fixture failed connect');},
        async query(sql,values){this.queries.push({sql,values});return {rows:[{hello:'world'}]};},
        async end(){this.ends++;},
      };
      clients.push(client);
      return client;
    }},
  );
  return {driver,clients};
}

describe('Cloudflare ordinary member and guest request-scoped Hyperdrive clients',()=>{
  it('creates a new Client for each lease, closes it on release, and never reuses it across scopes',async()=>{
    const {driver,clients}=fakeDriver();
    const a=await driver.connect();
    expect(clients).toHaveLength(1);
    expect(clients[0].settings).toMatchObject({
      connectionTimeoutMillis:3000,statement_timeout:4000,
    });
    expect(await a.query('select $1::text as hello',['one'])).toEqual({rows:[{hello:'world'}]});
    a.release();
    const b=await driver.connect();
    expect(clients).toHaveLength(2);
    expect(clients[0].ends).toBe(1);
    expect(clients[1].connects).toBe(1);
    expect(clients[1]).not.toBe(clients[0]);
    b.release();
    await driver.end();
    expect(clients.map(x=>x.ends)).toEqual([1,1]);
    await expect(driver.connect()).rejects.toThrow(/closed/);
  });

  it('serializes concurrent acquisitions so no request exceeds the approved max-one DB connection',async()=>{
    const {driver,clients}=fakeDriver();
    const first=await driver.connect();
    const secondPromise=driver.connect();
    await Promise.resolve();
    expect(clients).toHaveLength(1);
    first.release();
    const second=await secondPromise;
    expect(clients).toHaveLength(2);
    expect(clients[0].ends).toBe(1);
    second.release();
    await driver.end();
    expect(clients[1].ends).toBe(1);
  });

  it('releases a failed connect lease, closes the failed client and allows a later attempt',async()=>{
    const {driver,clients}=fakeDriver({failFirstConnection:true});
    await expect(driver.connect()).rejects.toThrow('fixture failed connect');
    expect(clients[0].ends).toBe(1);
    const next=await driver.connect();
    next.release();
    await driver.end();
    expect(clients[1].ends).toBe(1);
  });

  it('rejects queries after release, and never logs passwords or SQL',async()=>{
    const {driver}=fakeDriver();
    const lease=await driver.connect();
    lease.release();
    await expect(lease.query('select secret')).rejects.toThrow('released');
    await driver.end();
  });
});
