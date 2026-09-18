import type { Bill, Household } from './types';
import { addBill, regenerateDigest, track, logProcessing } from './store';
import { extractBill, RawEmail } from './extraction';

/**
 * Where the email came from. The trust log must not blur the two: forwarding is
 * the user handing us one message, a Gmail import is us reaching into their
 * mailbox and opening one. Same extraction, materially different act.
 */
export type IngestSource = 'forwarded' | 'gmail';

// Turn one email into an unconfirmed bill for a household, then refresh the
// digest. Shared by the inbound webhook, the in-app tester and the Gmail import.
//
// Every step is recorded in the household's trust log (data flow, not content),
// so the user can see exactly what happened with their email.
export async function ingestEmail(
  household: Household,
  email: RawEmail,
  source: IngestSource = 'forwarded',
  sourceRef?: string,
): Promise<{ engine: string; extracted: unknown; bill: Bill }> {
  const hid = household.id;

  if (source === 'gmail') {
    await logProcessing(
      hid, 'mailbox_read', 'bill', 'google',
      `GiGi opened one bill-looking email in your inbox${email.attachments?.length ? ' and its PDF attachment' : ''} to read its details`,
      'Extract the provider, price and renewal date',
      'Consent', 'Google (not EU-resident)',
    );
  } else {
    await logProcessing(
      hid, 'email_received', 'bill', 'email_service',
      'An email you forwarded arrived at GiGi',
      'You asked GiGi to watch this sender',
      'Consent',
    );
  }

  const t0 = Date.now();
  const { result, engine } = await extractBill(email);
  const took = Date.now() - t0;

  // Values the sender published as schema.org markup never went anywhere to be
  // read — no model, no heuristic. Worth its own line: it is the one path where
  // GiGi is copying a stated fact rather than interpreting anything.
  if (result.evidence.amount?.source === 'json-ld' || result.evidence.renewalDate?.source === 'json-ld') {
    await logProcessing(
      hid, 'analyzed_on_server', 'bill', 'gigi_server',
      'The sender had published the billing details in a machine-readable form — GiGi read those directly',
      'Take the amount and dates from the sender rather than interpreting the email',
      'Consent', 'EU (London)',
    );
  }

  // Record the analysis hop truthfully: AI (leaves for EU inference) vs. on-server.
  if (engine === 'anthropic' || engine === 'anthropic-failed') {
    await logProcessing(
      hid, 'sent_to_ai', 'bill', 'gigi_ai',
      'The email was sent to GiGi’s AI to be read',
      'Extract the provider, price and renewal date',
      'Consent', 'EU (inference region)', took,
    );
    await logProcessing(
      hid, 'ai_returned', 'bill', 'gigi_ai',
      'Structured fields came back; the raw email was not retained',
      'Only the extracted fields are kept',
      'Consent', 'EU (inference region)',
    );
  } else {
    await logProcessing(
      hid, 'analyzed_on_server', 'bill', 'gigi_server',
      'GiGi read the email on our server — no AI, nothing left the server',
      'Extract the provider, price and renewal date',
      'Consent', 'EU (London)', took,
    );
  }

  const bill = await addBill({
    householdId: hid,
    provider: result.provider ?? 'Unknown sender',
    type: result.type ?? 'other',
    amount: result.amount,
    currency: result.currency ?? household.currency,
    renewalDate: result.renewalDate,
    sourceAmount: result.sourceAmount,
    billingPeriod: result.billingPeriod ?? undefined,
    paymentDueDate: result.paymentDueDate,
    evidence: result.evidence,
    priceIncreaseFlag: result.priceIncreaseFlag,
    source: 'extracted',
    sourceRef,
    confirmed: false, // user confirms before monitoring — matches "null over guessing"
  });

  await logProcessing(
    hid, 'stored', 'bill', 'gigi_server',
    `A ${bill.type} bill${result.provider ? ` from ${result.provider}` : ''} was saved to your register`,
    'Track your renewal',
    'Consent', 'EU (London)',
  );

  await regenerateDigest(hid);
  await track(source === 'gmail' ? 'gmail_bill_imported' : 'email_forwarded', hid, {
    engine,
    type: bill.type,
    hasAmount: result.amount !== null,
    hasDate: result.renewalDate !== null,
    // The measurements the launch gate is written against: where each value
    // came from, and why a null was a null.
    amountSource: result.evidence.amount?.source ?? null,
    dateSource: result.evidence.renewalDate?.source ?? null,
    billingPeriod: result.billingPeriod,
    foreignCurrency: result.foreignCurrency ?? null,
  });

  return { engine, extracted: result, bill };
}
