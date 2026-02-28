import z from 'zod';
import { GitHub, Google } from '~/components/ui/icons';
import { modelIdSchema, DEFAULT_MODEL_ID } from '@milkpod/ai/models';
import { DEFAULT_WORD_LIMIT } from '@milkpod/ai/limits';

export const authOptionsSchema = z.enum(['EMAIL', 'GOOGLE', 'GITHUB']);
export type AuthOptionsType = z.infer<typeof authOptionsSchema>;

export const LOCAL_STORAGE_SCHEMAS = {
  LAST_AUTH_METHOD: authOptionsSchema,
  THREAD_SIDEBAR_OPEN: z.boolean(),
  CHAT_MODEL_ID: modelIdSchema.default(DEFAULT_MODEL_ID),
  CHAT_WORD_LIMIT: z.union([z.number(), z.null()]).default(DEFAULT_WORD_LIMIT),
} as const;

export type LocalStorageKey = keyof typeof LOCAL_STORAGE_SCHEMAS;
export const LAST_AUTH_METHOD_KEY = 'LAST_AUTH_METHOD' as const;

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
