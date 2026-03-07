'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { useLastAuthMethod } from '~/hooks/use-last-auth-method';
import type { OAuthProviderId } from '~/lib/constants';
import {
  getProviderById,
  LAST_AUTH_METHOD_KEY,
  OAUTH_PROVIDERS,
  PROVIDER_AUTH_OPTIONS,
} from '~/lib/constants';
import { clientEnv } from '@milkpod/env/client';
import { cn, setLocalStorageItem } from '~/lib/utils';

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;

function openCenteredPopup(url: string): Window | null {
  const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
  const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
  return window.open(
    url,
    'oauth-popup',
    `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},popup=yes`,
  );
}

interface OAuthButtonProps {
  providerId: OAuthProviderId;
  className?: React.ComponentProps<typeof Button>['className'];
}

const OAuthButton: React.FC<OAuthButtonProps> = ({ providerId, className }) => {
  const lastAuthMethod = useLastAuthMethod();
  const [isLoading, setIsLoading] = React.useState(false);

  const provider = getProviderById(providerId);
  const authMethod = PROVIDER_AUTH_OPTIONS[providerId];

  const handleOAuthSignIn = React.useCallback(() => {
    if (!provider) {
      toast.error('Provider not found');
      return;
    }

    setIsLoading(true);
    setLocalStorageItem(LAST_AUTH_METHOD_KEY, authMethod);

    const callbackURL = `${window.location.origin}/oauth-callback`;
    const serverUrl = clientEnv().NEXT_PUBLIC_SERVER_URL;
    const params = new URLSearchParams({ provider: providerId, callbackURL });
    const popupUrl = `${serverUrl}/auth/social-redirect?${params}`;

    const popup = openCenteredPopup(popupUrl);

    if (!popup) {
      // Popup blocked — fall back to full-page redirect (old behaviour)
      const fallbackParams = new URLSearchParams({
        provider: providerId,
        callbackURL: `${window.location.origin}/`,
      });
      window.location.href = `${serverUrl}/auth/social-redirect?${fallbackParams}`;
      return;
    }

    // Poll for the popup closing. Once it closes (after the callback page
    // runs window.close()), reload the current page. The /signin SSR
    // detects the session and redirects to /dashboard — same flow as the
    // old redirect approach landing on /.
    const pollId = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(pollId);
        // Full reload so the SSR session check runs fresh.
        window.location.reload();
      }
    }, 400);
  }, [authMethod, provider, providerId]);

  if (!provider) {
    return null;
  }

  const IconComponent = provider.icon;

  return (
    <Button
      variant="outline"
      className={cn('w-full relative', className)}
      onClick={handleOAuthSignIn}
      disabled={isLoading}
    >
      {IconComponent ? <IconComponent className="size-5" /> : null}
      <span className="text-sm">
        {isLoading ? 'Signing in...' : `Continue with ${provider.name}`}
      </span>
      {isLoading ? (
        <Spinner className="mr-2 bg-background" />
      ) : (
        lastAuthMethod === authMethod && (
          <i className="text-xs absolute right-4 text-muted-foreground text-center">
            Last used
          </i>
        )
      )}
    </Button>
  );
};

export const OAuthButtons: React.FC<{
  className?: React.ComponentProps<typeof Button>['className'];
}> = ({ className }) => {
  return (
    <div className={cn('space-y-1', className)}>
      {Object.values(OAUTH_PROVIDERS).map((provider) => (
        <OAuthButton
          key={provider.id}
          providerId={provider.id}
        />
      ))}
    </div>
  );
};

export { OAuthButton };
