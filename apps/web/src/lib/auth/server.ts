import { auth } from '@milkpod/auth';

// Use the auth instance directly for server-side session checks in RSC.
// This works because @milkpod/db loads DATABASE_URL from the server .env,
// giving the auth instance direct database access.
export const authServer = auth;
