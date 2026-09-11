// The "Hand over" categories — what the user can delegate to GiGi to run
// end-to-end (not just remind about). Default: 3 of 7 live.
export interface HandoverCategory {
  id: string;
  title: string;
  icon: string;
  blurb: string; // GiGi's first-person description of what it does when live
}

export const HANDOVER_CATEGORIES: HandoverCategory[] = [
  { id: 'bills', title: 'Bills & contracts', icon: '💳', blurb: 'I monitor continuously and propose switches — you approve before anything changes.' },
  { id: 'school', title: 'School & children', icon: '🎒', blurb: 'I read emails & forwarded messages, prepare what’s needed, and flag anything for your approval.' },
  { id: 'travel', title: 'Travel & social', icon: '✈️', blurb: 'I watch trips and events, and nudge you at the right lead time — passports, babysitters, prep.' },
  { id: 'appointments', title: 'Appointments & health', icon: '🩺', blurb: 'I keep track of appointments and renewals, and remind you before they lapse.' },
  { id: 'subscriptions', title: 'Subscriptions', icon: '🔁', blurb: 'I spot recurring charges and free trials, and surface ones worth cancelling.' },
  { id: 'documents', title: 'Documents & renewals', icon: '📄', blurb: 'I track expiry dates — passports, licences, warranties — and prompt in good time.' },
  { id: 'deliveries', title: 'Deliveries & returns', icon: '📦', blurb: 'I follow orders and return windows so nothing is missed.' },
];

export const DEFAULT_HANDED_OVER = ['bills', 'school', 'travel'];
