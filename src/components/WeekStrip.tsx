'use client';

import type { CalendarEvent, Child } from '@/lib/types';

/**
 * Seven days, and under each one a coloured bar per thing happening.
 *
 * The point is pre-verbal: you see that Friday is stacked and Sunday is empty
 * before you have read a single word, and you see WHOSE day it is by colour.
 * The list underneath answers "what exactly" — this answers "where is the
 * pressure this week", which is the question a household actually opens the app
 * with, and which a flat chronological list cannot answer at all.
 */

// Muted, warm-adjacent and deliberately similar in weight, so no child's colour
// shouts louder than another's. Assigned by position in the household rather
// than stored, so adding a colour column is not a prerequisite for this to work.
const CHILD_COLOURS = ['#9a6b3f', '#5f7c4a', '#4a6b7c', '#7c4a5f', '#6e8b7e'];

const CATEGORY_COLOURS: Record<CalendarEvent['category'], string> = {
  school: 'var(--upcoming)',
  travel: 'var(--accent)',
  bill: 'var(--ink)',
  appointment: 'var(--soon)',
  other: 'var(--muted)',
};

export function childColour(childId: string, children: Child[]): string {
  const index = children.findIndex((c) => c.id === childId);
  return CHILD_COLOURS[(index < 0 ? 0 : index) % CHILD_COLOURS.length];
}

/** A person's colour when the event belongs to one, the category's otherwise. */
export function colourFor(event: CalendarEvent, children: Child[]): string {
  if (event.relatedChildId) return childColour(event.relatedChildId, children);
  return CATEGORY_COLOURS[event.category];
}

function startOfWeek(now: Date): Date {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Monday-first, which is the convention in both markets GiGi serves.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d;
}

export default function WeekStrip({ events, children }: { events: CalendarEvent[]; children: Child[] }) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
  const monday = startOfWeek(now);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      letter: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i],
      date: d.getUTCDate(),
      past: iso < today,
      isToday: iso === today,
      // Four bars is the ceiling: past that the column stops being readable and
      // starts being a texture.
      items: events.filter((e) => e.start.slice(0, 10) === iso).slice(0, 4),
    };
  });

  const legend = [
    ...children.map((c) => ({ label: c.name, colour: childColour(c.id, children) })),
    { label: 'House', colour: CATEGORY_COLOURS.bill },
  ];

  return (
    <div className="card stack" style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {days.map((d) => (
          <div
            key={d.iso}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '6px 2px 8px', borderRadius: 12,
              background: d.isToday ? 'var(--brand-soft)' : 'transparent',
            }}
          >
            <span className="tiny" style={{ fontWeight: 700, color: d.isToday ? 'var(--brand-ink)' : 'var(--muted)' }}>
              {d.letter}
            </span>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600,
              // Grey means "already gone", and nothing else — an empty day still
              // reads as a normal day.
              color: d.isToday ? 'var(--brand-ink)' : d.past ? 'var(--muted)' : 'var(--ink)',
            }}>
              {d.date}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', padding: '0 4px', minHeight: 3 }}>
              {d.items.map((e) => (
                <span
                  key={e.id}
                  title={e.summary}
                  style={{ height: 3, borderRadius: 2, background: colourFor(e, children), opacity: d.past ? 0.4 : 1 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {legend.length > 1 && (
        <>
          <hr className="divider" style={{ margin: '4px 0' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px' }}>
            {legend.map((l) => (
              <span key={l.label} className="tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: 'var(--ink-soft)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.colour }} />
                {l.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
