export const ERROR_CODES = {
  unauthenticated: 'UNAUTHENTICATED',
  permissionDenied: 'PERMISSION_DENIED',
  invalidArgument: 'INVALID_ARGUMENT',
  failedPrecondition: 'FAILED_PRECONDITION',
  notFound: 'NOT_FOUND',
  alreadyExists: 'ALREADY_EXISTS',
  resourceExhausted: 'RESOURCE_EXHAUSTED',
  internal: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
