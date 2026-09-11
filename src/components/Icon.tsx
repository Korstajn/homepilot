// Clean, thin, monochrome line icons (stroke = currentColor, no fill, no colour).
// One consistent set across nav and UI — replaces the emoji.
import type { CSSProperties } from 'react';

const PATHS: Record<string, React.ReactNode> = {
  // Digest — list lines
  list: (<><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></>),
  // Calendar
  calendar: (<><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><line x1="3" y1="9.5" x2="21" y2="9.5" /><line x1="8" y1="2.5" x2="8" y2="6" /><line x1="16" y1="2.5" x2="16" y2="6" /></>),
  // Kids / family — two figures
  users: (<><circle cx="8.5" cy="9" r="3" /><path d="M3 19c0-2.6 2.5-4.2 5.5-4.2s5.5 1.6 5.5 4.2" /><circle cx="16.8" cy="10.4" r="2.1" /><path d="M15 15c2.6-.4 5 1 5 3.6" /></>),
  // Bills — card
  card: (<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><line x1="2.5" y1="10" x2="21.5" y2="10" /></>),
  // Hand over — check in square
  check: (<><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12.3l2.6 2.6 5-5.6" /></>),
  // Microphone
  mic: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0" /><line x1="12" y1="17" x2="12" y2="21" /><line x1="9" y1="21" x2="15" y2="21" /></>),
  // Monitor (desktop)
  monitor: (<><rect x="3" y="4" width="18" height="12" rx="2" /><line x1="8.5" y1="20" x2="15.5" y2="20" /><line x1="12" y1="16" x2="12" y2="20" /></>),
  // Smartphone (app)
  phone: (<><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><line x1="10.5" y1="18.5" x2="13.5" y2="18.5" /></>),
  // Lock (data)
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  // Plus
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  // Chevron right
  chevron: (<polyline points="9 5 16 12 9 19" />),
  // Refresh
  refresh: (<><path d="M20 12a8 8 0 1 1-2.3-5.6" /><polyline points="20 4 20 8 16 8" /></>),
  // Plane (travel)
  plane: (<path d="M21 15.5 3 11l0-2 6 1 3-6h2l-1.5 6.5L21 12z" />),
  // Sync / share arrows
  sync: (<><polyline points="4 5 4 9 8 9" /><path d="M5 13a7 7 0 0 0 12.5 3.5" /><polyline points="20 19 20 15 16 15" /><path d="M19 11a7 7 0 0 0-12.5-3.5" /></>),
};

export default function Icon({ name, size = 22, strokeWidth = 1.7, style }: { name: string; size?: number; strokeWidth?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="2" />}
    </svg>
  );
}
