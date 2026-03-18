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

// ---------------------------------------------------------------------------
// Cursor-based pagination
// ---------------------------------------------------------------------------

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function encodeCursor(row: { id: string; createdAt: Date }): string {
  const payload = JSON.stringify({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
  });
  return Buffer.from(payload).toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
): { id: string; createdAt: Date } | null {
  if (!cursor) return null;

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { id?: string; createdAt?: string };
    if (typeof parsed.id !== 'string' || typeof parsed.createdAt !== 'string') {
      return null;
    }

    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }

    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

/** Parse a `limit` query string into a clamped integer. */
export function normalizeLimit(
  raw: string | undefined,
  defaultLimit: number,
  max = 100,
): number {
  if (!raw) return defaultLimit;
  const n = Number(raw);
  if (Number.isNaN(n)) return defaultLimit;
  return Math.max(1, Math.min(n, max));
}

/** Build a CursorPage from a query result that fetched `limit + 1` rows. */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  pageSize: number,
): CursorPage<T> {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? encodeCursor(items[items.length - 1]!)
    : null;
  return { items, nextCursor, hasMore };
}
