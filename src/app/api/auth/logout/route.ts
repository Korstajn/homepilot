import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { GMAIL_COOKIE, OAUTH_STATE_COOKIE } from '@/lib/google';

export async function POST() {
  // Sessions are signed tokens rather than rows (see src/lib/auth.ts), so
  // logging out is exactly this: clear the cookie. There is no server-side
  // record to delete, and pretending otherwise would be a query that does
  // nothing on the way out of every session.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  // Logging out must not leave a Gmail refresh token behind in the browser —
  // the next person to use it would inherit the connection.
  res.cookies.set(GMAIL_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
