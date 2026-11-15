/** Types for the existing fixed-origin PortOne browser SDK relay. */
export declare const OWNER_PORTONE_SDK_PATH: '/owner-portone-sdk-v2.js';
export declare const PORTONE_V2_SDK_ORIGIN: 'https://cdn.portone.io/v2/browser-sdk.js';
export declare function isOwnerPortOneSdkRequestV1(request: Request, url?: URL): boolean;
export declare function serveOwnerPortOneSdkV1(fetchSdk?: typeof fetch): Promise<Response>;
