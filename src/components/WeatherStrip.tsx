'use client';

import { useEffect, useState } from 'react';
import type { ClothingAdvice, WeatherDay } from '@/lib/weather';

interface WeatherResponse {
  available: boolean;
  reason?: string;
  area?: string;
  days?: WeatherDay[];
  advice?: ClothingAdvice[];
}

/**
 * "What do they need today" — the weather as a kit list, not a forecast.
 *
 * Deliberately shows the reading alongside the advice. A parent who can see
 * "8°C at 8am, 70% rain" next to "waterproof coat" can overrule it; one shown
 * only the conclusion has to either trust it or ignore it. That is the same
 * evidence rule the bill screens follow.
 *
 * Renders nothing at all when there is no forecast. An empty strip is better
 * than a box apologising for itself on every screen, and the Settings prompt
 * for a missing postcode belongs on Settings.
 */
export default function WeatherStrip({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/weather')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ available: false }));
  }, []);

  if (!data || !data.available || !data.days?.length || !data.advice?.length) return null;

  const days = data.days;
  const advice = data.advice;
  const today = advice[0];
  const todayDay = days[0];

  return (
    <div className="card weather-card">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <span className="badge-cat">Today&apos;s weather · {data.area}</span>
          <h3 style={{ margin: '2px 0 4px' }}>{today.headline}</h3>
          <p className="small" style={{ margin: 0 }}>{today.detail}</p>
        </div>
        <div className="weather-temp">
          <b>{Math.round(todayDay.tempMaxC)}°</b>
          <span>{Math.round(todayDay.tempMinC)}°</span>
        </div>
      </div>

      {today.items.length > 0 && (
        <div className="weather-items">
          {today.items.map((item) => (
            <span key={item} className="pill brand">{item}</span>
          ))}
        </div>
      )}

      {/* The morning reading, stated plainly — this is the number the advice is
          built from, and the whole point is that it is checkable. */}
      {todayDay.schoolRun && (
        <p className="tiny muted" style={{ margin: '10px 0 0' }}>
          Read from the 8am forecast: {Math.round(todayDay.schoolRun.feelsLikeC)}°C feels-like,{' '}
          {todayDay.schoolRun.precipitationChance}% rain.
        </p>
      )}

      {!compact && (
        <>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide the week' : 'The rest of the week'}
          </button>
          {expanded && (
            <div className="weather-week">
              {days.slice(1).map((d, i) => {
                const a = advice[i + 1];
                return (
                  <div key={d.date} className="weather-day">
                    <div className="weather-day-head">
                      <b>{shortDay(d.date)}</b>
                      <span className="tiny muted">
                        {Math.round(d.tempMinC)}–{Math.round(d.tempMaxC)}°
                      </span>
                    </div>
                    <span className="tiny muted">{d.description}</span>
                    <div className="small" style={{ marginTop: 4 }}>
                      {a && a.items.length > 0 ? a.items.join(', ') : 'nothing extra'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function shortDay(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
}
