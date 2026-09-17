import { NextResponse } from 'next/server';
import { resolveHousehold } from '@/lib/auth';
import { logProcessing } from '@/lib/store';
import { adviceWeek, getForecast } from '@/lib/weather';

export const dynamic = 'force-dynamic';

/**
 * The household's week of weather, already turned into "what to put them in".
 *
 * The raw forecast is returned alongside the advice on purpose: the advice is a
 * set of thresholds someone may well disagree with, and a parent who can see
 * "8°C, 70% rain" next to "waterproof coat" can judge it for themselves. Every
 * other GiGi reading shows its evidence; this one is no different.
 *
 * `available: false` is a real answer, not an error. No postcode, an
 * unrecognised one, or a forecast service that did not answer all mean GiGi
 * knows nothing about today's weather — and the UI says so rather than showing
 * a stale or invented day.
 */
export async function GET() {
  const hh = resolveHousehold();
  const outlook = await getForecast(hh);

  if (!outlook) {
    return NextResponse.json({
      available: false,
      reason: hh.postcode
        ? 'The forecast could not be fetched right now.'
        : 'Add your postcode in Settings and GiGi can tell you what to dress them in.',
    });
  }

  // Logged as its own outbound hop. What left the server was a coordinate pair
  // for a postal district — recorded here in the same plain language as every
  // other entry, so the user can see the lookup happened and what it involved.
  logProcessing(
    hh.id,
    'weather_checked',
    'system',
    'weather_service',
    `Looked up the forecast for ${outlook.area} — the postal district only, never your full postcode`,
    'Tell you what the children need to leave the house in',
    'Legitimate interest (running the service you asked for)',
    'EU (Open-Meteo)',
  );

  return NextResponse.json({
    available: true,
    area: outlook.area,
    timezone: outlook.timezone,
    fetchedAt: outlook.fetchedAt,
    days: outlook.days,
    advice: adviceWeek(outlook),
  });
}
