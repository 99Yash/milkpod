import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DNS_LOOKUP_TIMEOUT_MS = 5_000;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
  );
}

function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map((part) => Number(part));
  if (
    octets.length !== 4
    || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [first, second, third] = octets;
  if (first === undefined || second === undefined || third === undefined) {
    return true;
  }

  return (
    first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 168)
    || (first === 198
      && (second === 18 || second === 19 || (second === 51 && third === 100)))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224
  );
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0] ?? address.toLowerCase();

  if (normalized === '::' || normalized === '::1') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    return isIP(mappedIpv4) === 4 ? isBlockedIpv4(mappedIpv4) : true;
  }

  return (
    normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
  );
}

function isBlockedIpAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);

  return true;
}

async function lookupAddresses(hostname: string): Promise<string[]> {
  const pendingLookup = lookup(hostname, { all: true, verbatim: true }).then(
    (entries) => entries.map((entry) => entry.address),
  );

  return await new Promise<string[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('URL host lookup timed out'));
    }, DNS_LOOKUP_TIMEOUT_MS);

    pendingLookup.then(
      (addresses) => {
        clearTimeout(timeout);
        resolve(addresses);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function cancelResponseBody(response: Response): Promise<void> {
  return response.body?.cancel().catch(() => undefined) ?? Promise.resolve();
}

export async function assertSafeExternalParsedUrl(parsedUrl: URL): Promise<void> {
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs are supported');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('URLs with embedded credentials are not supported.');
  }

  const hostname = parsedUrl.hostname;

  if (isBlockedHostname(hostname)) {
    throw new Error('Private network URLs are not allowed.');
  }

  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error('Private network URLs are not allowed.');
    }
    return;
  }

  let addresses: string[];
  try {
    addresses = await lookupAddresses(hostname);
  } catch {
    throw new Error('Could not resolve media host. Check the URL.');
  }

  if (addresses.length === 0) {
    throw new Error('Could not resolve media host. Check the URL.');
  }

  if (addresses.some((address) => isBlockedIpAddress(address))) {
    throw new Error('Private network URLs are not allowed.');
  }
}

export async function assertSafeExternalSourceUrl(rawUrl: string): Promise<void> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL');
  }

  await assertSafeExternalParsedUrl(parsedUrl);
}

export async function fetchSafeExternalResponse(
  rawUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  let currentUrl: URL;

  try {
    currentUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL');
  }

  await assertSafeExternalParsedUrl(currentUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    try {
      if (redirectCount === MAX_REDIRECTS) {
        throw new Error('Too many redirects while fetching external URL.');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error('External URL redirect did not include a location.');
      }

      const nextUrl = new URL(location, currentUrl);
      await assertSafeExternalParsedUrl(nextUrl);
      currentUrl = nextUrl;
    } finally {
      await cancelResponseBody(response);
    }
  }

  throw new Error('Too many redirects while fetching external URL.');
}
