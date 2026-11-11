/** Validates UNAPPROVED synthetic draft only. Never sends prompts to any model. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {QUALITY_AXES, sha256, validateDatasetSplitMetadata} from './src/index.mjs';

export function validateSyntheticDevelopmentPack(pack) {
  if (!pack || pack.schemaVersion!=='yeoul-synthetic-development-draft-v1' ||
      pack.characterId!=='yeoul' || pack.researchOnly!==true ||
      pack.examplesApproved!==false || pack.semanticIndependenceHumanReviewed!==false ||
      pack.source!=='fresh_synthetic_draft_not_from_existing_288_or_sealed_holdout' ||
      !Array.isArray(pack.scenarios) || pack.scenarios.length!==12) throw new Error('SYNTHETIC_PACK_INVALID: identity');
  const metadata=[];
  for (const s of pack.scenarios) {
    if (!s || !/^(?:YD0[1-8]|YV0[1-4])$/.test(s.id) ||
        s.role!==(s.id.startsWith('YD')?'development':'optimizer_validation') ||
        typeof s.familyId!=='string' || !/^[a-z_]+$/.test(s.familyId) ||
        !['first_contact','acquaintance'].includes(s.relationshipStage) ||
        s.historyAvailable!==false || !Array.isArray(s.turns) || s.turns.length!==1 ||
        typeof s.turns[0]!=='string' || s.turns[0].length>300 || !s.turns[0].trim() ||
        !Array.isArray(s.evaluationFocus) || s.evaluationFocus.length<1 ||
        !s.evaluationFocus.every(x=>QUALITY_AXES.includes(x))) throw new Error('SYNTHETIC_PACK_INVALID: scenario');
    metadata.push({recordId:s.id,characterId:'yeoul',familyId:s.familyId,
      paraphraseFamilyId:s.familyId,turnGroupId:s.familyId,
      promptFingerprint:sha256(s.turns.join('\n')),role:s.role,sourceKind:'synthetic'});
  }
  const result=validateDatasetSplitMetadata(metadata);
  if (result.roleCounts.development!==8 || result.roleCounts.optimizer_validation!==4 ||
      result.roleCounts.sealed_holdout!==0 || result.roleCounts.long_horizon!==0) throw new Error('SYNTHETIC_PACK_INVALID: split');
  return {schemaVersion:'yeoul-synthetic-draft-preflight-v1',
    count:result.count,roleCounts:result.roleCounts,metadataSha256:result.manifestSha256,
    approvedForOptimization:false,qualityGainEstablished:false,
    semanticOverlapWithHistoricalAndHoldoutNotVerified:true,networkCalls:0};
}

if (process.argv[1] && resolve(process.argv[1])===new URL(import.meta.url).pathname) {
  try {
    if (process.argv.length!==3) throw new Error('USAGE: supply synthetic development JSON path');
    const pack=JSON.parse(await readFile(resolve(process.argv[2]),'utf8'));
    process.stdout.write(`${JSON.stringify(validateSyntheticDevelopmentPack(pack))}\n`);
  } catch {process.stderr.write('SYNTHETIC_PACK_INVALID\n');process.exitCode=1;}
}
