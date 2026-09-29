const DEFAULT_MOBILE_API_ORIGIN_V1 = 'https://myeongha.vercel.app' as const;

export interface MobileRuntimeConfigV1 {
  readonly apiOrigin: string;
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b !== undefined && b >= 16 && b <= 31;
}

export function resolveMobileApiOriginV1(
  configured = process.env.EXPO_PUBLIC_MYEONGHA_API_ORIGIN,
): string {
  const candidate =
    typeof configured === 'string' && configured.trim().length > 0
      ? configured.trim()
      : DEFAULT_MOBILE_API_ORIGIN_V1;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Mobile API origin must be an absolute URL.');
  }

  if (
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Mobile API origin must contain only scheme, host, and optional port.');
  }

  if (url.protocol === 'https:') return url.origin;

  const localHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      isPrivateIpv4(url.hostname));

  if (!localHttp) {
    throw new Error('Mobile API origin must use HTTPS outside local development networks.');
  }

  return url.origin;
}

export function readMobileRuntimeConfigV1(): MobileRuntimeConfigV1 {
  return Object.freeze({
    apiOrigin: resolveMobileApiOriginV1(),
  });
}
