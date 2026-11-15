/** Research-only shape check for Yeoul pilot success / stop rules.
 * Neither a timestamped preregistration nor an owner approval / paid transport gate.
 */
import { digest } from './contracts-v1.mjs';
import { DIMENSIONS } from './evaluation-v1.mjs';

const fail = code => { throw new Error('YEOUL_PILOT_CRITERIA_INVALID:' + code); };
const isObject = x => x !== null && typeof x === 'object'
  && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype
    || Object.getPrototypeOf(x) === null);
const exact = (x, fields) => isObject(x)
  && Object.keys(x).sort().join('|') === [...fields].sort().join('|');
const count = x => Number.isSafeInteger(x) && x >= 1 && x <= 10000;
const fraction = x => typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= 1;

/** Explicitly requires owner-selected numbers: never supplies a default success threshold. */
export function inspectYeoulPilotPreregistrationDraft(input) {
  if (!exact(input, ['schemaVersion','characterId','evaluationUnit','holdout',
    'blindReview','regression','stop']) ||
      input.schemaVersion !== 'yeoul-gepa-pilot-criteria-draft-v1' ||
      input.characterId !== 'yeoul' ||
      input.evaluationUnit !== 'independent_scenario_family')
    fail('scope_or_shape');
  const {holdout, blindReview, regression, stop} = input;
  if (!exact(holdout, ['source','minimumFamilies','publicH01H10Excluded',
    'developmentAndValidationExcluded']) ||
      holdout.source !== 'new_unexposed_private' || !count(holdout.minimumFamilies) ||
      holdout.publicH01H10Excluded !== true ||
      holdout.developmentAndValidationExcluded !== true)
    fail('private_holdout_plan');
  if (!exact(blindReview, ['mode','minimumRaters','minimumPreferenceShare','ties']) ||
      blindReview.mode !== 'paired_blind' || !count(blindReview.minimumRaters) ||
      !fraction(blindReview.minimumPreferenceShare) ||
      blindReview.ties !== 'not_a_win')
    fail('blind_comparison_plan');
  if (!exact(regression, ['dimensions','allCharactersMustPass','anyDimensionVeto',
    'hardFailureVeto','uncertaintyVeto']) ||
      !Array.isArray(regression.dimensions) ||
      regression.dimensions.length !== DIMENSIONS.length ||
      DIMENSIONS.some((d,i) => regression.dimensions[i] !== d) ||
      regression.allCharactersMustPass !== true ||
      regression.anyDimensionVeto !== true ||
      regression.hardFailureVeto !== true ||
      regression.uncertaintyVeto !== true)
    fail('nonregression_contract');
  if (!exact(stop, ['totalBudgetKrw','includeAllRolesAndRetries',
    'unreconciledCharge','providerMismatch','sealedLeakage']) ||
      stop.totalBudgetKrw !== 500 || stop.includeAllRolesAndRetries !== true ||
      stop.unreconciledCharge !== 'stop' || stop.providerMismatch !== 'stop' ||
      stop.sealedLeakage !== 'stop')
    fail('pilot_stop_contract');
  // Only primitive, allowlisted metadata enters this digest, never private prompts.
  const criteria = {
    schemaVersion:input.schemaVersion, characterId:'yeoul',
    evaluationUnit:input.evaluationUnit,
    holdout:{source:holdout.source,minimumFamilies:holdout.minimumFamilies,
      publicH01H10Excluded:true,developmentAndValidationExcluded:true},
    blindReview:{mode:blindReview.mode,minimumRaters:blindReview.minimumRaters,
      minimumPreferenceShare:blindReview.minimumPreferenceShare,ties:'not_a_win'},
    regression:{dimensions:[...DIMENSIONS],allCharactersMustPass:true,
      anyDimensionVeto:true,hardFailureVeto:true,uncertaintyVeto:true},
    stop:{totalBudgetKrw:500,includeAllRolesAndRetries:true,
      unreconciledCharge:'stop',providerMismatch:'stop',sealedLeakage:'stop'},
  };
  return Object.freeze({
    schemaVersion:'yeoul-gepa-pilot-criteria-inspection-v1',
    characterId:'yeoul', criteriaDraftSha256:digest(criteria),
    minimumHoldoutFamilies:holdout.minimumFamilies,
    minimumBlindRaters:blindReview.minimumRaters,
    proposedBlindPreferenceShare:blindReview.minimumPreferenceShare,
    strictCharacterDimensionVeto:true, maximumTotalKrw:500,
    sourceClaimsAuthenticated:false, independentPrivateHoldoutVerified:false,
    ownerCriteriaApprovalVerified:false, preregistrationImmutablyTimestamped:false,
    realQualityImprovementEstablished:false, paidExecutionReady:false,
    externalCalls:0, productionEligible:false,
    decision:'HOLD_PENDING_OWNER_REVIEW_AND_INDEPENDENT_EVIDENCE',
  });
}
