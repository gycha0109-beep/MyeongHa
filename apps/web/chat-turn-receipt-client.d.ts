// Watchtower-Track: security
export declare function sendSeyeonBrowserTurnWithReceiptV1(input: Readonly<{
  origin:string;bearer:string;threadId:string;
  turn:Readonly<{clientTurnId:string;text:string}>;
  language:string;localeHeaders:Readonly<Record<string,string>>;
  fetchImpl?:typeof fetch;
}>):Promise<Readonly<{turnId:string;assistantMessageId:string;
  assistantText:string;sequenceNo:number;replayed:false}>>;
