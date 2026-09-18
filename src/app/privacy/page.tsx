import type { Metadata } from 'next';
import Link from 'next/link';
import LandingFooter from '@/components/landing/LandingFooter';
import LandingNav from '@/components/landing/LandingNav';
import Reveal from '@/components/landing/Reveal';
import { subprocessors } from '@/lib/subprocessors';
import '../landing.css';

export const metadata: Metadata = {
  title: 'GiGi — Privacy',
  description:
    "GiGi runs a household's admin without holding a household's identity. What we store, what we refuse to store, who can ever see it, and how to get rid of all of it.",
};

// Rendered per request rather than at build time: the subprocessor list reflects
// what this deployment actually has switched on (AI, Gmail), and a page that
// promised "AI is not in use" because that was true the day it was built would
// be the worst possible thing for this particular page to get wrong.
export const dynamic = 'force-dynamic';

const UPDATED = '18 September 2026';
const VERSION = 'v1.2';

/**
 * /privacy
 *
 * Two things were wrong with this page and they were the same thing. It was
 * built in the in-app document shell — cream app cards, the app's serif, no nav,
 * no footer, a 760px column marooned on a desktop — so the one page whose job is
 * to be trusted was the one page that did not look like GiGi. And it said eight
 * short paragraphs on a subject the whole product is staked on.
 *
 * So: the landing design system, the same nav and footer as every other public
 * page, and the actual argument. The claims here are not aspirations — every one
 * of them names the code that enforces it, because a privacy promise that is a
 * sentence rather than an architecture is worth what you paid for it.
 */
