import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { can } from '@/lib/auth';
import { listChildren, logProcessing, track } from '@/lib/store';
import { buildGmailQuery, fetchMessageContent, searchMessageIds, SCHOOL_TERMS } from '@/lib/google';
import { gmailAccessToken } from '@/lib/gmail-request';
import {
  commitSchoolPlan,
  planSchoolEmail,
  recallScan,
  rememberScan,
  type SchoolScan,
} from '@/lib/school-ingest';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

const DEFAULT_DAYS = 30;
// Each message is a Gmail fetch plus a model call inside one request. Eight is
// enough to see the behaviour on a real inbox and stays inside a serverless
// timeout; a bigger mailbox is a second run, not a longer one.
const MAX_MESSAGES = 8;

/**
 * "Show me what you would do with my school email."
 *
 * Two phases on purpose. A scan READS and PLANS, and writes nothing at all —
 * the response is the whole working: what was read, which child it matched,
 * what it would create, and the exact sentence behind every value. A second
 * call with `apply` creates only the items the household ticked, and only from
 * the plan the server itself produced.
 *
 * Two sources, because the point is to be able to try it. `gmail` reads the
 * connected inbox; `paste` runs the identical pipeline on an email pasted into
 * the app, which needs no OAuth, no verification and no waiting.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { member, household } = auth.session;
  if (!can(member.role, 'manageCalendar')) {
    return NextResponse.json({ error: 'Your account cannot add to the calendar.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    source?: 'gmail' | 'paste';
    days?: number;
    max?: number;
    email?: { from?: string; subject?: string; text?: string; date?: string };
    apply?: boolean;
    approve?: string[];
  };

  const children = await listChildren(household.id);

  // --- Phase two: create what was approved ---------------------------------
  if (body.apply) {
    const scans = recallScan(household.id);
    if (scans.length === 0) {
      return NextResponse.json({ error: 'Nothing to add — run a scan first.' }, { status: 409 });
    }
    const approve = Array.isArray(body.approve) ? body.approve.map(String) : null;
    const { created, skipped } = await commitSchoolPlan(household.id, scans, approve);
    return NextResponse.json({
      ok: true,
      created: created.map((e) => ({ id: e.id, summary: e.summary, start: e.start })),
      skipped,
    });
  }

  // --- Phase one: read and plan, writing nothing ---------------------------
  let scans: SchoolScan[];

  if (body.source === 'paste') {
    const email = {
      from: String(body.email?.from ?? '').trim(),
      subject: String(body.email?.subject ?? '').trim(),
      text: String(body.email?.text ?? '').trim(),
      // When the letter went out. Everything relative in it — "9 September",
      // "on Friday", "tomorrow" — is resolved against this rather than against
      // the moment of pasting, which is usually a different day entirely.
      date: String(body.email?.date ?? '').trim() || undefined,
    };
    if (!email.subject && !email.text) {
      return NextResponse.json({ error: 'Paste a school email (subject or body).' }, { status: 400 });
    }
    // A stable id per pasted email, so pasting the same one twice is recognised
    // as the same email rather than creating the dates all over again.
    const digest = createHash('sha256')
      .update(`${email.from}\n${email.subject}\n${email.text}\n${email.date ?? ''}`)
      .digest('hex')
      .slice(0, 16);
    scans = [await planSchoolEmail(household, children, email, `paste:${digest}`)];
    await logProcessing(
      household.id, 'analyzed_on_server', 'school', 'gigi_server',
      'You pasted a school email and GiGi read it — nothing was saved yet',
      'Show you what GiGi would put in your calendar',
      'Consent', 'EU (London)',
    );
  } else {
    const token = await gmailAccessToken(req);
    if (!token.ok) return token.response;

    const days = Number(body.days ?? DEFAULT_DAYS) || DEFAULT_DAYS;
    const max = Math.min(Math.max(Number(body.max ?? MAX_MESSAGES) || MAX_MESSAGES, 1), MAX_MESSAGES);
    const query = buildGmailQuery({ terms: SCHOOL_TERMS, days });

    const listed = await searchMessageIds(token.accessToken, query, max);
    if ('error' in listed) {
      return NextResponse.json({ error: 'Gmail rejected the search.', reason: listed.error }, { status: 502 });
    }

    await logProcessing(
      household.id, 'mailbox_searched', 'school', 'google',
      `GiGi searched the last ${days} days of your inbox for school mail and found ${listed.ids.length}`,
      'Find school email to read',
      'Consent', 'Google (not EU-resident)',
    );

    scans = [];
    for (const id of listed.ids) {
      const content = await fetchMessageContent(token.accessToken, id);
      if ('error' in content) continue;
      await logProcessing(
        household.id, 'mailbox_read', 'school', 'google',
        'GiGi opened one school-looking email to read what it asks you to do',
        'Find dates, forms and payments that need you',
        'Consent', 'Google (not EU-resident)',
      );
      scans.push(
        await planSchoolEmail(
          household,
          children,
          {
            from: content.from ?? undefined,
            subject: content.subject ?? undefined,
            text: content.text,
            // Gmail's Date header is the reference frame for every relative
            // date in the message. Fetching it and not using it was the bug.
            date: content.date ?? undefined,
            attachments: content.attachments.map((a) => ({ mediaType: a.mediaType, data: a.data })),
          },
          `gmail:${id}`,
        ),
      );
    }
  }

  rememberScan(household.id, scans);

  const planned = scans.reduce((n, s) => n + s.planned.filter((p) => !p.duplicate).length, 0);
  await track('school_scan_run', household.id, {
    source: body.source ?? 'gmail',
    messages: scans.length,
    planned,
    engine: scans[0]?.engine ?? 'none',
    childrenOnFile: children.length,
  });

  return NextResponse.json({
    ok: true,
    source: body.source ?? 'gmail',
    children: children.map((c) => ({ id: c.id, name: c.name })),
    scans,
    planned,
  });
}
