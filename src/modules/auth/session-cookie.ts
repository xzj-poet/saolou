export interface CookieOptions {
  expires: Date;
  httpOnly: true;
  name: "campus_sweep_session";
  path: "/";
  sameSite: "lax";
  secure: boolean;
  value: string;
}

export const SESSION_COOKIE_NAME = "campus_sweep_session" as const;

export function buildSessionCookie(
  token: string,
  expiresAt: Date,
  production: boolean,
): CookieOptions {
  return {
    expires: expiresAt,
    httpOnly: true,
    name: SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: production,
    value: token,
  };
}

export function buildClearedSessionCookie(production: boolean): CookieOptions {
  return {
    expires: new Date(0),
    httpOnly: true,
    name: SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: production,
    value: "",
  };
}
