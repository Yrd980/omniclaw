export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

export function invariant(condition: unknown, status: number, code: string, message: string, details: unknown = null): asserts condition {
  if (!condition) {
    throw new ApiError(status, code, message, details);
  }
}
