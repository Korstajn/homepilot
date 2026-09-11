import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { BETA_COOKIE, gateDiagnostics, gateMode, hasValidBetaCookie } from '@/lib/beta';

/**
 * Beta gate. When it is raised, everything on the origin — pages AND API
 * routes — sits behind one shared code.
 *
 * It is raised only by GIGI_BETA_GATE=on (see gateMode). Unset, this
 * middleware is a pass-through on the first line and the build serves openly,
 * which is how it runs on its `*.vercel.app` hostnames until a real domain is
 * attached. Being ungated does not make it indexable — robots.ts handles that
 * separately and still disallows everything.
 *
 * Excluded from the matcher below (they must stay reachable or the gate can't
 * be opened at all): the gate screen itself, its API route, Next's static
 * assets, and robots.txt.
 */
export async function middleware(req: NextRequest) {
  const mode = gateMode();
  if (mode === 'off') return NextResponse.next();

  if (mode === 'misconfigured') {
    return new NextResponse(misconfiguredHtml(), {
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/**
 * The 503 page reports what this build can see, so the fix is one look instead
 * of a round of guessing. It never prints the code — only whether one arrived.
 */
function misconfiguredHtml(): string {
  const d = gateDiagnostics();
  const yes = '<b class="bad">not visible to this build</b>';

  // The two ways this goes wrong in practice, told apart by VERCEL_ENV.
  const preview =
    d.vercelEnv && d.vercelEnv !== 'production'
      ? `<p class="hint">This is a <b>${escapeHtml(d.vercelEnv)}</b> deployment${
          d.gitRef ? ` of <code>${escapeHtml(d.gitRef)}</code>` : ''
        }. A variable scoped to <b>Production</b> only is invisible here — tick
        <b>Preview</b> (and Development) on <code>GIGI_BETA_CODE</code> too, then redeploy.</p>`
      : '';

  const rebuild = `<p class="hint">Changing a variable in the dashboard does not touch deployments
    that already exist — <b>redeploy</b> after saving it, and check that the deployment you then
    open is the one you redeployed.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>GiGi — not configured</title>
<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F2EC;color:#0D0F0C;
font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:24px;line-height:1.6}
main{max-width:38em}h1{font-size:1.5rem;margin:0 0 .6em}p{color:#3A3D38}
code{background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:6px;padding:2px 6px;font-size:.95em}
table{border-collapse:collapse;margin:1.4em 0;font-size:.92rem;width:100%}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid rgba(0,0,0,.08)}
th{color:#7A7D76;font-weight:500;white-space:nowrap}
.bad{color:#B4342F}.hint{background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:14px 16px}
</style></head>
<body><main>
<h1>Beta gate not configured</h1>
<p>This deployment asks for a beta gate (<code>GIGI_BETA_GATE=on</code>), but
<code>GIGI_BETA_CODE</code> is ${yes}, so it is refusing to serve rather than opening the
build to everyone.</p>
<table>
<tr><th>GIGI_BETA_CODE</th><td>${d.codeVisible ? 'visible' : '<b class="bad">not set</b>'}</td></tr>
<tr><th>GIGI_BETA_GATE</th><td><code>${escapeHtml(d.gateOverride)}</code></td></tr>
<tr><th>NODE_ENV</th><td><code>${escapeHtml(d.nodeEnv)}</code></td></tr>
${d.vercelEnv ? `<tr><th>VERCEL_ENV</th><td><code>${escapeHtml(d.vercelEnv)}</code></td></tr>` : ''}
${d.gitRef ? `<tr><th>Branch</th><td><code>${escapeHtml(d.gitRef)}</code></td></tr>` : ''}
</table>
${preview}
${rebuild}
<p>Set a code to raise the gate, or remove <code>GIGI_BETA_GATE</code> to serve this
deployment ungated on purpose.</p>
</main></body></html>`;
}
