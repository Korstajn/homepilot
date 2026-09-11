import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { BETA_COOKIE, gateMode, hasValidBetaCookie } from '@/lib/beta';

/**
 * Beta gate. Everything on the origin — pages AND API routes — sits behind one
 * shared code while the product is in development at dev.getgigiapp.com.
 *
 * Excluded from the matcher below (they must stay reachable or the gate can't
 * be opened at all): the gate screen itself, its API route, Next's static
 * assets, and robots.txt.
 */
export async function middleware(req: NextRequest) {
  const mode = gateMode();
  if (mode === 'off') return NextResponse.next();

  if (mode === 'misconfigured') {
    return new NextResponse(MISCONFIGURED_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  if (await hasValidBetaCookie(req.cookies.get(BETA_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;

  // API callers get a status code, not a redirect to an HTML page.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'This build is in private beta. Open the site and enter your beta code first.' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = '/beta';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!beta|api/beta|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};

const MISCONFIGURED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>GiGi — not configured</title>
<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F2EC;color:#0D0F0C;
font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px;line-height:1.6}
main{max-width:32em;text-align:center}code{background:#fff;border:1px solid rgba(0,0,0,.12);
border-radius:6px;padding:2px 6px;font-size:.95em}p{color:#3A3D38}</style></head>
<body><main><h1>Beta gate not configured</h1>
<p>This deployment requires a beta code, but <code>GIGI_BETA_CODE</code> is not set, so it is
refusing to serve rather than opening the build to everyone.</p>
<p>Set <code>GIGI_BETA_CODE</code> in the environment, or set <code>GIGI_BETA_GATE=off</code> to
publish this deployment deliberately.</p></main></body></html>`;
