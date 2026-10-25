#!/usr/bin/env node
/**
 * Paid, capped, model-matched C09 test (A current fast-shadow baseline;
 * B character-first; C character-first + public everyday texture).
 *
 * The adapter captures the REAL request from the existing Shadow pipeline.
 * It uses synthetic governed first-contact context, NOT actual production
 * preflight; its independent semantic reviewer is NOT run.
 *
 * Install dependencies and bundle adapter before running:
 *   npx rolldown scripts/seyeon-c09-15x3-generative-comparison-adapter-v1.ts \
 *      --platform node --format esm --file artifacts/seyeon-c09-eval-adapter-v1.mjs
 *
 * With OPENAI_API_KEY set:
 *   node scripts/seyeon-c09-15x3-generative-paid-comparison-v1.mjs --limit 1
 *   node scripts/seyeon-c09-15x3-generative-paid-comparison-v1.mjs --resume
 *
 * At most one attempt per case/profile in a run; 45 total distinct cases.
 * No production calls, memory writes, relationship changes or grants.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  captureC09GenerativeComparisonRequestV1,
  guardC09GenerativeComparisonOutputV1,
} from '../artifacts/seyeon-c09-eval-adapter-v1.mjs';

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const index = argv.indexOf(name);
  return index < 0 ? fallback : argv[index + 1];
}
const model = arg('--model', 'gpt-4.1-mini');
const output = resolve(arg('--output',
  'artifacts/seyeon-c09-15x3-generative-gpt-41-mini-20261026-v1.json'));
const limit = Number(arg('--limit', '45'));
const resume = argv.includes('--resume');
const dryRun = argv.includes('--dry-run');
if (!/^[A-Za-z0-9_.-]+$/.test(model)) throw new Error('INVALID_MODEL');
if (!Number.isInteger(limit) || limit < 1 || limit > 45) throw new Error('INVALID_LIMIT');
if (!dryRun && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_MISSING');

const reference = JSON.parse(readFileSync(resolve(
  'docs/experiments/seyeon-c09-15x3-openai-gpt-41-mini-20261025-raw-v1.json'), 'utf8'));
if (!Array.isArray(reference.records) || reference.records.length !== 45) {
  throw new Error('REFERENCE_15X3_INCOMPLETE');
}
const cases = [...new Map(reference.records.map(record => [record.id, {
  id: record.id, axis: record.axis, kind: record.kind,
  prompt: record.prompt, expect: record.expect,
}])).values()];
if (cases.length !== 15 ||
    cases.some(({id,prompt}) => !Number.isInteger(id) || !prompt)) {
  throw new Error('REFERENCE_CASES_INVALID');
}
const profiles = ['baseline', 'character_first_v1', 'character_first_life_v1'];
const previous = resume && existsSync(output) ?
  JSON.parse(readFileSync(output, 'utf8')) : null;
if (previous && (previous.model !== model || previous.dryRun !== dryRun)) {
  throw new Error('RESUME_MODEL_MODE_MISMATCH');
}
const records = previous ? previous.records : [];
if (!Array.isArray(records)) throw new Error('RESUME_RECORDS_INVALID');

function sha256(data) {
  return createHash('sha256').update(data,'utf8').digest('hex');
}
function formatResponseSchema(schema) {
  const supported = new Set(['type','properties','required','additionalProperties',
    'enum','anyOf','items','description','const','$defs','$ref']);
  if (Array.isArray(schema)) return schema.map(formatResponseSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([key]) => supported.has(key))
    .map(([key,value]) => [
      key,
      key === 'properties' || key === '$defs'
        ? Object.fromEntries(Object.entries(value)
          .map(([fieldName,fieldSchema]) => [
            fieldName,formatResponseSchema(fieldSchema),
          ]))
        : formatResponseSchema(value),
    ]));
}
function persist() {
  mkdirSync(dirname(output), { recursive: true });
  const done = records.filter(x => x.validGeneration);
  const result = {
    schemaVersion: 'seyeon-c09-15x3-generative-paid-comparison-v1',
    model,
    dryRun,
    profileNames: { A: 'baseline', B: 'character_first_v1',
      C: 'character_first_life_v1' },
    scenario: 'SYNTHETIC_GOVERNED_PUBLIC_FIRST_CONTACT_NO_MEMORY_NO_SCENE',
    realIntegrityDisclosurePreflightPerformed: false,
    realIndependentSemanticReviewPerformed: false,
    providerRequests: records.filter(x=>x.attemptedProviderCall).length,
    validGenerations: done.length,
    inputTokens: records.reduce((s,x)=>s+Number(x.usage?.prompt_tokens||0),0),
    outputTokens: records.reduce((s,x)=>s+Number(x.usage?.completion_tokens||0),0),
    records,
  };
  writeFileSync(output, JSON.stringify(result, null, 2), 'utf8');
}
for (const test of cases) {
  for (const profile of profiles) {
    const done = records.find(r => r.id === test.id && r.profile === profile);
    if (done) continue; // Each unique pair attempted only once.
    if (records.length >= limit) {
      persist();
      console.log('STOP_LIMIT',records.length);
      process.exit(0);
    }
    const start = Date.now();
    const item = {
      id:test.id,axis:test.axis,kind:test.kind,prompt:test.prompt,
      profile,model,expectedBehavior:test.expect,
      attemptedAt:new Date().toISOString(),
      syntheticPreflight:true,
      realIndependentSemanticReview:false,
    };
    let captured;
    try {
      captured = await captureC09GenerativeComparisonRequestV1(test.prompt, profile);
      const request = captured.request;
      item.requestPurpose = request.purpose;
      item.responseSchemaSha256 = sha256(JSON.stringify(request.responseSchema));
      item.instructionsSha256 = sha256(request.instructions);
      item.instructionsLength = request.instructions.length;
      item.inputLength = JSON.stringify(request.input).length;
      if (dryRun) {
        item.dryRun = true;
        item.elapsedMs=Date.now()-start;
        records.push(item);
        persist();
        console.log('DRY',item.id,profile);
        continue;
      }
      item.attemptedProviderCall = true;
      const schema = formatResponseSchema(request.responseSchema);
      const payload = {
        model,
        temperature: 0.65,
        max_completion_tokens: 1350,
        response_format:{
          type:'json_schema',
          json_schema:{name:'seyeon_c09_comparison_v1',strict:true,schema},
        },
        messages:[
          {role:'system',content:[
            'You must output one JSON object matching the supplied response schema.',
            'You generate a shadow-only candidate, never a verified reply or live user action.',
            request.instructions,
          ].join('\n\n')},
          {role:'user',content:JSON.stringify(request.input)},
        ],
      };
      const abort = new AbortController();
      const clock = setTimeout(()=>abort.abort(), 45000);
      let response;
      let data;
      try {
        response=await fetch('https://api.openai.com/v1/chat/completions',{
          method:'POST',
          headers:{'Content-Type':'application/json',
            Authorization:'Bearer '+process.env.OPENAI_API_KEY},
          body:JSON.stringify(payload),
          signal:abort.signal,
        });
        data=await response.json();
      } finally {clearTimeout(clock);}
      item.httpStatus=response.status;
      item.usage=data.usage??null;
      item.finishReason=data.choices?.[0]?.finish_reason??null;
      if (!response.ok) {
        item.error=String(data.error?.message||response.statusText).slice(0,600);
      } else {
        const txt=data.choices?.[0]?.message?.content??'';
        let parsed;
        try {parsed=JSON.parse(txt);} catch {parsed=null;}
        item.validGeneration=item.finishReason==='stop' &&
          parsed && typeof parsed==='object' &&
          parsed.interpretation && parsed.draft &&
          typeof parsed.draft.utterance==='string';
        if (item.validGeneration) {
          item.interpretation=parsed.interpretation;
          item.draft=parsed.draft;
          item.reply=parsed.draft.utterance;
          const guard=await guardC09GenerativeComparisonOutputV1(
            test.prompt,profile,parsed);
          item.localGuard=guard;
        } else {
          item.error='INVALID_OR_INCOMPLETE_JSON';
          item.rawTextExcerpt=String(txt).slice(0,150);
        }
      }
    } catch(error) {
      item.error=String(error?.message||error).slice(0,500);
    }
    item.elapsedMs=Date.now()-start;
    records.push(item);
    persist();
    console.log(JSON.stringify({
      id:item.id,profile:item.profile,http:item.httpStatus??null,
      valid:!!item.validGeneration,
      guard:item.localGuard?.guardFailureCode??(item.localGuard?.localGuardPassed?'PASS':null),
      latency:item.elapsedMs,error:item.error??null,
    }));
    if (item.httpStatus===429 || item.httpStatus===503 ||
        item.httpStatus===401 || item.httpStatus===403 ||
        (item.httpStatus===400 && test.id===1 && profile==='baseline')) {
      console.log('STOP_PROVIDER_UNAVAILABLE_OR_SCHEMA_ERROR');
      process.exit(2);
    }
  }
}
persist();
console.log('DONE',JSON.stringify({
  attempts:records.filter(x=>x.attemptedProviderCall).length,
  valid:records.filter(x=>x.validGeneration).length,
  output,
}));
