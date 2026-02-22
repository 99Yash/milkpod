import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z.string().min(32, 'Must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().min(1, 'BETTER_AUTH_URL is required'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  ELEVENLABS_API_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let _serverEnv: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Missing or invalid environment variables:\n${formatted}`);
  }
  _serverEnv = result.data;
  return _serverEnv;
}
