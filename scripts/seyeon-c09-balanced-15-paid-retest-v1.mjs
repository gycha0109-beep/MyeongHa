#!/usr/bin/env node
/**
 * Paid first-contact C09 BALANCED retest: EXACT same 15 inputs as previous
 * A/B/C experiment; one new candidate per case, independent semantic reviewer
 * ONLY if existing server interpretation/output/speech gates pass.
 *
 * The first-contact context/census are synthetic! This is NOT production
 * Integrity/Disclosure preflight or a production delivery path.
 *
 * Run from repo root after building the adapter with rolldown:
 *   node --env-file=<path to local secret .env> \
 *      scripts/seyeon-c09-balanced-15-paid-retest-v1.mjs --limit 1
 *   node --env-file=<path> \
 *      scripts/seyeon-c09-balanced-15-paid-retest-v1.mjs --resume
 *
 * Strict limit: 15 unique candidates, max one reviewer per passing candidate.
 * A failed call is recorded, never retried automatically. No extra A/B/C
 * model generations or release/relationship changes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  captureC09BalancedModelRequestV1,
  evaluateC09BalancedCandidateV1,
} from '../artifacts/seyeon-c09-balanced-paid-adapter-v1.mjs';

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(name);
  return i < 0 ? fallback : argv[i + 1];
}
const model = arg('--model', 'gpt-4.1-mini');
const limit = Number(arg('--limit', '15'));
const output = resolve(arg('--output',
  'artifacts/seyeon-c09-balanced-15-paid-retest-20261026-v1.json'));
const resume = argv.includes('--resume');
const dryRun = argv.includes('--dry-run');
if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw Error('INVALID_MODEL');
if (!Number.isInteger(limit) || limit < 1 || limit > 15) throw Error('INVALID_LIMIT_1_TO_15');
if (!dryRun && !process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY_REQUIRED');

const prior = JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json',
), 'utf8'));
const questions = [...new Map(prior.records.map(r => [r.id,{
  id: r.id, axis: r.axis, kind: r.kind, prompt: r.prompt,
}])).values()];
if (questions.length !== 15 || questions.some(q => !Number.isInteger(q.id))) {
  throw Error('REFERENCE_INPUTS_NOT_EXACTLY_FIFTEEN');
}

const saved = resume && existsSync(output) ?
  JSON.parse(readFileSync(output, 'utf8')) : null;
if (saved && (saved.model !== model || saved.dryRun !== dryRun ||
  saved.testVersion !== 'seyeon-c09-balanced-15-paid-retest-v1')) {
  throw Error('RESUME_RUN_MISMATCH');
}
const records = saved ? saved.records : [];
if (!Array.isArray(records) || records.length > 15) throw Error('INVALID_RUN_RECORDS');

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function formatResponseSchema(schema) {
  const supported = new Set([
    'type', 'properties', 'required', 'additionalProperties',
    'enum', 'anyOf', 'items', 'description', 'const', '$defs', '$ref',
  ]);
  if (Array.isArray(schema)) return schema.map(formatResponseSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => supported.has(key))
    .map(([key, value]) => [
      key,
      key === 'properties' || key === '$defs'
        ? Object.fromEntries(Object.entries(value)
          .map(([fieldName, fieldSchema]) => [
            fieldName, formatResponseSchema(fieldSchema),
          ]))
        : formatResponseSchema(value),
    ]));
}

const tokenTotals = () => records.reduce((s,r) => {
  for (const entry of [r.candidateCall, r.reviewerCall]) {
    if (!entry) continue;
    s.prompt += Number(entry.usage?.prompt_tokens||0);
    s.completion += Number(entry.usage?.completion_tokens||0);
  }
  return s;
}, {prompt:0,completion:0});

function persist() {
  mkdirSync(dirname(output), {recursive: true});
  const data = {
    testVersion:'seyeon-c09-balanced-15-paid-retest-v1',
    date:'2026-10-26',
    model,
    dryRun,
    baseExperiment: 'docs/experiments/seyeon-c09-15x3-generative-gpt-41-mini-20261026-raw-v1.json',
    syntheticFirstTurnAndPreflight: true,
    realGovernedIntegrityAndDisclosurePreflight: false,
    independentSemanticReviewProvider: true,
    productionChanged: false,
    maxNewCandidates:15,
    maxReviewerCalls:15,
    uniqueCandidateAttempts:records.filter(r=>r.candidateCall?.attempted).length,
    reviewerAttempts:records.filter(r=>r.reviewerCall?.attempted).length,
    generatedCandidates:records.filter(r=>r.candidateCall?.validCandidate).length,
    acceptedByWholeShadow:records.filter(r=>r.shadowVerdict?.accepted).length,
    usage:tokenTotals(),
    records,
  };
  writeFileSync(output,JSON.stringify(data,null,2),'utf8');
}

async function callOpenAI(request, tag, temperature, maxCompletionTokens) {
  const attemptedAt = new Date().toISOString();
  const payload = {
    model,
    temperature,
    max_completion_tokens:maxCompletionTokens,
    response_format:{
      type:'json_schema',
      json_schema:{
        name:'seyeon_c09_'+tag+'_v1',
        strict:true,
        schema:formatResponseSchema(request.responseSchema),
      },
    },
    messages:[
      {role:'system',content:[
        'Return exactly one valid JSON object matching the supplied schema.',
        'This is a shadow-only candidate or independent review; do not send to a user.',
        request.instructions,
      ].join('\n\n')},
      {role:'user',content:JSON.stringify(request.input)},
    ],
  };
  const control=new AbortController();
  const timeout=setTimeout(()=>control.abort(),60000);
  const started=Date.now();
  try {
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:'Bearer '+process.env.OPENAI_API_KEY,
      },
      body:JSON.stringify(payload),
      signal:control.signal,
    });
    let data;
    try { data=await response.json(); } catch { data={}; }
    const message = data.choices?.[0]?.message?.content??'';
    let parsed=null;
    try {parsed=JSON.parse(message);} catch {/* record invalid result */}
    return {
      request: {
        purpose:request.purpose,
        instructionsSha256:sha256(request.instructions),
        responseSchemaSha256:sha256(JSON.stringify(request.responseSchema)),
        inputSize:JSON.stringify(request.input).length,
      },
      log: {
        attempted:true,
        attemptedAt,
        elapsedMs:Date.now()-started,
        httpStatus:response.status,
        finishReason:data.choices?.[0]?.finish_reason??null,
        usage:data.usage??null,
        error:response.ok ? null : String(data.error?.message||response.statusText).slice(0,500),
        parsed:!!parsed,
      },
      parsed,
    };
  } catch(error) {
    return {
      request:{purpose:request.purpose},
      log:{
        attempted:true,attemptedAt,
        elapsedMs:Date.now()-started,
        httpStatus:null,finishReason:null,usage:null,parsed:false,
        error:String(error?.message||error).slice(0,200),
      },
      parsed:null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fatalProviderError(call) {
  return call.httpStatus===400 || call.httpStatus===401 ||
    call.httpStatus===403 || call.httpStatus===429 ||
    call.httpStatus===503 || call.httpStatus===null;
}

for(const question of questions) {
  if(records.some(record=>record.id===question.id))continue;
  if(records.length>=limit)break;
  const record={
    id:question.id,axis:question.axis,kind:question.kind,
    prompt:question.prompt,model,startedAt:new Date().toISOString(),
    profile:'balanced_v1',syntheticPreflight:true,
  };
  let stopEarly=false;
  let captured;
  try {
    captured=await captureC09BalancedModelRequestV1(question.prompt);
    record.requestPurpose=captured.request.purpose;
    record.requestHash=sha256(JSON.stringify(captured.request));
    record.requestIncludesClosedRendererVocabulary=
      Object.hasOwn(captured.request.input,'allowedRendererOutputVocabulary');
  } catch(error) {
    record.failure='CANDIDATE_REQUEST_CAPTURE_FAILED';
    record.captureError=String(error?.message||error).slice(0,160);
    records.push(record);
    persist();
    console.log('ABORT_CAPTURE',question.id,record.captureError);
    break;
  }
  if(dryRun) {
    record.dryRun=true;
    records.push(record);
    persist();
    console.log('DRY',question.id);
    continue;
  }
  const gen=await callOpenAI(captured.request,'candidate',0.65,1350);
  record.candidateRequest=gen.request;
  record.candidateCall={
    ...gen.log,
    validCandidate:gen.log.httpStatus===200 &&
      gen.log.finishReason==='stop' &&
      !!gen.parsed?.interpretation &&
      typeof gen.parsed?.draft?.utterance==='string',
  };
  if(record.candidateCall.validCandidate) {
    record.interpretation=gen.parsed.interpretation;
    record.draft=gen.parsed.draft;
    record.reply=gen.parsed.draft.utterance;
    record.reviewerCall={attempted:false};
    record.shadowVerdict=await evaluateC09BalancedCandidateV1(
      question.prompt, gen.parsed, async(reviewerRequest) => {
        const result=await callOpenAI(reviewerRequest,'reviewer',0,1400);
        record.reviewerRequest=result.request;
        record.reviewerCall={...result.log, validReview:
          result.log.httpStatus===200 &&
          result.log.finishReason==='stop' &&
          !!result.parsed &&
          Array.isArray(result.parsed.failureCodes)};
        if(record.reviewerCall.validReview) {
          record.independentReview=result.parsed;
        }
        if(fatalProviderError(record.reviewerCall))stopEarly=true;
        if(!record.reviewerCall.validReview) {
          throw new Error('INDEPENDENT_REVIEW_PROVIDER_FAILED');
        }
        return result.parsed;
      },
    );
  }
  else {
    record.failure='MODEL_GENERATION_INVALID_OR_INCOMPLETE';
  }
  records.push(record);
  persist();
  console.log(JSON.stringify({
    id:record.id,
    generated:!!record.candidateCall?.validCandidate,
    http:record.candidateCall?.httpStatus??null,
    candidateGuard:record.shadowVerdict?.serverFailureCode??
      (record.shadowVerdict?.accepted?'PASS':null),
    boundary:record.shadowVerdict?.speechBoundaryFlags??null,
    independentReview:record.reviewerCall?.attempted??false,
    independentReviewFailures:record.independentReview?.failureCodes??null,
    accepted:!!record.shadowVerdict?.accepted,
    response:record.reply??null,
  }));
  if(fatalProviderError(record.candidateCall)||stopEarly) {
    console.log('STOP_PROVIDER_OR_SCHEMA_ERROR');
    break;
  }
}
persist();
console.log('SUMMARY',JSON.stringify({
  candidates:records.filter(r=>r.candidateCall?.attempted).length,
  valid:records.filter(r=>r.candidateCall?.validCandidate).length,
  reviewerRequests:records.filter(r=>r.reviewerCall?.attempted).length,
  approved:records.filter(r=>r.shadowVerdict?.accepted).length,
  tokens:tokenTotals(),output,
}));
