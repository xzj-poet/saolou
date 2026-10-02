export type AuthenticationErrorCode =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_DISABLED";

export class AuthenticationError extends Error {
  constructor(public readonly code: AuthenticationErrorCode) {
    super(code);
    this.name = "AuthenticationError";
  }
}
