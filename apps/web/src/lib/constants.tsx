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

export const OAUTH_PROVIDERS = {
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
} as const satisfies Record<OAuthProviderId, OAuthProvider>;

export const PROVIDER_AUTH_OPTIONS = {
  github: 'GITHUB',
  google: 'GOOGLE',
} as const satisfies Record<OAuthProviderId, AuthOptionsType>;

export const getProviderById = (
  id: OAuthProviderId
): OAuthProvider | undefined => {
  return OAUTH_PROVIDERS[id];
};
