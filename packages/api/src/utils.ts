import { status } from 'elysia';
import { isAdminEmail } from './modules/usage/service';

/** Format seconds as M:SS (used in LLM prompts for moments and comments). */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Guard: returns a 403 response if the user is not an admin, undefined otherwise. */
export function requireAdmin(user: { email: string }) {
  if (!isAdminEmail(user.email)) {
    return status(403, { message: 'Admin access required' });
  }
}
