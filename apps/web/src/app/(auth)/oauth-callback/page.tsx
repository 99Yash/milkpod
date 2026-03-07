'use client';

import { useEffect } from 'react';
import { Spinner } from '~/components/ui/spinner';

/**
 * Landing page for the OAuth popup flow.
 *
 * After the provider redirects back through Better Auth, the session
 * cookie is set and the popup ends up here. We simply close the popup;
 * the opener detects `.closed` via polling and reloads itself.
 *
 * If this page is loaded outside a popup (e.g. direct navigation),
 * it redirects to the dashboard.
 */
export default function OAuthCallbackPage() {
  useEffect(() => {
    // Try closing — the opener polls for `.closed` via the WindowProxy.
    // With `noopener`, window.opener is null but window.close() still works.
    window.close();

    // Fallback: not a popup, or window.close() was a no-op → redirect.
    const fallback = setTimeout(() => {
      window.location.href = '/dashboard';
    }, 500);

    return () => clearTimeout(fallback);
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <Spinner className="bg-foreground" />
      <p className="text-sm text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}
