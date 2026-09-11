import { NextResponse } from 'next/server';
import { getTodayDigest, listBills, valueSummary, logProcessing } from '@/lib/store';
import { resolveHousehold, resolveMember, can } from '@/lib/auth';
import { claudeText, aiEnabled, ASSISTANT_MODEL } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';

const SYSTEM = `You are GiGi, a warm, calm chief of staff for a household. You are speaking out loud, so:
- Always reply in English, even if the person writes in another language.
- Reply in 1–3 short sentences. No lists, no markdown. Plain spoken language.
- Be reassuring and specific. Use only the facts in the context provided.
- You can tell them what's on today's digest, what bills renew soon, and how much has been saved.
- You NEVER take actions, approve, switch, pay, or promise to do something. If asked to act, say they can tap Approve in the app — the human always decides.
- Never invent numbers, dates, or providers. If you don't know, say so briefly.`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message = String(body.message ?? '').trim();
  if (!message) return NextResponse.json({ error: 'Say something first.' }, { status: 400 });

  if (!aiEnabled()) {
    return NextResponse.json({
      configured: false,
      reply: 'Voice needs the Claude API key configured. Once it is set, I can talk you through your day.',
    });
  }

  const hh = resolveHousehold();
  const me = resolveMember();
  const finance = can(me.role, 'viewFinances');

  // Build a compact, factual context from the member's own household.
  const digest = getTodayDigest(hh.id);
  const items = (digest?.items ?? []).filter((i) => finance || i.category !== 'bill');
  const lines: string[] = [];
  lines.push(`The person you're speaking to is ${me.name}.`);
  lines.push(items.length ? `Today's digest: ${items.map((i) => `- ${i.line}`).join(' ')}` : 'Today the digest is quiet — nothing needs attention.');
  if (finance) {
    const bills = listBills(hh.id).filter((b) => b.confirmed);
    const soon = bills.filter((b) => b.renewalDate).sort((a, b) => (a.renewalDate! < b.renewalDate! ? -1 : 1)).slice(0, 3);
    if (soon.length) lines.push(`Upcoming renewals: ${soon.map((b) => `${b.provider} on ${b.renewalDate}`).join(', ')}.`);
    const v = valueSummary(hh.id);
    lines.push(`So far GiGi has saved ${v.savedAnnual} ${v.currency} per year and handled ${v.handled} tasks.`);
  } else {
    lines.push('This person has a limited view: do not discuss bills, money, or approvals.');
  }

  let reply = '';
  try {
    const out = await claudeText({
      model: ASSISTANT_MODEL,
      maxTokens: 300,
      system: SYSTEM,
      user: `Context:\n${lines.join('\n')}\n\nThey said: "${message}"`,
    });
    reply = out.text.trim();
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
  logProcessing(
    hh.id, 'sent_to_ai', 'system', 'gigi_ai',
    'You asked GiGi a question by voice; it was answered by GiGi’s AI',
    'Answer your spoken question',
    'Consent', 'EU (inference region)',
  );

  return NextResponse.json({ configured: true, reply });
}
