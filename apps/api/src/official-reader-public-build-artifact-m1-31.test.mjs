import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  inspectReaderPublicBuildOutput,
} from '../../../scripts/ci/official-reader-public-build-output-fence.mjs';

function fixture(files,fn){
  const root=mkdtempSync(join(tmpdir(),'myeongha-m131-built-output-'));
  try{
    for(const [name,body] of Object.entries(files)){
      const full=join(root,'public',name);
      mkdirSync(dirname(full),{recursive:true});
      writeFileSync(full,body);
    }
    fn(root);
  }finally{rmSync(root,{recursive:true,force:true})}
}
describe('M1-31 compiled-browser-artifact safety gate (not Vercel serverless output)',()=>{
  it('inspects compiled-looking static asset bytes and returns only a deterministic file hash inventory',()=>{
    fixture({'index.html':'<!doctype html><script src="/assets/browser-HASH.js"></script>',
      'assets/browser-HASH.js':"console.log('public');",
      'styles.css':'body{}',
    },root=>{
      const a=inspectReaderPublicBuildOutput({root});
      const b=inspectReaderPublicBuildOutput({root});
      expect(a.issues).toEqual([]);
      expect(a.files).toBe(3);
      expect(a.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(a.digest).toBe(b.digest);
      expect(a.manifest.every(x=>/^[a-f0-9]{64}$/.test(x.sha256))).toBe(true);
    });
  });
  it('rejects Reader minimal SQL/function fingerprints inside minified web JS',()=>{
    fixture({'index.html':'home',
      'assets/app.js':'(()=>{const x="qry_official_reader_unknown_commit_minimal_v1";return x})()',
    },root=>{
      expect(inspectReaderPublicBuildOutput({root}).issues)
        .toEqual(expect.arrayContaining([
          expect.objectContaining({code:'reader-internal-payload-leak'}),
        ]));
    });
  });
  it('rejects private Writer SQL identifiers in web assets',()=>{
    fixture({'index.html':'home',
      'assets/chunk.js':"console.log('public.internal_apply_official_reader_unified_receipt_v1')",
    },root=>{
      expect(inspectReaderPublicBuildOutput({root}).issues.some(x=>x.code==='private-writer-payload-leak')).toBe(true);
    });
  });
  it('rejects source maps, TypeScript, SQL, env and privileged project files in actual output tree',()=>{
    fixture({'index.html':'home',
      'assets/app.js.map':'{}','api/me.ts':'export default {}',
      'supabase/private.sql':'select 1;',
      '.env.production':'not-a-real-secret',
      'package.json':'{}',
    },root=>{
      const issues=inspectReaderPublicBuildOutput({root}).issues;
      expect(issues.filter(x=>x.code==='nonpublic-source-artifact').length).toBeGreaterThanOrEqual(4);
      expect(issues.some(x=>x.code==='serverless-source-published')).toBe(true);
    });
  });
  it('fails if index.html is missing, output is missing or output escapes checkout',()=>{
    fixture({'assets/app.js':'console.log(1)'},root=>{
      expect(inspectReaderPublicBuildOutput({root}).issues).toContainEqual(
        expect.objectContaining({code:'missing-web-entry'}));
      expect(inspectReaderPublicBuildOutput({root,outputDir:'not-built'}).issues).toContainEqual(
        expect.objectContaining({code:'output-missing'}));
      expect(inspectReaderPublicBuildOutput({root,outputDir:'../outside'}).issues).toContainEqual(
        expect.objectContaining({code:'output-root-unsafe'}));
    });
  });
  it('rejects linked public artifacts even when the link points to a harmless fixture',()=>{
    fixture({'index.html':'home','safe.txt':'ok'},root=>{
      symlinkSync(join(root,'public','safe.txt'),join(root,'public','asset-link.js'));
      expect(inspectReaderPublicBuildOutput({root}).issues).toContainEqual(
        expect.objectContaining({code:'artifact-symlink'}));
    });
  });
});
