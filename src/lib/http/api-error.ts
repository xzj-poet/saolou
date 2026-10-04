export type ApiErrorFields = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: ApiErrorFields,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
