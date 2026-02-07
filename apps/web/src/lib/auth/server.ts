import { createAuthServerClient } from '@milkpod/auth';

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

// Auth client for server-side operations in Next.js
// This makes HTTP calls to the auth server
export const authServer = createAuthServerClient(SERVER_URL);
