// Watchtower-Track: security
// Render ONLY the user's just-submitted text and the body that this browser
// fully received and acknowledged. Never query protected History or persist
// a model response in browser storage.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createSeyeonAcknowledgedTurnPresentationV1(pending, acknowledged, now=new Date()){
  if(!pending || typeof pending.text!=='string' || pending.text.trim()==='' ||
     !UUID.test(pending.clientTurnId??'') ||
     !acknowledged || acknowledged.replayed!==false ||
     !UUID.test(acknowledged.turnId??'') ||
     !UUID.test(acknowledged.assistantMessageId??'') ||
     typeof acknowledged.assistantText!=='string' || acknowledged.assistantText.trim()==='' ||
     !Number.isSafeInteger(acknowledged.sequenceNo) || acknowledged.sequenceNo<1 ||
     !(now instanceof Date) || !Number.isFinite(now.getTime())){
    throw Error('SEYEON_ACKED_TURN_PRESENTATION_INVALID');
  }
  const createdAt=now.toISOString();
  return Object.freeze([
    Object.freeze({sequenceNo:1,senderType:'user',characterId:null,
      bodyText:pending.text,createdAt,redacted:false,redactedAt:null,receiptOnly:true}),
    Object.freeze({sequenceNo:2,senderType:'character',characterId:'seyeon',
      bodyText:acknowledged.assistantText,createdAt,redacted:false,redactedAt:null,receiptOnly:true}),
  ]);
}
