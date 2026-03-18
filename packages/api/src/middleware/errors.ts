/**
 * Typed API error classes for structured error handling.
 *
 * Throw these from route handlers or services — the global `.onError()` hook
 * in `error-handler.ts` catches them and returns a normalized JSON response
 * with the correct HTTP status code.
 */

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'The requested resource was not found') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You do not have permission to access this resource') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
    this.name = 'UnauthorizedError';
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Invalid request') {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'This action conflicts with existing data') {
    super(409, 'CONFLICT', message);
    this.name = 'ConflictError';
  }
}
