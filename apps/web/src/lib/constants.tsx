import z from 'zod';
import { GitHub, Google } from '~/components/ui/icons';

export const authOptionsSchema = z.enum(['EMAIL', 'GOOGLE', 'GITHUB']);
export type AuthOptionsType = z.infer<typeof authOptionsSchema>;

export const LOCAL_STORAGE_SCHEMAS = {
  LAST_AUTH_METHOD: authOptionsSchema,
} as const;

export type LocalStorageKey = keyof typeof LOCAL_STORAGE_SCHEMAS;
export const LAST_AUTH_METHOD_KEY: LocalStorageKey = 'LAST_AUTH_METHOD';

export type LocalStorageValue<K extends LocalStorageKey> = z.infer<
  (typeof LOCAL_STORAGE_SCHEMAS)[K] & z.ZodTypeAny
>;

export type OAuthProviderId = Lowercase<Exclude<AuthOptionsType, 'EMAIL'>>;

interface OAuthProvider {
  id: OAuthProviderId;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  github: {
    id: 'github',
    name: 'GitHub',
    icon: GitHub,
  },
  google: {
    id: 'google',
    name: 'Google',
    icon: Google,
  },
} as const;

export const PROVIDER_AUTH_OPTIONS: Record<OAuthProviderId, AuthOptionsType> = {
  github: 'GITHUB',
  google: 'GOOGLE',
};

export const getProviderById = (
  id: OAuthProviderId
): OAuthProvider | undefined => {
  return OAUTH_PROVIDERS[id];
};
