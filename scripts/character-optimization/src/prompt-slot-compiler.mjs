import { MUTABLE_SLOTS, fail, keys, objectSha256, sha256 } from './contracts.mjs';
import { validateOptimizationProfile } from './profile-schema.mjs';

const ALLOWLIST = ['slot', 'text', 'baselineImmutableSha256'];
const DANGEROUS_PATTERNS = [
  { tag:'authority_override', re:/\b(?:ignore|override|bypass)\s+(?:all\s+)?(?:system|developer|authority|policy|canon|guard)\b/i },
  { tag:'authority_override', re:/(?:상위|기존)\s*(?:규칙|권한|설정|인격|캐논).{0,12}(?:무시|덮어써|변경|해제)/ },
  { tag:'fabricate_memory', re:/(?:없는|미확인|가짜)\s*(?:기억|사건|과거|관계).{0,14}(?:있었던|사실|만들|기록)/ },
  { tag:'permission_change', re:/(?:권한|사생활|개인정보|기억)\s*(?:검사|보호|제한|게이트).{0,10}(?:우회|해제|생략|무시)/ },
];

/** A review-only artifact. Never directly compiles into a production prompt. */
export function compileOfflineCandidate(profile, runSummary, candidate, immutableSourceBytes) {
  const p = validateOptimizationProfile(profile);
  if (!runSummary || !Array.isArray(runSummary.characterIds) || !runSummary.characterIds.includes(p.characterId) || runSummary.externalCallsEnabled !== false || runSummary.profileFingerprints?.[p.characterId] !== p.fingerprint) fail('runSummary', 'offline run pinned to exact character profile required');
  if (typeof immutableSourceBytes !== 'string' || immutableSourceBytes.length === 0) fail('immutableSourceBytes', 'nonempty protected source required');
  keys(candidate, ALLOWLIST, ALLOWLIST, 'candidate');
  if (!MUTABLE_SLOTS.includes(candidate.slot) || !profile.mutableSlots.includes(candidate.slot)) fail('candidate.slot', 'slot not approved for profile');
  if ((runSummary.track === 'shared' && candidate.slot !== 'shared_expression') || (runSummary.track === 'character' && candidate.slot !== 'character_expression')) fail('candidate.slot', 'wrong track');
  if (candidate.baselineImmutableSha256 !== sha256(immutableSourceBytes)) fail('candidate.baselineImmutableSha256', 'protected baseline changed');
  if (typeof candidate.text !== 'string' || !candidate.text.trim() || candidate.text.length > 1400 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(candidate.text)) fail('candidate.text', 'empty, unsafe or oversized');
  const warnings = DANGEROUS_PATTERNS.filter(x => x.re.test(candidate.text)).map(x => x.tag);
  const reviewArtifact = {
    characterId:p.characterId, track:runSummary.track, slot:candidate.slot,
    baselineImmutableSha256:candidate.baselineImmutableSha256,
    candidateTextSha256:sha256(candidate.text),
    candidateFingerprint:objectSha256(candidate),
    status:warnings.length ? 'rejected_for_policy_review' : 'pending_owner_review',
    warningCodes:[...new Set(warnings)],
    promotionAllowed:false, productionOutputCreated:false,
  };
  return Object.freeze(reviewArtifact);
}
