// Domain types for the GiGi beta test build.
// These mirror db/schema.sql so the in-memory store can be swapped for Postgres
// without touching the API layer.

export type Market = 'uk' | 'se';
export type Currency = 'GBP' | 'SEK';

export type BillType =
  | 'broadband'
  | 'energy'
  | 'mobile'
  | 'tv'
  | 'insurance'
  | 'other';

// Which verticals GiGi will actually execute a switch for in the beta.
// Insurance is intentionally excluded — regulated activity (see docs/DECISIONS.md §3).
export const EXECUTABLE_BILL_TYPES: BillType[] = ['broadband', 'energy', 'mobile'];

// The period a price was quoted for. Extraction must not assume "monthly":
// a quarterly or annual total read as a monthly charge is how a £186 quarterly
// bill turned into a fabricated four-figure saving.
export type BillingPeriod = 'monthly' | 'quarterly' | 'annual' | 'one_off';

// Where a single field's value came from, in descending reliability. Kept
// per-field rather than per-bill because one bill routinely mixes them: a
// provider read from the sender, an amount read from schema.org markup, a
// renewal date a model found in prose.
export type EvidenceSource = 'json-ld' | 'table' | 'model' | 'heuristic' | 'manual' | 'seed';

export interface FieldEvidence {
  source: EvidenceSource;
  /**
   * The exact source text the value was read from — never a paraphrase, and
   * never the model's own rendering of the number. Values are re-parsed from
   * this string, so it is both the audit trail and the input.
   */
  quote: string;
}

export type BillEvidence = Partial<Record<'amount' | 'renewalDate' | 'provider', FieldEvidence>>;

export type UrgencyBand = 'today' | 'soon' | 'upcoming';

// 'home' covers household logistics that are neither a bill nor a school or
// travel matter — an appointment, an evening out that needs cover. Without it
// every calendar-derived item had to be mislabelled to fit the contract.
export type DigestItemCategory = 'bill' | 'school' | 'travel' | 'home' | 'system';

// Connection state for the forward-to-GiGi mechanism (no OAuth in beta).
export type ConnectionStatus = 'pending' | 'active' | 'degraded';

// Who can log in to a household. A family account has one owner, optional
// co-parents (adult), and optional teens (limited view — no finances, no
// execution). Younger children are Child profiles with no login.
export type MemberRole = 'owner' | 'adult' | 'teen';

export interface Member {
  id: string;
  householdId: string;
  name: string; // display handle only; strong identifiers live in the vault
  role: MemberRole;
  status: 'active' | 'invited';
  // Links to the identity vault. The member/content records never hold the
  // login email, password, or recovery code — only this opaque id.
  subjectId: string;
  inviteToken?: string; // present while status === 'invited'
  createdAt: string;
}

// Identity vault — the ONLY place strong identifiers live, kept separate from
// all content (bills/digests/processing), which is keyed by opaque ids only.
// A dump of the content store is therefore not linkable to a person.
export interface Identity {
  subjectId: string;
  email?: string; // optional — accounts can be email-free
  passwordHash?: string; // "salt:scryptHex"
  recoveryHash?: string; // sha256 of the one-time recovery code
  createdAt: string;
}

// Opaque server-side session. The cookie holds only the random token; it
// reveals nothing about the user (no member id, no PII).
export interface Session {
  token: string;
  memberId: string;
  createdAt: string;
}

