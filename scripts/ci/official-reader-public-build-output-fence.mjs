#!/usr/bin/env node
// M1-31: inspect actual npm run build:web PUBLIC OUTPUT after Vite compilation.
// Production Vercel serverless bundles are a different, externally built
// artifact and MUST NOT be inferred from this check.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const DISALLOWED_EXTENSION=new Set([
  '.ts','.tsx','.mts','.cts','.sql','.map','.pem','.key',
]);
const DISALLOWED_BASENAME=new Set([
  'package.json','package-lock.json','.env','.env.local',
  '.npmrc','vercel.json','README.md',
]);
const TEXT_EXTENSION=new Set([
  '.js','.mjs','.cjs','.html','.css','.json','.svg','.txt','.xml',
]);
export const READER_INTERNAL_BUNDLE_FINGERPRINTS=Object.freeze([
  'qry_official_reader_unknown_commit_minimal_v1',
  'observeOfficialReaderUnknownCommitWithMinimalReadV1',
  'observeOfficialReaderUnknownCommitMinimalV1',
  'createOfficialReaderUnknownCommitReadTransactionV1',
  'MINIMAL_UNKNOWN_COMMIT_READ_SQL',
  'postgres-official-reader-unknown-commit-read-tx-v1',
  'official-reader-unknown-commit-minimal-v1',
]);
const guard=(code,file,detail)=>({code,file,detail});
const normalize=(s)=>s.split(sep).join('/');
function within(root,file){
  const x=relative(root,file);
  return x!==''&&x!=='..'&&!x.startsWith('..'+sep)&&!x.startsWith(sep);
}

export function inspectReaderPublicBuildOutput({
  root=ROOT,
  outputDir='public',
}={}){
  const project=resolve(root);
  const output=resolve(project,outputDir);
  const issues=[],manifest=[],hash=createHash('sha256');
  let files=0,bytes=0;
  if(!within(project,output)){
    return {files,bytes,digest:null,manifest,issues:[guard('output-root-unsafe',outputDir,'must be beneath repository root')]};
  }
  if(!existsSync(output)){
    return {files,bytes,digest:null,manifest,issues:[guard('output-missing',outputDir,'build must complete before inspecting artifacts')]};
  }
  let entries;
  try{entries=readdirSync(output,{withFileTypes:true})}
  catch{return {files,bytes,digest:null,manifest,issues:[guard('output-unreadable',outputDir,'not a readable build directory')]}}
  const pending=entries.map(x=>({parent:output,entry:x}));
  const names=new Set();
  while(pending.length){
    const {parent,entry}=pending.pop();
    const full=join(parent,entry.name);
    const rel=normalize(relative(output,full));
    if(entry.isSymbolicLink()){
      issues.push(guard('artifact-symlink',rel,'static output may not include symlinks'));
      continue;
    }
    if(entry.isDirectory()){
      for(const child of readdirSync(full,{withFileTypes:true}))
        pending.push({parent:full,entry:child});
      continue;
    }
    if(!entry.isFile()){
      issues.push(guard('artifact-unsupported-type',rel,'only regular public files allowed'));
      continue;
    }
    names.add(rel);
    const basenameValue=basename(full);
    const ext=extname(full).toLowerCase();
    if(DISALLOWED_BASENAME.has(basenameValue)||DISALLOWED_EXTENSION.has(ext)||
       basenameValue.startsWith('.env.')){
      issues.push(guard('nonpublic-source-artifact',rel,'private source/secret/source-map extension is not publishable'));
    }
    const body=readFileSync(full);
    files++;
    bytes+=body.byteLength;
    manifest.push({file:rel,bytes:body.byteLength,sha256:createHash('sha256').update(body).digest('hex')});
    if(TEXT_EXTENSION.has(ext)){
      const txt=body.toString('utf8');
      for(const needle of READER_INTERNAL_BUNDLE_FINGERPRINTS){
        if(txt.includes(needle)){
          issues.push(guard('reader-internal-payload-leak',rel,'internal Reader implementation fingerprint: '+needle));
        }
      }
      // Private serverless source files must never be shipped in browser
      // assets, even if identifier mangling hides function names.
      if(/\b(?:public\.)?internal_apply_official_reader_unified_receipt_v1\b/u.test(txt))
        issues.push(guard('private-writer-payload-leak',rel,'private Reader Writer SQL leaked into browser output'));
    }
  }
  if(!names.has('index.html'))issues.push(guard('missing-web-entry','index.html','no root web entrypoint'));
  if(names.has('api/me.ts')||names.has('api/me.js'))
    issues.push(guard('serverless-source-published','api/me','server API may not be copied to static output'));
  manifest.sort((a,b)=>a.file.localeCompare(b.file,'en'));
  for(const a of manifest){
    hash.update(a.file+'\0'+a.bytes+'\0'+a.sha256+'\n');
  }
  issues.sort((a,b)=>a.code.localeCompare(b.code)||a.file.localeCompare(b.file));
  return {files,bytes,digest:files?hash.digest('hex'):null,manifest,issues};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const mode=process.argv[2]??'--check';
  if(mode!=='--check')throw Error('Usage: node scripts/ci/official-reader-public-build-output-fence.mjs --check');
  const report=inspectReaderPublicBuildOutput();
  for(const issue of report.issues){
    console.error('HOLD M1-31: '+issue.code+' ['+issue.file+'] '+issue.detail);
  }
  if(report.issues.length)process.exitCode=1;
  else console.log('PASS M1-31: locally compiled static web output inspected, '+
    report.files+' files; manifest sha256 '+report.digest);
  console.log('HOLD M1-31: this is the local browser output, NOT the actual Vercel serverless deployment bundle or the PR commit deployed to production');
}
