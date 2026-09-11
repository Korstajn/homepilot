import type { Bill, Household } from './types';
import { addBill, regenerateDigest, track, logProcessing } from './store';
import { extractBill, RawEmail } from './extraction';

// Turn one forwarded email into an unconfirmed bill for a household, then
// refresh the digest. Shared by the inbound webhook and the in-app tester.
//
// Every step is recorded in the household's trust log (data flow, not content),
// so the user can see exactly what happened with their email.
export async function ingestEmail(
  household: Household,
  email: RawEmail,
): Promise<{ engine: string; extracted: unknown; bill: Bill }> {
  const hid = household.id;

  logProcessing(
    hid, 'email_received', 'bill', 'email_service',
    'An email you forwarded arrived at GiGi',
    'You asked GiGi to watch this sender',
    'Consent',
  );

  const t0 = Date.now();
  const { result, engine } = await extractBill(email);
  const took = Date.now() - t0;

  // Record the analysis hop truthfully: AI (leaves for EU inference) vs. on-server.
  if (engine === 'anthropic') {
    logProcessing(
      hid, 'sent_to_ai', 'bill', 'gigi_ai',
      'The email was sent to GiGi’s AI to be read',
      'Extract the provider, price and renewal date',
      'Consent', 'EU (inference region)', took,
    );
    logProcessing(
      hid, 'ai_returned', 'bill', 'gigi_ai',
      'Structured fields came back; the raw email was not retained',
      'Only the extracted fields are kept',
      'Consent', 'EU (inference region)',
    );
  } else {
    logProcessing(
      hid, 'analyzed_on_server', 'bill', 'gigi_server',
      'GiGi read the email on our server — no AI, nothing left the server',
      'Extract the provider, price and renewal date',
      'Consent', 'EU (London)', took,
    );
  }

  const bill = addBill({
    householdId: hid,
    provider: result.provider ?? 'Unknown sender',
    type: result.type ?? 'other',
    amount: result.amount,
    currency: result.currency ?? household.currency,
    renewalDate: result.renewalDate,
    priceIncreaseFlag: result.priceIncreaseFlag,
    source: 'extracted',
    confirmed: false, // user confirms before monitoring — matches "null over guessing"
  });

  logProcessing(
    hid, 'stored', 'bill', 'gigi_server',
    `A ${bill.type} bill${result.provider ? ` from ${result.provider}` : ''} was saved to your register`,
    'Track your renewal',
    'Consent', 'EU (London)',
  );

  regenerateDigest(hid);
  track('email_forwarded', hid, {
    engine,
    type: bill.type,
    hasAmount: result.amount !== null,
    hasDate: result.renewalDate !== null,
  });

  return { engine, extracted: result, bill };
}
