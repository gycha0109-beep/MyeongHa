// Watchtower-Track: security
export declare function createSeyeonAcknowledgedTurnPresentationV1(
  pending: {readonly clientTurnId:string; readonly text:string},
  acknowledged: {readonly turnId:string;readonly assistantMessageId:string;
    readonly assistantText:string;readonly sequenceNo:number;readonly replayed:boolean},
  now?: Date,
): readonly Readonly<{sequenceNo:number;senderType:string;characterId:string|null;
  bodyText:string;createdAt:string;redacted:boolean;redactedAt:null;receiptOnly:true}>[];