// A calendar event, modelled iCalendar-compatible (RFC 5545) from day one so
// every sync path (ICS feed, per-event .ics, native device write) is clean.
export interface CalendarEvent {
  id: string; // also used as the iCal UID (stable)
  householdId: string;
  summary: string;
  description?: string;
  location?: string;
  category: 'school' | 'travel' | 'bill' | 'appointment' | 'other';
  start: string; // 'YYYY-MM-DD' when allDay, else ISO datetime
  end?: string;
  allDay: boolean;
  tzid?: string; // IANA tz for timed events
  rrule?: string; // reserved for recurrence (e.g. 'FREQ=WEEKLY;BYDAY=TU')
  alarmMinutesBefore?: number;
  source: 'manual' | 'derived'; // derived = generated from bills/children
  relatedChildId?: string;
  // The message this event was created from, e.g. 'gmail:<id>#0'. Checked
  // before creating, so re-scanning an inbox cannot duplicate what it found
  // last time.
  sourceRef?: string;
  // The exact sentence the event was read out of, when it came from an email.
  // Shown to the user: "we read this from that" is what makes a wrong date
  // correctable rather than mysterious.
  evidence?: FieldEvidence;
  createdAt: string;
  // When the event last changed. Drives LAST-MODIFIED in the ICS feed so a
  // subscriber can tell a real edit from a re-fetch of the same event.
  updatedAt?: string;
}

// A child profile (no login): used to associate school emails and travel/
// passport nudges. Sensitive data — kept minimal (see docs/DECISIONS.md, DPIA).
export interface Child {
  id: string;
  householdId: string;
  name: string;
  yearGroup?: string;
  passportExpiry?: string; // ISO date
  createdAt: string;
}

export interface Household {
  id: string;
  ownerName: string;
  email: string;
  // "salt:scryptHex". Legacy field — auth now lives on Member. Kept for the
  // owner's convenience display; the owner Member is the source of truth.
  passwordHash?: string;
  market: Market;
  currency: Currency;
  // IANA timezone, e.g. "Europe/London" or "Europe/Stockholm".
  // The 02:00 nightly / 07:00 digest jobs need this per-household.
  timezone: string;
  adults: '1' | '2' | '3+';
  children: 'none' | '1-2' | '3+';
  postcode: string;
  // Address emails get forwarded to (the "Connect" replacement for OAuth).
  forwardingAddress: string;
  connectionStatus: ConnectionStatus;
  digestTime: string; // "07:00"
  digestPaused: boolean;
  // Categories the user has "handed over" to GiGi to run end-to-end.
  handedOver?: string[];
  // Secret, revocable token for the read-only ICS subscription feed.
  calendarToken?: string;
  createdAt: string;
}

export interface Bill {
  id: string;
  householdId: string;
  provider: string;
  type: BillType;
  amount: number | null; // MONTHLY charge as stated. null over guessing.
  // The figure exactly as the bill stated it, with `billingPeriod` saying which
  // period it covers. An annual premium is kept here rather than silently
  // divided by twelve into `amount`.
  sourceAmount?: number | null;
  currency: Currency;
  renewalDate: string | null; // ISO date, null over guessing
  // The period the source actually stated, before normalising to monthly.
  // Absent means the email never said, in which case `amount` is null rather
  // than a number we assumed was per month.
  billingPeriod?: BillingPeriod;
  // Next payment due, when the source gave one. Distinct from renewalDate:
  // paying this month is not the same event as the contract ending.
  paymentDueDate?: string | null;
  // What each extracted value was read from, and the exact text it came from.
  evidence?: BillEvidence;
  priceIncreaseFlag: boolean;
  // How the bill entered the register — matters for the accuracy story.
  source: 'extracted' | 'manual' | 'seed';
  // The Gmail message this came from, when it came from a mailbox import. Also
  // what stops a second import re-adding the same bill.
  sourceRef?: string;
  confirmed: boolean;
  createdAt: string;
}

export interface DigestItem {
  id: string;
  category: DigestItemCategory;
  urgency: UrgencyBand;
  // <=10 word action line
  line: string;
  detail?: string;
  executable: boolean;
  // For saving proposals
  savingAnnual?: number;
  currentPrice?: number;
  newPrice?: number;
  relatedBillId?: string;
  status: 'open' | 'approved' | 'done' | 'dismissed';
  // Carry-forward bookkeeping
  firstSurfacedAt: string;
  carryForwardCount: number;
}

