/** Read-only R16 character-specific probe extraction; no generated canon or dialogue. */
import {CHARACTER_IDS, digest} from './contracts-v1.mjs';
const TYPES = Object.freeze(['persona','relationship','memory','long_horizon','open_world']);
const failure = reason => { throw new Error(`CHARACTER_R16_INVALID:${reason}`); };
const isSha = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const nonempty = v => typeof v === 'string' && v.trim().length > 0;

/** Caller loads a pinned Runtime source; DRAFT cannot become approved by parsing it. */
export function extractR16Metadata({characterId,sourceRef,sourceSha256,runtimeText,sourceAuthorityState}) {
  if (!CHARACTER_IDS.includes(characterId) || !nonempty(sourceRef)
      || !sourceRef.startsWith('docs/character/')
      || !sourceRef.split('/').at(-1).startsWith(`${characterId.toUpperCase()}_CHARACTER_RUNTIME_`)
      || !['DRAFT','APPROVED','OTHER_VERIFIED'].includes(sourceAuthorityState)
      || !isSha(sourceSha256) || typeof runtimeText !== 'string' || digest(runtimeText) !== sourceSha256)
    failure('source_binding');
  const start = runtimeText.search(/^# R16\. CHARACTER EVALUATION PROBES\s*$/m);
  if (start < 0) failure('r16_missing');
  const tail = runtimeText.slice(start);
  const end = tail.search(/^# R17\./m);
  if (end < 0) failure('r17_boundary_missing');
  const section = tail.slice(0,end);
  const sections = [...section.matchAll(/^## R16\.(\d+)\s+[^\n]+/gm)];
  if (sections.length < 4) failure('required_probe_categories');
  const results = [];
  const seen = new Set();
  for (let i=0; i<sections.length; i++) {
    const match = sections[i], index = Number(match[1]);
    if (index < 1 || index > 5 || seen.has(index)) failure('probe_class');
    seen.add(index);
    const part = section.slice(match.index+match[0].length,
      i+1<sections.length ? sections[i+1].index : undefined);
    const descriptions = [...part.matchAll(/^- (.+)$/gm)].map(m=>m[1].trim());
    if (descriptions.length === 0) failure('empty_probe_class');
    for (const [ordinal,description] of descriptions.entries()) {
      if (!description || description.length > 1500) failure('invalid_probe_description');
      const fingerprint = digest(description);
      results.push(Object.freeze({characterId,probeClass:`R16.${index}`,
        category:TYPES[index-1],ordinal:ordinal+1,
        probeId:`${characterId}:R16.${index}:${fingerprint.slice(0,16)}`,
        promptDigest:fingerprint,sourceSha256,
        sourceRef,sourceAuthorityClaim:sourceAuthorityState,
        humanReviewVerified:false,productionAuthorized:false}));
    }
  }
  if (![1,2,3,4].every(i=>seen.has(i))) failure('required_probe_categories');
  if (new Set(results.map(x=>x.probeId)).size !== results.length) failure('duplicate_probe');
  return Object.freeze({schemaVersion:'character-r16-probe-metadata-v1',
    characterId,sourceRef,sourceSha256,sourceAuthorityClaim:sourceAuthorityState,
    categories:[...seen].sort().map(i=>`R16.${i}`),
    probeCount:results.length,probes:Object.freeze(results),
    humanReviewVerified:false,qualityGainEstablished:false,promptContentExported:false});
}

/** Only identifiers and digests leave the local source-reader boundary. */
export function buildR16Ticket({registry,probeId,split,familyId,profileSourceSha256}) {
  if (!registry || registry.schemaVersion!=='character-r16-probe-metadata-v1'
      || !Array.isArray(registry.probes) || !isSha(profileSourceSha256)
      || registry.sourceSha256!==profileSourceSha256) failure('runtime_source_mismatch');
  if (!['development','optimizer_validation'].includes(split)
      || !nonempty(familyId)) failure('split_or_family');
  const probe=registry.probes.find(x=>x.probeId===probeId);
  if (!probe || probe.characterId!==registry.characterId
      || probe.sourceSha256!==registry.sourceSha256 || probe.humanReviewVerified!==false)
    failure('unverified_or_cross_character_probe');
  return Object.freeze({schemaVersion:'character-r16-development-ticket-v1',
    characterId:probe.characterId,probeId:probe.probeId,probeClass:probe.probeClass,
    familyId,split,sourceSha256:registry.sourceSha256,promptDigest:probe.promptDigest,
    promptContentExported:false,reviewStatus:'source_unreviewed',
    scoreEstablished:false,externalCallsAuthorized:false});
}
