import { Elysia } from 'elysia';
import { ApiError } from './errors';

/**
 * Global error handler that normalizes all error responses to:
 *
 *   { error: string, code: string }
 *
 * Handles:
 *  - Custom `ApiError` subclasses thrown from services/handlers
 *  - Elysia's built-in VALIDATION, NOT_FOUND, PARSE errors
 *  - Unhandled exceptions (INTERNAL_SERVER_ERROR / UNKNOWN)
 *
 * Note: `status()` returns from route handlers bypass this hook entirely —
 * they are typed responses, not errors. Those are normalized in Task 37.
 */
export const errorHandler = new Elysia({ name: 'error-handler' }).onError(
  { as: 'global' },
  ({ code, error, set }) => {
    // Custom ApiError thrown from services/handlers
    if (error instanceof ApiError) {
      set.status = error.statusCode;
      return { error: error.message, code: error.code };
    }

    // Elysia validation errors (TypeBox schema failures)
    if (code === 'VALIDATION') {
      set.status = 400;

      // Extract a human-readable summary from the validation error.
      // `error.all` contains structured ValueError entries; pick the
      // first one's message for the summary.
      const first = error.all[0];
      const summary = first?.summary
        ? `Validation failed on ${error.type}: ${first.summary}`
        : `Validation failed on ${error.type}`;

      return { error: summary, code: 'VALIDATION_ERROR' };
    }

    // No matching route
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { error: 'Not found', code: 'NOT_FOUND' };
    }

    // Malformed request body (e.g. invalid JSON)
    if (code === 'PARSE') {
      set.status = 400;
      return { error: 'Invalid request body', code: 'PARSE_ERROR' };
    }

    // Unhandled exception — log safely, return generic message
    if (code === 'INTERNAL_SERVER_ERROR' || code === 'UNKNOWN') {
      console.error(
        '[api] Unhandled error:',
        error instanceof Error ? error.message : String(error),
      );
      set.status = 500;
      return { error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' };
    }
  },
);
