// Allowed web origins: CORS_ORIGIN plus its www/apex counterpart.
//
// The site is served on both the apex and www (see alchemy.run.ts domain
// aliases), so users browse from either origin. Cookies are shared via
// COOKIE_DOMAIN, but CORS and Better Auth's trustedOrigins match exact
// origins — without the counterpart, www sessions fail OAuth
// (callbackURL rejected) and all cross-origin API reads.
export function trustedAppOrigins(corsOrigin: string): string[] {
  const origins = [corsOrigin];
  try {
    const url = new URL(corsOrigin);
    const host = url.hostname;
    const alt = host.startsWith('www.') ? host.slice('www.'.length) : `www.${host}`;
    url.hostname = alt;
    const altOrigin = url.origin;
    if (altOrigin !== corsOrigin) origins.push(altOrigin);
  } catch {
    // Non-URL origin — return as-is.
  }
  return origins;
}
