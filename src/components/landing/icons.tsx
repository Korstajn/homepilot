/**
 * Line icons for the verticals grid (landing) and things grid (story).
 * Deliberately no inline stroke/fill/size attributes: `.vert-icon svg` and
 * `.thing-icon svg` in landing.css style every icon through the parent class,
 * same as the reference design.
 */
export function BillsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20M6 15h4" />
    </svg>
  );
}

export function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      <path d="M9 11l2 2 4-4" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function BackpackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 10a6 6 0 0112 0v10a1 1 0 01-1 1H7a1 1 0 01-1-1z" />
      <path d="M9 10V7a3 3 0 016 0v3M9 16h6" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.6 12.1a1.6 1.6 0 001.6 1.3h8.6a1.6 1.6 0 001.6-1.3L21 7H6" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 9a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.5 20a2 2 0 003 0" />
    </svg>
  );
}

export function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15l-9-4V4.5a1.5 1.5 0 00-3 0V11l-9 4v2l9-2.5V19l-2.5 1.5V22l4-1 4 1v-1.5L12 19v-4.5L21 17z" />
    </svg>
  );
}

export function WineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10l-1 7a4 4 0 01-8 0z" />
      <path d="M12 14v6M9 21h6" />
    </svg>
  );
}

export function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="9" width="3.5" height="6" rx="1" />
      <rect x="18" y="9" width="3.5" height="6" rx="1" />
      <rect x="6.5" y="7" width="3" height="10" rx="1" />
      <rect x="14.5" y="7" width="3" height="10" rx="1" />
      <path d="M9.5 12h5" />
    </svg>
  );
}

/** Footer / story-CTA social link icon — self-contained, sized like ArrowIcon. */
export function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