export interface Digest {
  id: string;
  householdId: string;
  date: string; // ISO date the digest is for
  // The <=4 items shown up top.
  items: DigestItem[];
  // Overflow surface: everything that couldn't fit the 4 but must not vanish.
  overflow: DigestItem[];
  // Minimum-mode line when nothing needs attention.
  quietLine?: string;
  delivered: boolean;
  openedAt?: string;
  createdAt: string;
}

export interface ActionLog {
  id: string;
  householdId: string;
  itemId: string;
  action: 'approve' | 'done' | 'dismiss';
  outcome: string;
  savingAnnual?: number;
  createdAt: string;
}

// Instrumentation — every metric in §7 of the MVP doc needs this from day one.
export interface AnalyticsEvent {
  id: string;
  householdId: string | null;
  name: string;
  props: Record<string, unknown>;
  createdAt: string;
}

export interface Feedback {
  id: string;
  householdId: string | null;
  kind: 'wrong_extraction' | 'general';
  message: string;
  relatedBillId?: string;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  email: string;
  segment: 'household' | 'company';
  source: string;
  createdAt: string;
}

// A message from the landing page's "Get in touch" form.
export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

// --- Trust log (user-facing data-processing lineage) -------------------------
// Distinct from AnalyticsEvent (which is for the founder). This is what the
// USER sees: exactly what happened with their data, in plain language. It
// records the data FLOW, never the data itself — no email bodies, no amounts.

export type ProcessingActor =
  | 'you' // the user's own action
  | 'gigi_server' // stores + analyses on our EU server
  | 'gigi_ai' // Anthropic, EU region — only when AI extraction is enabled
  | 'email_service' // inbound email provider
  | 'google' // Gmail, when the user has connected their inbox (not EU-resident)
  // The forecast service. Listed as its own actor because it is a hop out of
  // our infrastructure, however small what we send it: a coordinate pair for a
  // postal district and nothing else (src/lib/weather.ts).
  | 'weather_service'
  | 'concierge'; // founder-assisted execution / the provider a switch goes to

export type ProcessingAction =
  | 'account_created'
  | 'email_received'
  | 'analyzed_on_server'
  | 'sent_to_ai'
  | 'ai_returned'
  | 'stored'
  | 'digest_generated'
  | 'shared_for_execution'
  | 'connection_changed'
  // Gmail OAuth. Separate from 'connection_changed' (which is the
  // forward-to-GiGi address) because granting mailbox access is a materially
  // different act and the trust log must not blur the two.
  | 'inbox_connected'
  | 'inbox_disconnected'
  | 'mailbox_searched'
  // Reading a message's CONTENT, as opposed to searching its headers. A
  // separate action because it is a separate act: `mailbox_searched` can
  // honestly say "subject lines only", and this one cannot.
  | 'mailbox_read'
  | 'handover_changed'
  | 'calendar_shared'
  | 'member_invited'
  | 'member_joined'
  | 'member_removed'
  | 'child_added'
  | 'child_removed'
  // A forecast was looked up for the household's postal district. Logged like
  // every other outbound hop — a lookup the user did not ask for and cannot see
  // is exactly the kind of thing the trust log exists to make visible.
  | 'weather_checked'
  | 'data_deleted';

export interface ProcessingEvent {
  id: string;
  householdId: string;
  at: string; // ISO timestamp
  action: ProcessingAction;
  category: 'bill' | 'school' | 'digest' | 'account' | 'system';
  actor: ProcessingActor;
  // Plain-language, metadata only (may name a provider/category — never amounts
  // or email content).
  detail: string;
  purpose: string; // why it happened
  legalBasis: string; // GDPR basis in plain words
  region: string; // where it happened, e.g. "EU (London)"
  durationMs?: number;
  // Tamper-evidence: each entry hashes the previous one, so the log is
  // verifiably append-only.
  prevHash: string;
  hash: string;
}
