/**
 * Fixed-vocabulary, synthetic-only OpenAI request failure evidence.
 * Never serialize Error.message, Error.stack, response bodies, request bodies,
 * headers, credentials, URLs, free-form provider strings or subject identifiers.
 */
export const SEYEON_TERRA_GLM_FAILURE_PHASE_REASONS_V1=Object.freeze({
 transport:'LUNA_TERRA_TRANSPORT_FAILURE_HOLD',
 http_status:'LUNA_TERRA_HTTP_STATUS_HOLD',
 response_parse:'LUNA_TERRA_RESPONSE_PARSE_FAILURE_HOLD',
 usage_validation:'LUNA_TERRA_USAGE_INVALID_HOLD',
 cost_validation:'LUNA_TERRA_COST_LIMIT_HOLD',
 observation_write:'LUNA_TERRA_OBSERVATION_WRITE_HOLD',
});
const TRANSPORT_ERROR_CODES=new Set([
 'ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE',
 'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT',
 'UND_ERR_SOCKET','ABORT_ERR','ERR_TLS_CERT_ALTNAME_INVALID',
 'CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
 'SELF_SIGNED_CERT_IN_CHAIN',
]);
const CASE_IDS=new Set(['N06','N10','N21']);
const STAGES=new Set([
 'unified_preflight_shadow','turn_interpret_render_shadow','semantic_review',
]);
const MODELS=new Set(['gpt-5.6-luna','gpt-5.6-terra']);
const ROUTES=new Set(['luna','terra']);

export function buildSeyeonTerraGlmFailureDiagnosticV1({
 phase,httpStatus=null,error=null,caseId,stage,model,route,
}){
 if(!Object.hasOwn(SEYEON_TERRA_GLM_FAILURE_PHASE_REASONS_V1,phase)||
    !CASE_IDS.has(caseId)||!STAGES.has(stage)||
    !MODELS.has(model)||!ROUTES.has(route))
  throw Error('TERRA_GLM_FAILURE_DIAGNOSTIC_SCOPE_HOLD');
 const safeHttpStatus=Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599
  ?httpStatus:null;
 const codes=[error?.code,error?.cause?.code,error?.cause?.cause?.code];
 const causeCode=phase==='transport'
  ?codes.find(code=>TRANSPORT_ERROR_CODES.has(code))??null:null;
 return Object.freeze({
  schemaVersion:'seyeon-luna-terra-glm-failure-diagnostic-v1',
  caseId,stage,model,route,phase,
  reason:SEYEON_TERRA_GLM_FAILURE_PHASE_REASONS_V1[phase],
  httpStatus:safeHttpStatus,causeCode,
  invoiceReconciled:false,
 });
}
