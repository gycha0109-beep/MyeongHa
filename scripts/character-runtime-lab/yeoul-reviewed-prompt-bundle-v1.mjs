/** Build research-only DeepSeek prompt candidates from explicitly reviewed source material. No remote I/O. */
import { createHash } from 'node:crypto';
import { RULE_CATALOG } from './yeoul-offline-optimizer-v1.mjs';
import { buildResearchPromptPlan, retrieveReviewedExamples } from './yeoul-quality-offline-v1.mjs';

const BIBLE = 'docs/character/YEOUL_CHARACTER_BIBLE_DRAFT_V0_3.md';
const RUNTIME = 'docs/character/YEOUL_CHARACTER_RUNTIME_DRAFT_V0_1.md';
const PINNED_ANCHOR_REF = 'scripts/run-yeoul-four-model-288-v1.mjs#PERSONA_CORE';
const VARIANTS = Object.freeze(['baseline', 'language_rules', 'conversation_examples', 'hybrid']);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const invalid = reason => { throw new Error('YEOUL_REVIEWED_PROMPT_INVALID: ' + reason); };
const reviewed = item => isObject(item) && item.reviewStatus === 'approved_for_offline_research' &&
  isObject(item.reviewEvidence) && item.reviewEvidence.reviewedBy === 'character_owner' &&
  nonempty(item.reviewEvidence.reviewRef) && Array.isArray(item.reviewEvidence.sourceRefs) &&
  [BIBLE, RUNTIME].every(path => item.reviewEvidence.sourceRefs.includes(path));

/** A written review is an authoring assertion, not authentication or production publication. */
export function compileReviewedPromptBundle({ pinnedAnchor, reviewedRules = [], exampleBank = [], context }) {
  if (!reviewed(pinnedAnchor) || pinnedAnchor.sourceRef !== PINNED_ANCHOR_REF ||
    !nonempty(pinnedAnchor.text) || pinnedAnchor.text.length > 8000 ||
    pinnedAnchor.sha256 !== hash(pinnedAnchor.text)) invalid('reviewed_pinned_anchor_required');
  if (!isObject(context) || context.datasetRole !== 'legacy_development_only' ||
    !/^Y(0[1-9]|1[0-2])$/.test(context.legacyQuestionId) || !nonempty(context.userMove) ||
    !nonempty(context.relationshipStage) || typeof context.historyAvailable !== 'boolean' ||
    !Array.isArray(context.approvedFacts) || context.approvedFacts.some(value => !nonempty(value)) ||
    (!context.historyAvailable && context.approvedFacts.length > 0) ||
    !Array.isArray(context.situationTags) || context.situationTags.some(value => !nonempty(value))) invalid('development_context_only');
  if (!Array.isArray(reviewedRules) || !Array.isArray(exampleBank)) invalid('reviewed_material_shape');
  const seen = new Set();
  const instructions = [];
  for (const rule of reviewedRules) {
    if (!reviewed(rule) || !nonempty(rule.ruleId) || seen.has(rule.ruleId)) invalid('rule_review_required');
    const known = RULE_CATALOG.find(item => item.id === rule.ruleId);
    if (!known || rule.instructionDraft !== known.draft) invalid('modified_or_unknown_rule');
    seen.add(rule.ruleId);
    instructions.push(known.draft);
  }
  if (instructions.length > 4) invalid('too_many_rules');
  const eligible = exampleBank.filter(example => example?.reviewStatus === 'approved' &&
    nonempty(example?.reviewEvidence?.reviewRef) &&
    example?.reviewEvidence?.reviewedBy === 'character_owner');
  const selected = retrieveReviewedExamples({
    examples: eligible, userMove: context.userMove, relationshipStage: context.relationshipStage,
    historyAvailable: context.historyAvailable, approvedFacts: context.approvedFacts,
    situationTags: context.situationTags, limit: 3,
  });
  // Submitted examples cannot carry unverified facts, silently broaden relationship scope,
  // or embed a dataset from a different split in this research-only compiler.
  if (selected.some(example => example.datasetRole !== 'legacy_development_only' ||
      !/^Y(0[1-9]|1[0-2])$/.test(example.situation?.referenceQuestionId) ||
      !nonempty(example.provenance?.sourceKey) || example.provenance?.experimentRunId !== 42572722295)) invalid('example_source_provenance');
  const variants = VARIANTS.map(id => {
    const needsRule = id === 'language_rules' || id === 'hybrid';
    const needsExample = id === 'conversation_examples' || id === 'hybrid';
    const blockers = [
      ...(needsRule && !instructions.length ? ['reviewed_language_rule_required'] : []),
      ...(needsExample && !selected.length ? ['reviewed_context_example_required'] : []),
    ];
    if (blockers.length) return { id, status: 'blocked_pending_review', blockers, promptSha256: null, prompt: null };
    const prompt = buildResearchPromptPlan({
      variant: id, pinnedCoreAnchor: pinnedAnchor.text, languageRules: instructions.join('\n'),
      relationshipState: context.relationshipStage, historyAvailable: context.historyAvailable,
      approvedFacts: context.approvedFacts, reviewedExamples: needsExample ? selected : [],
    });
    if (prompt.system.length > 14000) invalid('prompt_too_long_review_required');
    return { id, status: 'offline_candidate_only', blockers: [],
      promptSha256: hash(prompt.system), prompt,
      reviewedRuleIds: needsRule ? [...seen] : [],
      reviewedExampleSourceKeys: needsExample ? selected.map(item => item.provenance.sourceKey) : [],
    };
  });
  return {
    schemaVersion: 'yeoul-reviewed-prompt-bundle-v1', datasetRole: 'legacy_development_only',
    sourceExperimentRunId: 42572722295,
    model: 'deepseek/deepseek-v4.1-flash-1017', modelRoutingChanged: false,
    sourceAnchorSha256: pinnedAnchor.sha256,
    reviewedRuleCount: instructions.length, matchedApprovedExampleCount: selected.length,
    variants, readyForPaidEvaluation: false, qualityGainEstablished: false,
    externalCalls: 0, productionEligible: false,
    warning: 'AUTHOR_REVIEW_ASSERTIONS_ARE_NOT_PRODUCTION_AUTHORITY_OR_HUMAN_EVALUATION',
  };
}
