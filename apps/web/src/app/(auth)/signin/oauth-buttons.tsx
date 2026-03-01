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
import { cn, setLocalStorageItem } from '~/lib/utils';

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

    // Navigate directly to the server's redirect endpoint so the OAuth
    // state cookie is set as a first-party cookie (top-level navigation).
    // This avoids the cross-origin fetch cookie issue on Railway where
    // frontend and backend are on different *.up.railway.app subdomains.
    const callbackURL = `${window.location.origin}/`;
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
    const params = new URLSearchParams({ provider: providerId, callbackURL });
    window.location.href = `${serverUrl}/auth/social-redirect?${params}`;
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
