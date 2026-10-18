import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  inspectPublicRouteExposure,
} from './official-reader-minimal-public-route-fence.mjs';

function fixture(files={},rewrites=[]) {
  const root=mkdtempSync(join(tmpdir(),'myeongha-m130-route-'));
  const all={
    'api/entry.ts':"import '../apps/api/src/safe.js';\nexport default { fetch(){} };\n",
    'apps/api/src/safe.ts':"export const safe=true;\n",
    'vercel.json':JSON.stringify({rewrites}),
    ...files,
  };
  for(const [path,source] of Object.entries(all)){
    const full=join(root,path);
    mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,source);
  }
  return {root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function scoped(files,rewrites,check) {
  const f=fixture(files,rewrites);
  try{check(inspectPublicRouteExposure(f.root));}
  finally{f.cleanup()}
}
test('M1-30 current checked-in public API entrypoints have no transitive internal Reader minimal read import',()=>{
  const report=inspectPublicRouteExposure();
  assert.ok(report.routes.length>=12);
  assert.ok(report.inspectedModules>=report.routes.length);
  assert.deepEqual(report.issues,[]);
});
test('allows a first-party static API chain and checked-in Vercel rewrite destination',()=>{
  scoped({},[{source:'/api/proxy',destination:'/api/entry?flag=1'}],report=>{
    assert.deepEqual(report.issues,[]);
    assert.equal(report.routes.length,1);
    assert.equal(report.inspectedModules,2);
  });
});
test('rejects direct import of the protected Reader SQL transaction from a public function',()=>{
  scoped({
    'api/entry.ts':
      "import '../apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.js';",
    'apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.ts':'export const privateRead=true;',
  },[],report=>{
    assert.ok(report.issues.some(x=>x.kind==='protected-reader-reachable'));
    assert.ok(report.issues.some(x=>x.detail.includes('api/entry.ts -> apps/api/src/postgres-official-reader')));
  });
});
test('rejects transitive re-export of internal Reader observation from a public handler',()=>{
  scoped({
    'apps/api/src/safe.ts':"export * from './official-reader-unknown-commit-minimal-v1.js';",
    'apps/api/src/official-reader-unknown-commit-minimal-v1.ts':'export const privateRead=true;',
  },[],report=>{
    assert.ok(report.issues.some(x=>x.kind==='protected-reader-reachable'));
    assert.ok(report.issues.some(x=>x.detail.includes('apps/api/src/safe.ts -> apps/api/src/official-reader')));
  });
});
test('rejects dynamically computed imports and unresolved first-party imports, not blindly allowing them',()=>{
  scoped({
    'apps/api/src/safe.ts':"const dependency='reader'; import(dependency);",
  },[],report=>{
    assert.ok(report.issues.some(x=>x.kind==='dynamic-import-unresolved'));
  });
  scoped({
    'apps/api/src/safe.ts':"import '@myeongha/not-a-workspace';",
  },[],report=>{
    assert.ok(report.issues.some(x=>x.kind==='unresolved-import'));
  });
});
test('rejects a Vercel rewrite that maps to a nonexistent function (not a silently omitted route)',()=>{
  scoped({},[{source:'/api/reader',destination:'/api/reader?receiptId=:receiptId'}],report=>{
    assert.ok(report.issues.some(x=>x.kind==='rewrite-unchecked'));
  });
});
