import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { inspectPublicRouteExposure } from '../../../scripts/ci/official-reader-minimal-public-route-fence.mjs';

// Runs in the actual Commerce work-track Vitest selection, even when package
// npm test's separate node:test phase is not selected by run-track-tests.
function fixture(overrides={}, rewrites=[]) {
  const root=mkdtempSync(join(tmpdir(),'myeongha-m130-vitest-'));
  for(const [name,body] of Object.entries({
    'api/entry.ts':"import '../apps/api/src/safe.js'; export default {};",
    'apps/api/src/safe.ts':"export const safe=true;",
    'vercel.json':JSON.stringify({rewrites}),
    ...overrides,
  })){
    const full=join(root,name);
    mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,body);
  }
  return {root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function withFixture(overrides,rewrites,verify){
  const x=fixture(overrides,rewrites);
  try{verify(inspectPublicRouteExposure(x.root));}
  finally{x.cleanup()}
}

describe('M1-30 checked-in public Reader minimal route source-reachability CI gate',()=>{
  it('audits every checked-in Vercel API entrypoint and finds zero protected Reader paths',()=>{
    const actual=inspectPublicRouteExposure();
    expect(actual.routes.length).toBeGreaterThanOrEqual(12);
    expect(actual.inspectedModules).toBeGreaterThanOrEqual(actual.routes.length);
    expect(actual.issues).toEqual([]);
  });
  it('permits one fully static safe route and checked-in Vercel rewrite target',()=>{
    withFixture({},[{source:'/api/proxy',destination:'/api/entry?flag=1'}],x=>{
      expect(x.issues).toEqual([]);
      expect(x.inspectedModules).toBe(2);
    });
  });
  it('blocks a direct public handler dependency on the internal Reader transaction adapter',()=>{
    withFixture({
      'api/entry.ts':"import '../apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.js';",
      'apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.ts':'export const restricted=1;',
    },[],x=>{
      expect(x.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({kind:'protected-reader-reachable'}),
      ]));
    });
  });
  it('blocks a transitive re-export of the internal minimal Reader query',()=>{
    withFixture({
      'apps/api/src/safe.ts':"export * from './official-reader-unknown-commit-minimal-v1.js';",
      'apps/api/src/official-reader-unknown-commit-minimal-v1.ts':'export const restricted=1;',
    },[],x=>{
      expect(x.issues.some(v=>v.kind==='protected-reader-reachable')).toBe(true);
    });
  });
  it('fails closed for dynamically computed imports',()=>{
    withFixture({'apps/api/src/safe.ts':"const p='somewhere'; void import(p);"},[],x=>{
      expect(x.issues.some(v=>v.kind==='dynamic-import-unresolved')).toBe(true);
    });
  });
  it('fails closed for unreviewed Vercel rewrites',()=>{
    withFixture({},[{source:'/api/reader',destination:'/api/missing-reader-route'}],x=>{
      expect(x.issues.some(v=>v.kind==='rewrite-unchecked')).toBe(true);
    });
  });
});
