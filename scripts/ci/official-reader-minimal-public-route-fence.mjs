#!/usr/bin/env node
// M1-30: fail-closed, source-tree public API import/re-export/dynamic-import
// reachability fence. NO production network probes, authentication claim or SQL.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
export const PROTECTED_READER_MODULES=Object.freeze([
  'apps/api/src/official-reader-unknown-commit-minimal-v1.ts',
  'apps/api/src/postgres-official-reader-unknown-commit-read-tx-v1.ts',
]);
const TARGETS=new Set(PROTECTED_READER_MODULES);
const CODE_EXTENSIONS=['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs'];
const TEST_FILE=/(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const safeRelative=(path)=>path.split(sep).join('/');
const isCode=(file)=>CODE_EXTENSIONS.some(x=>file.endsWith(x))&&!file.endsWith('.d.ts');
const violation=(kind,path,detail)=>({kind,path,detail});

function allFiles(dir,out=[]) {
  for(const e of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,e.name);
    if(e.isSymbolicLink())throw Error('M1-30 unresolved symlink in public route tree: '+path);
    if(e.isDirectory()){
      if(!['node_modules','.git','dist','build','.next','coverage'].includes(e.name))allFiles(path,out);
    }else if(e.isFile()&&isCode(path)&&!TEST_FILE.test(path))out.push(path);
  }
  return out;
}
function within(root,path) {
  const rel=relative(root,path);
  return rel!==''&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..'+sep)&&!rel.startsWith(sep);
}
function candidatePaths(path) {
  const ext=extname(path).toLowerCase();
  let bases=[path];
  if(['.js','.jsx','.mjs','.cjs'].includes(ext)){
    const base=path.slice(0,-ext.length);
    bases=[base+'.ts',base+'.tsx',base+'.mts',base+'.cts',path];
  }else if(ext===''){
    bases=CODE_EXTENSIONS.map(x=>path+x);
  }
  return [...bases,...CODE_EXTENSIONS.map(x=>join(path,'index'+x))];
}
function sourceImports(source,filename) {
  const sf=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,
    filename.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const imports=[],unknown=[];
  function add(node,literal) {
    if(literal && (ts.isStringLiteral(literal)||ts.isNoSubstitutionTemplateLiteral(literal))){
      imports.push(literal.text);
    }else unknown.push('nonliteral import at '+sf.getLineAndCharacterOfPosition(node.pos).line);
  }
  function visit(node){
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
      if(node.moduleSpecifier)add(node,node.moduleSpecifier);
    }
    if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference))
      add(node,node.moduleReference.expression);
    if(ts.isCallExpression(node)){
      if(node.expression.kind===ts.SyntaxKind.ImportKeyword||
         (ts.isIdentifier(node.expression)&&node.expression.text==='require')){
        add(node,node.arguments[0]);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
  return {imports:[...new Set(imports)],unknown};
}
export function inspectPublicRouteExposure(root=ROOT) {
  const api=resolve(root,'api');
  if(!existsSync(api)||!statSync(api).isDirectory())throw Error('M1-30: missing Vercel api route root');
  const routes=allFiles(api).sort();
  if(routes.length===0)throw Error('M1-30: no API routes to inspect');
  const issues=[],visited=new Set(),routesByPath=new Map();
  const entrypoints=routes.map(p=>safeRelative(relative(root,p)));
  const pending=routes.map(path=>({path,trace:[safeRelative(relative(root,path))]}));
  const resolvers=new Map();
  function packageRoot(name) {
    if(resolvers.has(name))return resolvers.get(name);
    let found=null;
    for(const location of ['packages','apps']){
      const dir=resolve(root,location);
      if(!existsSync(dir))continue;
      for(const child of readdirSync(dir,{withFileTypes:true})){
        if(!child.isDirectory())continue;
        const json=resolve(dir,child.name,'package.json');
        if(!existsSync(json))continue;
        const obj=JSON.parse(readFileSync(json,'utf8'));
        if(obj.name===name){found=resolve(dir,child.name);break}
      }
      if(found)break;
    }
    resolvers.set(name,found);
    return found;
  }
  function findModule(from,spec) {
    let path;
    if(spec.startsWith('.'))path=resolve(dirname(from),spec);
    else if(spec.startsWith('@myeongha/')){
      const seg=spec.split('/');
      const pkg=seg.slice(0,2).join('/');
      const rootDir=packageRoot(pkg);
      if(!rootDir)return {issue:'unresolved first-party workspace package '+pkg};
      path=seg.length>2?resolve(rootDir,...seg.slice(2)):resolve(rootDir,'src/index');
    }else if(spec.startsWith('/')){
      return {issue:'absolute filesystem import cannot be audited: '+spec};
    }else{
      // Third-party imports are outside this repository and not attested.
      return {external:true};
    }
    if(!within(root,path))return {issue:'import escapes repository root: '+spec};
    if(/\.(?:json|css|scss|svg|png|webp|wasm)$/iu.test(path))return {asset:true};
    for(const candidate of candidatePaths(path)){
      if(!within(root,candidate))continue;
      if(existsSync(candidate)&&statSync(candidate).isFile())
        return {path:candidate};
    }
    return {issue:'unresolved local/first-party import: '+spec};
  }
  for(const route of routes)routesByPath.set(route,route);
  while(pending.length>0) {
    const {path,trace}=pending.shift();
    const label=safeRelative(relative(root,path));
    if(visited.has(path))continue;
    visited.add(path);
    if(TARGETS.has(label)){
      issues.push(violation('protected-reader-reachable',label,trace.join(' -> ')));
      continue;
    }
    let src;
    try{src=readFileSync(path,'utf8')}catch{
      issues.push(violation('source-unreadable',label,trace.join(' -> ')));
      continue;
    }
    const imports=sourceImports(src,label);
    for(const unknown of imports.unknown)
      issues.push(violation('dynamic-import-unresolved',label,trace.join(' -> ')+' ['+unknown+']'));
    for(const spec of imports.imports){
      const dependency=findModule(path,spec);
      if(dependency.issue){
        issues.push(violation('unresolved-import',label,trace.join(' -> ')+' ['+dependency.issue+']'));
      }else if(dependency.path){
        const dependencyLabel=safeRelative(relative(root,dependency.path));
        if(TARGETS.has(dependencyLabel))
          issues.push(violation('protected-reader-reachable',dependencyLabel,
            [...trace,dependencyLabel].join(' -> ')));
        else if(!visited.has(dependency.path))
          pending.push({path:dependency.path,trace:[...trace,dependencyLabel]});
      }
    }
  }
  const vercel=resolve(root,'vercel.json');
  if(!existsSync(vercel))issues.push(violation('config-missing','vercel.json','missing rewrite inventory'));
  else {
    const config=JSON.parse(readFileSync(vercel,'utf8'));
    for(const rewrite of config.rewrites??[]){
      const destination=rewrite.destination;
      if(typeof destination!=='string'||!destination.startsWith('/api/')){
        issues.push(violation('rewrite-unknown','vercel.json','unsupported destination'));
        continue;
      }
      const route=destination.split('?')[0];
      // :id etc are route patterns, but dispatch must have a concrete
      // checked-in API function to receive the rewrite.
      const resolved=resolve(root,route.slice(1)+'.ts');
      if(!routesByPath.has(resolved))
        issues.push(violation('rewrite-unchecked','vercel.json',rewrite.source+' -> '+route));
    }
  }
  issues.sort((a,b)=>a.kind.localeCompare(b.kind)||a.path.localeCompare(b.path)||a.detail.localeCompare(b.detail));
  return {routes:entrypoints,inspectedModules:visited.size,issues};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  const mode=process.argv[2]??'--check';
  if(mode!=='--check'){console.error('Usage: node scripts/ci/official-reader-minimal-public-route-fence.mjs --check');process.exitCode=2}
  else {
    const result=inspectPublicRouteExposure();
    for(const item of result.issues)console.error('HOLD M1-30 '+item.kind+': '+item.detail);
    if(result.issues.length)process.exitCode=1;
    else console.log('PASS M1-30 public Reader route import fence: '+result.routes.length+
      ' API entrypoints / '+result.inspectedModules+' first-party modules inspected; protected Reader modules not reachable');
    console.log('HOLD M1-30: source-only import graph is not production deployment, runtime plugin, dynamic registration or verified user authentication');
  }
}
