import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
const [input,output,claudePath]=process.argv.slice(2).map(x=>resolve(x));const response=JSON.parse(readFileSync(input,'utf8'));const draft=JSON.parse(readFileSync(claudePath,'utf8'));
if(draft.status!=='CLAUDE_DRAFT_SAVED'||response.choices?.[0]?.finish_reason!=='stop')throw Error('INCOMPLETE_SOURCE_RESPONSE');
const raw=response.choices[0].message.content;const parsed=JSON.parse(raw.replace(/^\x60\x60\x60(?:json)?\s*/u,'').replace(/\s*\x60\x60\x60$/u,''));
if(!Array.isArray(parsed.reviews)||parsed.reviews.length!==6||!parsed.reviews.every((r,i)=>r.index===i+1&&typeof r.explanation==='string'&&Array.isArray(r.issues)))throw Error('INCOMPLETE_REVIEWS');
const result={stage:'deepseek',sourceHash:draft.sourceHash,model:response.model,usage:response.usage,finishReason:'stop',status:'DEEPSEEK_REVIEW_SAVED',reviews:parsed.reviews,overall:parsed.overall,mayPublish:false,claudeFile:claudePath};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,reviews:result.reviews.length,issues:result.reviews.reduce((a,r)=>a+r.issues.length,0),cost:result.usage.cost,output}));
