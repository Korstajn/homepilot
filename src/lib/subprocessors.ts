// The full list of who can ever touch a household's data. Shown to the user in
// the trust screen — nothing hidden. Kept honest to what this build actually
// does (AI is only involved when enabled).

export interface Subprocessor {
  name: string;
  role: string;
  region: string;
  data: string;
  active: boolean;
  note?: string;
}

export function subprocessors(): Subprocessor[] {
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);
  const gmailAvailable = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return [
    {
      name: 'GiGi server (Render, Frankfurt)',
      role: 'Stores your data and analyses forwarded email',
      region: 'EU',
      data: 'Your household profile, bills and digests',
      active: true,
    },
    {
      name: 'GiGi AI (Anthropic, EU region)',
      role: 'Reads a forwarded email into structured fields',
      region: 'EU',
      data:
        'One email at a time, plus its PDF invoice when you import from Gmail; ' +
        'raw text is not retained after extraction',
      active: aiEnabled,
      note: aiEnabled ? 'Enabled' : 'Not in use — analysis currently runs on our server with no AI',
    },
    {
      name: 'Inbound email service',
      role: 'Delivers the emails you forward to GiGi',
      region: 'EU',
      data: 'Emails you choose to forward',
      active: true,
      note: 'Only receives what you forward — never connected to your inbox',
    },
    {
      // Listed whenever the deployment CAN offer the Gmail grant, not only once
      // someone has taken it: the trust screen is about what is possible, and a
      // subprocessor that appears only after you have already consented is not
      // disclosure.
      name: 'Gmail (Google)',
      role: 'Lets GiGi look for bills in your inbox, read-only, if you connect it',
      region: 'Outside the EU (Google)',
      data:
        'Subject lines when GiGi searches. When you press Import, the emails you import — ' +
        'body text and PDF invoices — are read and sent for extraction; only the extracted ' +
        'fields are kept, never the email',
      active: gmailAvailable,
      note: gmailAvailable
        ? 'Optional — forwarding needs no account access at all. Disconnect any time and access is revoked at Google'
        : 'Not available on this deployment',
    },
    {
      name: 'Your concierge',
      role: 'Carries out a switch after you approve it',
      region: 'EU',
      data: 'Your name and address, only for an approved switch',
      active: true,
      note: 'Nothing is shared until you tap approve',
    },
    {
      name: 'Your calendar provider',
      role: 'Fetches your GiGi calendar feed if you subscribe',
      region: 'Depends on your provider (e.g. Apple, Google)',
      data: 'The events you choose to sync',
      active: true,
      note: 'Only if you subscribe — reset the link any time to revoke it',
    },
  ];
}
