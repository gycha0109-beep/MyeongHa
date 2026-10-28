// Watchtower-Track: commerce-payment
import type {PostgresSubjectExecutionScopeV1} from './postgres-subject-execution.js';

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/iu;
const SQL=`select lot_id::text as "lotId",issued,
 available_credits::text as "availableCredits",total_credits::text as "totalCredits"
 from public.cmd_fulfill_verified_chat_credit_receipt_v1($1::uuid,$2::uuid)`;
function balance(x:unknown):number{
 if(typeof x!=='string'||!/^(?:0|[1-9][0-9]*)$/u.test(x))throw Error('Invalid credit balance');
 const n=Number(x);if(!Number.isSafeInteger(n))throw Error('Invalid credit balance');return n;
}

/** The DB alone resolves the fixed Offer/terms, verifies Production evidence and deduplicates. */
export async function fulfillCurrentMemberCreditReceiptV1(input:Readonly<{
 scope:PostgresSubjectExecutionScopeV1;receiptId:unknown;
}>){
 const {scope,receiptId}=input;
 if(scope.resolvedSubject.subjectKind!=='member'||typeof receiptId!=='string'||!UUID.test(receiptId))
  throw Error('Credit receipt authority unavailable');
 const r=await scope.client.query<{lotId:unknown;issued:unknown;availableCredits:unknown;totalCredits:unknown}>(
  SQL,[scope.resolvedSubject.subjectId,receiptId.toLowerCase()]);
 const row=r.rows[0];
 if(r.rows.length!==1||!row||typeof row.lotId!=='string'||!UUID.test(row.lotId)||
    typeof row.issued!=='boolean')throw Error('Invalid credit fulfillment result');
 const availableCredits=balance(row.availableCredits),totalCredits=balance(row.totalCredits);
 if(availableCredits>totalCredits)throw Error('Invalid credit fulfillment balance');
 return Object.freeze({receiptId:receiptId.toLowerCase(),lotId:row.lotId.toLowerCase(),
  outcome:row.issued?'issued' as const:'replayed' as const,
  creditsIssued:row.issued?300:0,availableCredits,totalCredits});
}
