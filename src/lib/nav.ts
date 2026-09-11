// Shared navigation used by both the mobile tab bar and the desktop sidebar.
export interface NavItem { href: string; label: string; icon: string; cap: string | null }

export const NAV: NavItem[] = [
  { href: '/app/digest', label: 'Digest', icon: 'list', cap: null },
  { href: '/app/calendar', label: 'Calendar', icon: 'calendar', cap: null },
  { href: '/app/kids', label: 'Kids', icon: 'users', cap: null },
  { href: '/app/bills', label: 'Bills', icon: 'card', cap: 'viewFinances' },
  { href: '/app/handover', label: 'Handover', icon: 'check', cap: 'viewFinances' },
];
