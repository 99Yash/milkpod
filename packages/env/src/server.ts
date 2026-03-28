import { z } from 'zod';

const serverEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    BETTER_AUTH_SECRET: z.string().min(32, 'Must be at least 32 characters'),
    BETTER_AUTH_URL: z.string().min(1, 'BETTER_AUTH_URL is required'),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
    ASSEMBLYAI_API_KEY: z.string().min(1, 'ASSEMBLYAI_API_KEY is required'),
    UPLOAD_STORAGE_BUCKET: z.string().optional(),
    UPLOAD_STORAGE_REGION: z.string().default('auto'),
    UPLOAD_STORAGE_ENDPOINT: z.url().optional(),
    UPLOAD_STORAGE_ACCESS_KEY_ID: z.string().optional(),
    UPLOAD_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    UPLOAD_STORAGE_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
    UPLOAD_STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86_400)
      .default(900),
    RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
    AUTH_FROM_EMAIL: z
      .string()
      .min(1, 'AUTH_FROM_EMAIL must not be empty')
      .default('Milkpod <noreply@croisillies.xyz>'),
    ADMIN_EMAILS: z.string().optional().default(''),
    COOKIE_DOMAIN: z.string().optional().default(''),
    RAW_MEDIA_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
    // AI SDK provider keys
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, 'GOOGLE_GENERATIVE_AI_API_KEY is required'),
    // Redis — set to enable BullMQ job queue + Redis pub/sub SSE
    REDIS_URL: z.string().optional(),
    // Billing provider — set to 'polar' to enable billing routes
    BILLING_PROVIDER: z.enum(['polar', 'razorpay']).optional(),
    // Polar provider credentials (required when BILLING_PROVIDER=polar)
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
    // Comma-separated Polar product UUIDs (monthly,yearly) per plan
    POLAR_PRODUCT_PRO: z.string().optional(),
    POLAR_PRODUCT_TEAM: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.COOKIE_DOMAIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_DOMAIN'],
        message: 'COOKIE_DOMAIN is required in production',
      });
    }
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
