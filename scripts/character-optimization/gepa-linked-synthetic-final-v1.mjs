/** Research-only adapter: real pinned GEPA chosen candidate -> isolated synthetic final runner.
 * Does not import private datasets, evaluate natural language or authorize delivery.
 */
import { digest } from './contracts-v1.mjs';
import { intakeFrozenGepaResult } from './gepa-result-intake-v1.mjs';
import { lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const fail = reason => { throw new Error('CHARACTER_GEPA_FINAL_LINK_REFUSED:' + reason); };
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equalKeys = (x, keys) => plain(x) &&
  Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const manifestVersion = 'ce5b0d6e3d6af6c6dbec6de2c54536bbb961d309';
const context = digest('synthetic offline GEPA context; no real source');
const seedDigest = digest('Respond clearly in natural Korean.');
const characters = ['yeoul','seyeon'];

/** Only the exact publicly defined 2-character synthetic GEPA proof is admitted.
 * No unknown source records, raw text, human results or provider evidence can enter.
 */
export function makeSelectedSyntheticFinalCandidate({manifest,envelope,packet}) {
  const intake = intakeFrozenGepaResult({manifest,packet});
  if (manifest.optimizerVersion !== manifestVersion
      || manifest.evaluatorVersion !== 'synthetic-contract-not-approval'
      || manifest.immutableSourcesSha256 !== context
      || manifest.baselinePromptSha256 !== seedDigest
      || manifest.target?.track !== 'shared'
      || !Array.isArray(manifest.target.cohort)
      || manifest.target.cohort.length !== 2
      || manifest.target.cohort.some((x,i) =>
        x.characterId !== characters[i]
        || x.studentModelId !== 'synthetic/no-external-model'
        || x.contentBundleSha256 !== context)
      || !Array.isArray(intake.characterIds)
      || intake.characterIds.join('|') !== characters.join('|')
      || intake.candidate.slot !== 'shared_expression'
      || envelope?.runManifestSha256 !== manifest.manifestSha256
      || envelope?.candidateSha256 !== seedDigest
      || packet.sourceSeedSha256 !== seedDigest
      || envelope?.test_set !== null
      || envelope?.externalCallsAuthorized !== false
      || envelope?.productionEligible !== false
      || !Array.isArray(envelope.dataset) || envelope.dataset.length !== 4
      || intake.ownerReviewGranted !== false
      || intake.heldoutPassed !== false
      || intake.productionEligible !== false
      || intake.externalCalls !== 0) fail('not_the_synthetic_offline_run');
  const mapped=new Map();
  for(const row of envelope.dataset) {
    if(!equalKeys(row,['id','characterId','familyId','split','contentSha256']))
      fail('no_private_fields_in_corpus');
    const suffix = row.split==='development'?'dev':
      row.split==='optimizer_validation'?'val':null;
    if (!characters.includes(row.characterId) || !suffix
        || row.id !== row.characterId+'-synthetic-'+suffix
        || row.familyId !== row.characterId+'-synthetic-'+suffix+'-family'
        || row.contentSha256 !== digest(row.characterId+'-'+suffix+'-content-synthetic')
        || mapped.has(row.characterId+'|'+suffix)) fail('untrusted_synthetic_family');
    mapped.set(row.characterId+'|'+suffix,row);
  }
  if(mapped.size!==4 || characters.some(id=>
      !mapped.has(id+'|dev') || !mapped.has(id+'|val'))) fail('missing_synthetic_families');
  const optimizationFamilyIds=['dev','val'].map(k=>
    'synthetic-'+mapped.get('yeoul|'+k).familyId);
  if(!sha(intake.candidate.textSha256))fail('invalid_candidate_hash');
  return Object.freeze({
    schemaVersion:'myeongha-frozen-candidate-test-v1',
    characterId:'yeoul',
    runManifestSha256:manifest.manifestSha256,
    candidateSha256:intake.candidate.textSha256,
    optimizationFamilyIds:Object.freeze(optimizationFamilyIds),
    frozenBeforeSealedEvaluation:true,
    externalCallsAuthorized:false,
    productionEligible:false,
  });
}

function privateDirectory(path) {
  if(!isAbsolute(path))fail('absolute_directory_required');
  const stat=lstatSync(path);
  if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)!==0)
    fail('private_0700_directory_required');
  const resolved=realpathSync(path);
  const repo=realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
  if(resolved===repo || resolved.startsWith(repo+sep))fail('outside_repository_required');
  return resolved;
}

export function stageSyntheticFinalCandidate({proofDir,frozenDir}) {
  const proof=privateDirectory(proofDir), out=privateDirectory(frozenDir);
  if(proof===out)fail('separate_immutable_staging_directory');
  const read=name=>{
    const file=join(proof,name);
    const meta=lstatSync(file);
    if(!meta.isFile() || meta.isSymbolicLink() || meta.size>128*1024)fail('unsafe_proof_file');
    return JSON.parse(readFileSync(file,'utf8'));
  };
  const candidate=makeSelectedSyntheticFinalCandidate({
    manifest:read('manifest.json'), envelope:read('envelope.json'),
    packet:read('frozen-result.json'),
  });
  const file=join(out,'candidate.json');
  writeFileSync(file,JSON.stringify(candidate),{flag:'wx',mode:0o600});
  return Object.freeze({syntheticCandidateStaged:true,approved:false,
    candidateSha256:candidate.candidateSha256,externalCalls:0});
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4){
    console.error('CHARACTER_GEPA_FINAL_LINK_REFUSED');
    process.exitCode=2;
  }else{
    try{
      const result=stageSyntheticFinalCandidate({
        proofDir:process.argv[2],frozenDir:process.argv[3],
      });
      console.log('Synthetic-only selected GEPA candidate staged for isolated final evaluator; external calls 0.');
      if(!result.syntheticCandidateStaged)process.exitCode=2;
    }catch{
      console.error('CHARACTER_GEPA_FINAL_LINK_REFUSED');
      process.exitCode=2;
    }
  }
}
