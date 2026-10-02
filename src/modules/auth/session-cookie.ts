export interface CookieOptions {
  expires: Date;
  httpOnly: true;
  name: "campus_sweep_session";
  path: "/";
  sameSite: "lax";
  secure: boolean;
  value: string;
}

export function buildSessionCookie(
  token: string,
  expiresAt: Date,
  production: boolean,
): CookieOptions {
  return {
    expires: expiresAt,
    httpOnly: true,
    name: "campus_sweep_session",
    path: "/",
    sameSite: "lax",
    secure: production,
    value: token,
  };
}