export default function Privacy() {
  const subs = subprocessors();

  return (
    <div className="landing">
      <LandingNav />

      {/* --- Hero ------------------------------------------------------- */}
      <section id="privacy-hero">
        <div className="hero-dot-grid" />
        <div className="hero-glow" />
        <div className="privacy-hero-inner">
          <Reveal visible>
            <div className="privacy-hero">
              <div className="sec-tag">Privacy</div>
              <h1>
                We built GiGi so that <em>losing your data</em> would tell a thief almost nothing.
              </h1>
              <p className="privacy-lead">
                Every household app asks for the same thing: your email, your bills, your
                children&apos;s names, your calendar. Most of them then hold all of it in one place,
                under your name, and write you a privacy policy about how much they care.{' '}
                <strong>
                  We took the other route — the product is built so that most of what you would
                  worry about, we simply never have.
                </strong>{' '}
                This page is the whole of it, in plain words.
              </p>
              <div className="privacy-meta">
                <span>Last updated {UPDATED}</span>
                <span>{VERSION}</span>
                <span>Beta · UK &amp; EU</span>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="pledges">
              <Pledge
                icon={<LockIcon />}
                title="Not stored under your name"
                body="Bills, digests and history sit against a random id. Your email and password live in a separate vault. Neither half means much without the other."
              />
              <Pledge
                icon={<EuIcon />}
                title="UK & EU only"
                body="Storage in the EU, AI inference pinned to an EU region. The one non-EU hop — Gmail — is optional, named, and yours to revoke."
              />
              <Pledge
                icon={<HandIcon />}
                title="Nothing happens without your tap"
                body="GiGi proposes. It never sends, switches, cancels, pays or replies on its own. There is no setting that turns that off."
              />
              <Pledge
                icon={<EyeIcon />}
                title="No trackers. No banner."
                body="One first-party session cookie. No analytics SDK, no third-party fonts, no pixels, no ad network, ever. Nothing to consent to."
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- Jump list --------------------------------------------------- */}
      <div className="privacy-toc">
        <div className="privacy-toc-inner">
          <span className="privacy-toc-label">On this page</span>
          <a href="#principles">Principles</a>
          <a href="#hold">What we hold</a>
          <a href="#how">How it works</a>
          <a href="#data">Data table</a>
          <a href="#children">Children</a>
          <a href="#who">Who can see it</a>
          <a href="#rights">Your rights</a>
          <a href="#privacy-contact">Contact</a>
        </div>
      </div>

      {/* --- Principles --------------------------------------------------- */}
      <section className="section" id="principles" style={{ background: 'var(--white)' }}>
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">The standard</div>
            <h2 className="sec-h">
              Four rules we <em>do not trade against</em>.
            </h2>
            <p className="sec-lead">
              Not values on a wall. Each one is a decision already taken in the code, and each one
              costs us something — which is the only reason to believe it.
            </p>
          </Reveal>

          <Reveal>
            <div className="prose">
              <h3>1. Collect the least that works, not the most that&apos;s allowed.</h3>
              <p>
                GiGi asks for a postcode, and sends the weather service the{' '}
                <strong>outward half only</strong> — &ldquo;SW1A&rdquo;, an area of thousands of
                addresses, never &ldquo;SW1A 1AA&rdquo;, which is a doorstep. When GiGi searches
                your inbox it asks Google for <strong>subject lines and senders only</strong>, using
                an API mode that cannot return a message body — not fetched and discarded, never
                requested. The cheap version of both features would have been to take everything and
                filter later. We don&apos;t, because data you never held cannot leak.
              </p>

              <h3>2. Separate who you are from what you have.</h3>
              <p>
                Your bills, digests, calendar and history are stored against a random identifier. The
                only place your email address, password and recovery code exist is a separate
                identity vault. A dump of the content store is a pile of household admin belonging to
                nobody in particular. That is a deliberately awkward way to build software, and it is
                the single most valuable thing on this page.
              </p>

              <h3>3. Never act on the household&apos;s behalf without the household.</h3>
              <p>
                GiGi reads, ranks and proposes. It has no ability to send an email, reply to a
                teacher, cancel a contract, move money or book anything. Every one of those is a
                human tap in the app, and a school scan is explicit about it: the scan reads and{' '}
                <strong>plans</strong>, showing you what it would create and the exact sentence it
                read each value from, and writes nothing at all until you tick the ones you want.
              </p>

              <h3>4. Say what happened, in words, every time.</h3>
              <p>
                Every household has a live log of everything GiGi did with their data: every email
                received, every analysis, every outbound lookup, with timestamps, the purpose, and
                the lawful basis. Each entry hashes the one before it, so the log is verifiably
                append-only — we cannot quietly edit our own history. It is in the app under{' '}
                <strong>Your data</strong>, and it includes the deletion of your account, which is
                the last thing written before there is nothing left to write about.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- What we hold / never hold ----------------------------------- */}
      <section className="section" id="hold">
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">Scope</div>
            <h2 className="sec-h">
              What we hold — and what we <em>will not take</em>.
            </h2>
            <p className="sec-lead">
              The right-hand column is the more important one. It is a list of things GiGi could
              plausibly have asked for and does not.
            </p>
          </Reveal>

          <Reveal>
            <div className="never-grid">
              <div className="never-col">
                <div className="never-h">What GiGi holds</div>
                <ul>
                  <li>Your household profile: market, timezone, postcode, adults and children as counts.</li>
                  <li>The bills you confirm — provider, amount, renewal date — and the quote each value was read from.</li>
                  <li>The emails you forward to your GiGi address, and the fields extracted from them.</li>
                  <li>Your children&apos;s first names and, if you add them, year group and passport expiry.</li>
                  <li>Calendar items you or GiGi create, each carrying the sentence it came from.</li>
                  <li>Your morning digests and what you did with them.</li>
                  <li>In the identity vault, separately: an email and password hash, or just a recovery code hash.</li>
                </ul>
              </div>
              <div className="never-col dark">
                <div className="never-h">What GiGi never takes</div>
                <ul>
                  <li>Your bank, your card, your account numbers. GiGi never touches money.</li>
                  <li>Your full postcode beyond our own server — the weather service sees a postal district.</li>
                  <li>The contents of your inbox. Searching sees subject lines; only an import you press reads a message.</li>
                  <li>Anything about other families&apos; children — dropped in code, not asked of the AI.</li>
                  <li>Your location. No GPS, no IP geolocation, no &ldquo;approximate location&rdquo; permission.</li>
                  <li>Your contacts, your photos, your microphone in the background.</li>
                  <li>Behavioural profiles, ad identifiers, or anything sold, shared or rented to anyone. Ever, at any price.</li>
                </ul>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="callout">
              <div className="callout-title">You can use GiGi without telling us your name.</div>
              <p>
                Sign up with no email at all and we hand you a one-time recovery code instead. Then
                the identity vault holds a hash of a code we have never seen, and the content store
                holds household admin against a random id. We would have no way to tell you apart
                from anyone else, which is rather the point.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- How it works ------------------------------------------------- */}
      <section className="section" id="how" style={{ background: 'var(--white)' }}>
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">Architecture</div>
            <h2 className="sec-h">
              The promises are <em>structural</em>.
            </h2>
            <p className="sec-lead">
              Anyone can write &ldquo;we respect your privacy&rdquo;. Here is where each claim
              actually lives.
            </p>
          </Reveal>

          <Reveal>
            <div className="prose">
              <h3>Email reaches us because you forwarded it</h3>
              <p>
                The default way in is a forwarding address of your own. No account access, no OAuth,
                no scopes — GiGi sees the emails you chose to send it and has no idea the rest exist.
                Connecting Gmail is an <em>option</em> on top of that, not the price of entry, and it
                is read-only: the grant GiGi asks for cannot send, delete, label or modify anything.
              </p>

              <h3>Searching your inbox and reading a message are two different acts</h3>
              <p>
                They are separate functions, with separate entries in your log. A search asks Google
                for headers under an allow-list — sender, subject, date — and is the only thing GiGi
                does on its own initiative. Reading a message body and its PDF invoice happens when
                you press Import, and is logged as what it is. We keep those apart in the code
                precisely so that &ldquo;GiGi only read subject lines&rdquo; stays a fact we can
                prove rather than a habit we might drift out of.
              </p>

              <h3>Your calendar is read, never written</h3>
              <p>
                If you connect Google, you can bring your own calendars into GiGi so the
                household&apos;s week is in one place. It goes <strong>one way</strong>: GiGi reads,
                and has no ability to add, move or delete anything in your calendar — there is no
                code in the product that could. You pick which calendars, one at a time, and none
                are read until you do; a Google account carries holidays, birthdays and whatever
                anyone has ever shared with it, and importing all of that would be the opposite of
                what GiGi is for. Turn a calendar off and everything imported from it is deleted
                here, not hidden.
              </p>
              <p>
                Note that mail and calendar are <em>separate</em> permissions. Connecting one does
                not grant the other, which is why GiGi asks again rather than quietly widening what
                an existing connection can reach.
              </p>

              <h3>The AI is given one email, and asked to point rather than remember</h3>
              <p>
                Extraction sends one email at a time to Claude, running in an EU region. The model is
                not asked to transcribe a number; it is asked to find where the number is and quote
                the source text, and our own code re-reads the value out of that quote. It is why
                every figure in GiGi can show you the sentence it came from — and why the raw email
                text is not kept afterwards. Nothing you forward is used to train anyone&apos;s model.
              </p>

              <h3>Your Gmail credential is not on our server</h3>
              <p>
                If you connect an inbox, the refresh token is encrypted and stored in a cookie in
                your own browser, not in our database. We cannot read your mail while you are not
                there, and a breach of our infrastructure does not hand anyone your mailbox. The
                honest trade-off: it also means GiGi cannot check your inbox overnight on your
                behalf, only when you ask. We think that is the right side of the trade.
              </p>

              <h3>The forecast does not know who asked</h3>
              <p>
                Your browser never talks to the weather service. Our server asks, on behalf of a
                postal district, with a coordinate pair rounded to about a kilometre — so no IP
                address of yours is exposed either. The service has no account and no API key, and
                receives nothing that identifies a household.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- Data table ---------------------------------------------------- */}
      <section className="section" id="data">
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">In detail</div>
            <h2 className="sec-h">
              Every category, <em>why we have it</em>, and for how long.
            </h2>
            <p className="sec-lead">
              The lawful basis under UK GDPR and the EU GDPR, written the way you would say it out
              loud.
            </p>
          </Reveal>

          <Reveal>
            <div className="ptable-wrap">
              <table className="ptable">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Why we have it</th>
                    <th>Lawful basis</th>
                    <th>Kept for</th>
                  </tr>
                </thead>
                <tbody>
                  {DATA_ROWS.map((r) => (
                    <tr key={r.what}>
                      <td>{r.what}</td>
                      <td>{r.why}</td>
                      <td>{r.basis}</td>
                      <td>{r.kept}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The same rows as cards, for widths where four columns stop being
                readable. One source array, so the two can never disagree. */}
            {DATA_ROWS.map((r) => (
              <div className="ptable-card" key={`card-${r.what}`}>
                <h4>{r.what}</h4>
                <dl>
                  <dt>Why</dt>
                  <dd>{r.why}</dd>
                  <dt>Basis</dt>
                  <dd>{r.basis}</dd>
                  <dt>Kept</dt>
                  <dd>{r.kept}</dd>
                </dl>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* --- Children ------------------------------------------------------ */}
      <section className="section" id="children" style={{ background: 'var(--white)' }}>
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">Children</div>
            <h2 className="sec-h">
              A school email is full of <em>other people&apos;s children</em>.
            </h2>
            <p className="sec-lead">
              Class lists, &ldquo;well done to&rdquo;, quoted replies from other parents. This is the
              part of GiGi we are most careful about, and the part where instructing an AI to behave
              would not have been good enough.
            </p>
          </Reveal>

          <Reveal>
            <div className="prose">
              <p>
                <strong>The rule is enforced in code, not in a prompt.</strong> An instruction to a
                model is a mitigation; it is not a guarantee, and it fails silently. So GiGi is built
                so that the failure cannot happen:
              </p>
              <p>
                The only names GiGi ever looks for are the children <em>you</em> entered. A name it
                does not already know is a name it cannot record. And because every value GiGi keeps
                carries the sentence it was read from, any sentence naming a child who is not in your
                household is <strong>dropped whole</strong> — on the AI path and the deterministic
                path alike. Nothing about them is stored, summarised or counted beyond a number:
                &ldquo;3 mentions of other children ignored&rdquo;, shown to you so you can see the
                rule working.
              </p>
              <p>
                Personal parent-to-parent messages are ignored outright. GiGi is looking for a form
                to sign, a kit bag to pack and a date to put in a calendar — not for a conversation.
              </p>
              <p>
                GiGi is a service for adults running a household. It is not directed at children, and
                children do not have accounts. A teen can be added as a member with a limited view —
                no finances, no approvals — at the household owner&apos;s choice.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- Subprocessors -------------------------------------------------- */}
      <section className="section" id="who">
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">Subprocessors</div>
            <h2 className="sec-h">
              Everyone who can <em>ever</em> touch it.
            </h2>
            <p className="sec-lead">
              The complete list — not the ones we think are interesting. This is generated from the
              running system, so it is what this deployment actually has switched on, and the same
              list appears inside the app.
            </p>
          </Reveal>

          <Reveal>
            <div className="sub-grid">
              {subs.map((s) => {
                const flag = regionFlag(s.region);
                return (
                  <div className={`sub${s.active ? '' : ' off'}`} key={s.name}>
                    <div className="sub-head">
                      <span className="sub-name">{s.name}</span>
                      {/* The pill is a one-word verdict; the full region string
                          stays in the title so nothing is lost by shortening it. */}
                      <span className={`sub-flag ${flag.tone}`} title={s.region}>
                        {flag.label}
                      </span>
                    </div>
                    <div className="sub-role">{s.role}</div>
                    <div className="sub-data">{s.data}</div>
                    {s.note && <div className="sub-note">{s.note}</div>}
                  </div>
                );
              })}
            </div>
          </Reveal>

          <Reveal>
            <div className="callout">
              <div className="callout-title">One of these is outside the EU, and we say so.</div>
              <p>
                Gmail is Google&apos;s, and Google is not EU-resident. That is why connecting an
                inbox is optional rather than required, why the default route into GiGi is a
                forwarding address that needs no account access at all, and why it is listed here
                whether or not you have ever used it. Transfers rely on the standard contractual
                clauses and Google&apos;s Data Processing Addendum. Disconnect at any time and the
                grant is revoked at Google, not merely forgotten by us.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- Rights -------------------------------------------------------- */}
      <section className="section" id="rights" style={{ background: 'var(--white)' }}>
        <div className="section-inner">
          <Reveal>
            <div className="sec-tag">Your controls</div>
            <h2 className="sec-h">
              Rights you can exercise <em>without asking us</em>.
            </h2>
            <p className="sec-lead">
              A right that needs a support ticket is a right on paper. These are buttons in the app,
              and they work immediately.
            </p>
          </Reveal>

          <Reveal>
            <div className="rights-grid">
              {RIGHTS.map((r) => (
                <div className="right" key={r.name}>
                  <div className="right-name">{r.name}</div>
                  <div className="right-body">{r.body}</div>
                  <div className="right-how">{r.how}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal>
            <div className="prose" style={{ marginTop: 40 }}>
              <h3>Deletion means deletion</h3>
              <p>
                One tap removes your household, your bills, your digests, your calendar items and
                your children&apos;s details, and clears the identity vault entry that links them to
                a login. The deletion itself is the final entry in your log, so the record of it
                exists for exactly as long as you can still read the log. Backups roll off within 30
                days. We do not keep a &ldquo;deleted&rdquo; copy for analytics, because there are no
                analytics on your content.
              </p>
              <h3>If we ever get it wrong</h3>
              <p>
                You can complain to us at{' '}
                <a href="mailto:privacy@getgigiapp.com">privacy@getgigiapp.com</a>, and to your data
                protection authority — in the UK the Information Commissioner&apos;s Office, and in
                the EU your national supervisory authority. You do not need to go through us first.
              </p>
              <h3>If this page changes</h3>
              <p>
                Material changes are announced in the app and in your morning digest before they take
                effect, with the version and date at the top of this page updated. We will not
                quietly widen what GiGi collects and tell you in a footer.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- Contact -------------------------------------------------------- */}
      <section id="privacy-contact">
        <div className="pc-inner">
          <div>
            <h2 className="pc-h">Ask us anything about this.</h2>
            <p className="pc-body" style={{ marginTop: 14 }}>
              A real person reads{' '}
              <a href="mailto:privacy@getgigiapp.com">privacy@getgigiapp.com</a>, and &ldquo;why do
              you need that?&rdquo; is a question we like getting. If the answer is that we
              don&apos;t need it, we will stop collecting it.
            </p>
            <p className="pc-body" style={{ marginTop: 14 }}>
              Already using GiGi? Everything on this page is visible in your own account under{' '}
              <Link href="/app/data">Your data</Link>.
            </p>
          </div>
          <div className="pc-rows">
            <div className="pc-row">
              <span>Controller</span>
              <span>GiGi Ltd, London, UK</span>
            </div>
            <div className="pc-row">
              <span>Privacy contact</span>
              <span>privacy@getgigiapp.com</span>
            </div>
            <div className="pc-row">
              <span>Storage</span>
              <span>Supabase, EU region</span>
            </div>
            <div className="pc-row">
              <span>AI inference</span>
              <span>EU region</span>
            </div>
            <div className="pc-row">
              <span>Registration</span>
              <span>With the relevant authority before launch</span>
            </div>
            <div className="pc-row">
              <span>DPIA</span>
              <span>Completed before any household is onboarded</span>
            </div>
            <div className="pc-row">
              <span>This version</span>
              <span>
                {VERSION} · {UPDATED}
              </span>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}

// --- Content ----------------------------------------------------------------

const DATA_ROWS = [
  {
    what: 'Household profile',
    why: 'Market, currency, timezone and postal area decide what a renewal date means, when your digest arrives, and what the weather is doing at eight in the morning.',
    basis: 'Contract — this is the service',
    kept: 'Until you delete your account',
  },
  {
    what: 'Bills you confirm',
    why: 'Provider, amount, period and renewal date, plus the quote each was read from, so GiGi can warn you before a contract rolls over.',
    basis: 'Contract',
    kept: 'Until you delete the bill or the account',
  },
  {
    what: 'Emails you forward',
    why: 'Read once into structured fields. The extracted values are kept; the raw message is not retained after extraction.',
    basis: 'Contract',
    kept: 'Extracted fields only',
  },
  {
    what: 'Gmail connection',
    why: 'An encrypted refresh token, held in a cookie in your browser rather than on our server, so GiGi can search headers when you ask.',
    basis: 'Consent — optional, revocable',
    kept: 'Until you disconnect; Google expires it weekly during the beta',
  },
  {
    what: 'Google calendars you tick',
    why: 'The title, date, time and location of events in a window around today, copied in so your own commitments sit alongside the rest of the household. One way: GiGi reads and never writes.',
    basis: 'Consent — optional, per calendar, revocable',
    kept: 'Until you untick the calendar or disconnect, then deleted',
  },
  {
    what: 'Children you add',
    why: 'A first name, optionally a year group and a passport expiry — so a school letter can be matched to the right child and a trip checked against a passport.',
    basis: 'Contract, at the parent’s instruction',
    kept: 'Until you remove the child or the account',
  },
  {
    what: 'Calendar items',
    why: 'School dates, renewals and trips, each carrying the sentence it was read from so a wrong date is correctable rather than mysterious.',
    basis: 'Contract',
    kept: 'Until deleted',
  },
  {
    what: 'Login credentials',
    why: 'An email and a password hash, or only a hash of a recovery code. Held in a separate identity vault, linked to your content by an opaque id.',
    basis: 'Contract',
    kept: 'Until account deletion',
  },
  {
    what: 'Processing log',
    why: 'The plain-language record of everything GiGi did with your data. Hash-chained, so it is verifiably append-only.',
    basis: 'Legal obligation — accountability',
    kept: 'For the life of the account, deleted with it',
  },
  {
    what: 'Product analytics',
    why: 'Counts of events like “a digest was opened”, against a household id. No content, no cross-site tracking, no third-party SDK.',
    basis: 'Legitimate interest — making the product work',
    kept: 'Aggregated, deleted with the account',
  },
  {
    what: 'Session cookie',
    why: 'One first-party, strictly necessary cookie carrying an opaque signed token. It is what keeps you logged in.',
    basis: 'Strictly necessary — no consent banner required',
    kept: '30 days, or until you log out',
  },
];

const RIGHTS = [
  {
    name: 'See everything',
    body: 'The full processing log, in plain language, with timestamps, purpose and lawful basis — plus a check that the chain has not been tampered with.',
    how: 'App → Your data',
  },
  {
    name: 'Take it with you',
    body: 'One file with your household, bills, calendar, digests and log, as structured JSON you can read without us.',
    how: 'App → Your data → Download everything',
  },
  {
    name: 'Delete all of it',
    body: 'One tap, immediate, irreversible. The deletion is itself recorded, as proof it happened.',
    how: 'App → Settings → Delete account',
  },
  {
    name: 'Cut off the inbox',
    body: 'Disconnect Gmail and the grant is revoked at Google, not just dropped by us. Forwarding needs no connection at all.',
    how: 'App → Settings → Disconnect',
  },
  {
    name: 'Correct what’s wrong',
    body: 'Every value shows the sentence it was read from. Edit it, and the correction is what GiGi uses from then on.',
    how: 'Any bill or calendar item',
  },
  {
    name: 'Turn GiGi down',
    body: 'Pause the digest, hand back a category, or narrow what GiGi watches. Nothing is all-or-nothing.',
    how: 'App → Settings',
  },
];

// --- Small pieces -------------------------------------------------------------

/**
 * A subprocessor's region, reduced to a pill.
 *
 * The full strings ("Depends on your provider (e.g. Apple, Google)") are the
 * right thing to say in a sentence and the wrong thing to put in a badge, so the
 * badge carries the verdict and the sentence stays in the tooltip. Anything not
 * clearly inside the EU reads as outside it — an unknown region is never quietly
 * rounded down to "fine".
 */
function regionFlag(region: string): { label: string; tone: 'eu' | 'out' } {
  if (/outside/i.test(region)) return { label: 'Outside the EU', tone: 'out' };
  if (/depends/i.test(region)) return { label: 'Your provider', tone: 'out' };
  if (/^eu\b/i.test(region.trim())) return { label: 'EU', tone: 'eu' };
  return { label: region, tone: 'out' };
}

function Pledge({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="pledge">
      <div className="pledge-icon">{icon}</div>
      <div className="pledge-title">{title}</div>
      <div className="pledge-body">{body}</div>
    </div>
  );
}

/* Icons follow the landing convention: no stroke/size attributes here, so
   `.pledge-icon svg` is the single place their weight and colour are set. */
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 018 0v3M12 14.5v2.5" />
    </svg>
  );
}

function EuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 11V5.5a1.5 1.5 0 013 0V11m0 0V4.5a1.5 1.5 0 013 0V11m0 0V7.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.2a5 5 0 01-3.9-1.9L6 15.5a1.6 1.6 0 012.5-2L9 14V11z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M4 20L20 4" />
    </svg>
  );
}
