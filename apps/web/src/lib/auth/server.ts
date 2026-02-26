import { auth } from '@milkpod/auth';

// Lazy getter — auth() defers env validation to runtime so the
// web app can build without server-side env vars.
export const authServer = auth;
