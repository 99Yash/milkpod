import { z } from 'zod';

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SERVER_URL: z.string().default('http://localhost:3001'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

let _clientEnv: ClientEnv | undefined;

export function clientEnv(): ClientEnv {
  if (_clientEnv) return _clientEnv;
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
  });
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Missing or invalid environment variables:\n${formatted}`);
  }
  _clientEnv = result.data;
  return _clientEnv;
}
