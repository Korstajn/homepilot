import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession } from '@/lib/store';
import { SESSION_COOKIE } from '@/lib/auth';
import { GMAIL_COOKIE, OAUTH_STATE_COOKIE } from '@/lib/google';

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  // Logging out must not leave a Gmail refresh token behind in the browser —
  // the next person to use it would inherit the connection.
  res.cookies.set(GMAIL_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
