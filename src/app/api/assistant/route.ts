import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTodayDigest, listBills, valueSummary, logProcessing, track } from '@/lib/store';
import { currentMember, resolveHousehold, resolveMember, can } from '@/lib/auth';
import { claudeConverse, aiEnabled, ASSISTANT_MODEL } from '@/lib/anthropic';
import { ASSISTANT_TOOLS, runAssistantTool, todayIn, type ToolOutcome } from '@/lib/assistant-tools';
import { requireSession } from '@/lib/require-session';

export const dynamic = 'force-dynamic';

/**
 * The spoken assistant.
 *
 * Two kinds of fact reach GiGi here, and the split is deliberate. What GiGi
 * already holds — today's digest, the next renewals, the savings total — is
 * assembled into the prompt, because it costs nothing and it is what most
 * questions are about. What lives OUTSIDE GiGi — the forecast, the household's
 * inbox — is a tool call, because fetching it on every question would mean
 * reading somebody's mail they never asked to have read.
 *
 * GiGi used to answer "I don't have access to the weather" and "I don't have
 * access to your email" to questions it had every means to answer. It does not
 * any more; see src/lib/assistant-tools.ts for where the guards live.
 */

const SYSTEM = `You are GiGi, a warm, calm chief of staff for a household. You are speaking out loud, so:
- Always reply in English, even if the person writes in another language.
- Reply in 1–3 short sentences. No lists, no markdown. Plain spoken language.
- Be reassuring and specific. Use only the facts in the context and in tool results.
- You NEVER take actions, approve, switch, pay, send, reply or promise to do something. If asked to act, say they can tap Approve in the app — the human always decides.
- Never invent numbers, dates, providers, senders or subject lines. If you don't know, say so briefly.

YOU CAN LOOK THINGS UP. Use check_weather for anything about weather, temperature, rain, or what to wear or pack. Use check_inbox for anything about their email, new mail, or whether something needs their attention. Call the tool rather than saying you don't have access — you do.

When a tool answers available:false, say plainly what is missing and the one thing that would fix it (a postcode in Settings, connecting Gmail). Do not apologise at length.

About the inbox specifically:
- You only ever see SENDERS AND SUBJECT LINES. You have not read any message. If asked what an email says, say you can see the subject but not the contents, and they can open it or import it.
- Say how many you looked at and name the ones that need them, by sender and what the subject says. Do not list everything.
- Never repeat or summarise anything about other people's children from a subject line.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'Say something first.' }, { status: 400 });

  if (!aiEnabled()) {
    return NextResponse.json({
      configured: false,
      reply: 'Voice needs the Claude API key configured. Once it is set, I can talk you through your day.',
    });
  }

  // A model call costs money and writes to a trust log, so it needs a real
  // session rather than the demo fallback every read is allowed.
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  const { household: hh, member: me } = auth.session;
  const finance = can(me.role, 'viewFinances');
  const today = todayIn(hh.timezone);

  // Build a compact, factual context from the member's own household.
  const digest = await getTodayDigest(hh.id);
  const items = (digest?.items ?? []).filter((i) => finance || i.category !== 'bill');
  const lines: string[] = [];
  lines.push(`The person you're speaking to is ${me.name}.`);
  // Without this every relative date — "tomorrow", "this weekend" — is resolved
  // against whatever the model assumes today is, which is the one kind of date
  // error that looks entirely correct.
  lines.push(`Today is ${today} (${hh.timezone}).`);
  lines.push(items.length ? `Today's digest: ${items.map((i) => `- ${i.line}`).join(' ')}` : 'Today the digest is quiet — nothing needs attention.');
  if (finance) {
    const bills = (await listBills(hh.id)).filter((b) => b.confirmed);
    const soon = bills.filter((b) => b.renewalDate).sort((a, b) => (a.renewalDate! < b.renewalDate! ? -1 : 1)).slice(0, 3);
    if (soon.length) lines.push(`Upcoming renewals: ${soon.map((b) => `${b.provider} on ${b.renewalDate}`).join(', ')}.`);
    const v = await valueSummary(hh.id);
    lines.push(`So far GiGi has saved ${v.savedAnnual} ${v.currency} per year and handled ${v.handled} tasks.`);
  } else {
    lines.push('This person has a limited view: do not discuss bills, money, or approvals.');
  }

  // Every lookup that actually ran, in the order it ran. Built from the
  // executor's own return value rather than from anything the model said, so
  // the trust log records what happened rather than what was claimed.
  const outcomes: ToolOutcome[] = [];

  let reply = '';
  try {
    const out = await claudeConverse({
      model: ASSISTANT_MODEL,
      maxTokens: 500,
      system: SYSTEM,
      user: `Context:\n${lines.join('\n')}\n\nThey said: "${message}"`,
      tools: ASSISTANT_TOOLS,
      run: async (call) => {
        const { result, outcome } = await runAssistantTool(
          { req, household: hh, member: me, today },
          call,
        );
        outcomes.push(outcome);
        return result;
      },
    });
    reply = out.text.trim();
    // A model that spent every round calling tools and never wrote a sentence
    // would leave the card blank and the speech synthesiser silent. Say
    // something true instead of nothing.
    if (!reply) reply = 'I had a look but could not put an answer together — ask me again?';
  } catch (e) {
    console.error('assistant call failed:', e);
    return NextResponse.json({
      configured: true,
      reply: 'Sorry — I could not reach my brain just now. Try again in a moment.',
      // Surfaced during the test phase to make failures diagnosable.
      error: String((e as Error)?.message ?? e).slice(0, 300),
    });
  }

  // Transparency: a voice question is content sent to the AI. Record it.
  await logProcessing(
    hh.id, 'sent_to_ai', 'system', 'gigi_ai',
    'You asked GiGi a question by voice; it was answered by GiGi’s AI',
    'Answer your spoken question',
    'Consent', 'EU (inference region)',
  );

  // And a separate entry per outbound lookup. A weather fetch and an inbox
  // search are hops to different companies under different lawful bases, so
  // they are logged as themselves — never folded into the line above.
  for (const outcome of outcomes) {
    if (!outcome.logLine) continue;
    const isInbox = outcome.kind === 'inbox';
    await logProcessing(
      hh.id,
      isInbox ? 'mailbox_searched' : 'weather_checked',
      isInbox ? 'bill' : 'system',
      isInbox ? 'google' : 'weather_service',
      outcome.logLine,
      'Answer your spoken question',
      isInbox ? 'Consent' : 'Legitimate interest (running the service you asked for)',
      isInbox ? 'Google (not EU-resident)' : 'EU (Open-Meteo)',
    );
  }
  if (outcomes.length) {
    await track('assistant_tools_used', hh.id, { tools: outcomes.map((o) => o.label) });
  }

  return NextResponse.json({
    configured: true,
    reply,
    // What GiGi went and looked at, shown under the answer. "GiGi checked the
    // forecast and 9 subject lines" is the difference between an assistant and
    // something that quietly reads your mail.
    checked: outcomes.map((o) => o.label),
  });
}
