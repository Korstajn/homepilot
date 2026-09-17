// Weather — the signal behind "what do the children need to leave the house in".
//
// GiGi's job on a school morning is not to report the forecast, it is to say
// what has to be in the bag. That is a different question, and it is answered
// here in three parts:
//
//   1. WHERE. A postcode is a strong identifier — it locates a household to a
//      handful of doors. So the only thing that ever leaves this server is the
//      OUTWARD code ("SW1A", not "SW1A 1AA"), which is an area of thousands of
//      addresses. The household's browser never talks to the weather service at
//      all: the server fetches, so no IP address of theirs is exposed either.
//      See docs/PRIVACY_ARCHITECTURE.md.
//
//   2. WHAT. Open-Meteo, because it needs no API key and no account, and it is
//      hosted in the EU — the same constraint that pins inference to an EU
//      region applies to every other hop. Nothing household-identifying is sent
//      with the request: a latitude and a longitude, rounded, and nothing else.
//
//   3. WHEN. The daily maximum is the wrong number for a school run. A day that
//      peaks at 18°C at three in the afternoon can be 4°C and raining at eight
//      in the morning, and it is the eight o'clock figure that decides whether
//      a coat goes on. So the hourly series is read at the school-run hour and
//      the advice is built from THAT, with the day's figures as context.
//
// The same rule as extraction applies: null over guessing. If the forecast
// cannot be fetched, every caller gets `null` and GiGi says nothing about the
// weather, rather than inventing a day.

import type { Household } from './types';

// The hour a school run actually happens. Advice built off the daily max is
// advice for the wrong moment of the day.
const SCHOOL_RUN_HOUR = 8;
// Second look: the walk home, when a morning that started dry often has not.
const HOME_TIME_HOUR = 16;

const FORECAST_DAYS = 7;
// The forecast for a given day barely moves within an hour, and a household
// opening the app five times before breakfast should cost one request, not five.
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

/** One day, reduced to the handful of numbers a parent actually acts on. */
export interface WeatherDay {
  date: string; // YYYY-MM-DD, local to the household
  /** WMO code as published by the service — kept so `describeCode` stays the single interpreter. */
  code: number;
  description: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationChance: number; // %, the day's maximum
  windKph: number; // the day's maximum gust-free wind
  uvIndex: number | null;
  /** 08:00 conditions — what the morning is actually like. Null if the hourly series didn't cover it. */
  schoolRun: HourConditions | null;
  /** 16:00 conditions — the walk home. */
  homeTime: HourConditions | null;
}

export interface HourConditions {
  hour: number;
  tempC: number;
  /** What it feels like with wind and humidity — the number that decides a coat. */
  feelsLikeC: number;
  precipitationChance: number;
  windKph: number;
  code: number;
}

export interface WeatherOutlook {
  /** Outward code only — the precision that left this server. */
  area: string;
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;
  days: WeatherDay[];
}

export type AdviceSeverity = 'none' | 'note' | 'act';

/** What to put on a child, and why, for one day. */
export interface ClothingAdvice {
  date: string;
  /** Action-first, ≤10 words — the digest contract's line format. */
  headline: string;
  /** One sentence naming the actual reading it came from. */
  detail: string;
  /** The kit itself, so the UI can show it as a checklist. */
  items: string[];
  severity: AdviceSeverity;
}

// --- Postcode handling --------------------------------------------------------

/**
 * The outward code, and only the outward code.
 *
 * A UK postcode is outward + inward ("SW1A 1AA"): the outward half names a
 * postal district of thousands of addresses, the inward half narrows it to
 * roughly a dozen. Weather does not vary across a postal district, so the
 * inward half is precision the weather service has no use for — and precision
 * sent without a use is precision leaked.
 *
 * Returns null rather than a guess when the input isn't a recognisable UK
 * postcode, which is what stops a Swedish or malformed postcode being sent
 * somewhere it will not be understood.
 */
export function outwardCode(postcode: string): string | null {
  const cleaned = (postcode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // UK format: 1-2 letters, 1-2 digits, an optional letter, then the inward
  // code (digit + 2 letters). The outward half is everything before that.
  const full = /^([A-Z]{1,2}\d[A-Z\d]?)\d[A-Z]{2}$/.exec(cleaned);
  if (full) return full[1];
  // Someone who typed only the outward code has already given us exactly what
  // we want, so accept it as-is.
  const outwardOnly = /^[A-Z]{1,2}\d[A-Z\d]?$/.exec(cleaned);
  return outwardOnly ? cleaned : null;
}

// --- The network edge ---------------------------------------------------------

interface CacheEntry {
  at: number;
  outlook: WeatherOutlook | null;
}

// Module-level, like the rest of the beta store: one Node process, so this is
// shared across requests. Keyed by area + timezone, never by household — two
// households in the same postal district share one lookup and neither is
// identifiable from the key.
const g = globalThis as unknown as { __gigiWeather?: Map<string, CacheEntry> };
function cache(): Map<string, CacheEntry> {
  if (!g.__gigiWeather) g.__gigiWeather = new Map();
  return g.__gigiWeather;
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // A weather lookup is never worth failing a digest over.
    return null;
  }
}

/**
 * Outward code → approximate coordinates, via postcodes.io (free, no key, UK
 * government open data). The endpoint takes an outward code natively, which is
 * why it is the one used: there is no version of this call that needs the full
 * postcode.
 */
async function geocodeUk(outward: string): Promise<{ lat: number; lon: number } | null> {
  const j = (await getJson(
    `https://api.postcodes.io/outcodes/${encodeURIComponent(outward)}`,
  )) as { result?: { latitude?: number; longitude?: number } } | null;
  const lat = j?.result?.latitude;
  const lon = j?.result?.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return { lat, lon };
}

/**
 * Non-UK fallback: Open-Meteo's own geocoding, which resolves a postal code
 * within a country. Coarser and less certain than the UK path, so it is kept
 * separate rather than pretended to be equivalent.
 */
async function geocodeGeneric(postcode: string, countryCode: string): Promise<{ lat: number; lon: number } | null> {
  const q = new URLSearchParams({
    name: postcode.trim(),
    count: '1',
    format: 'json',
    countryCode,
  });
  const j = (await getJson(`https://geocoding-api.open-meteo.com/v1/search?${q}`)) as
    | { results?: Array<{ latitude?: number; longitude?: number }> }
    | null;
  const hit = j?.results?.[0];
  if (typeof hit?.latitude !== 'number' || typeof hit?.longitude !== 'number') return null;
  return { lat: hit.latitude, lon: hit.longitude };
}

/** Coordinates for a household, at postal-district precision, or null. */
async function locate(household: Household): Promise<{ area: string; lat: number; lon: number } | null> {
  // An explicit override exists so a deployment with no outbound access to the
  // geocoder (or a demo account with no real postcode) can still show weather.
  const envLat = Number(process.env.GIGI_WEATHER_LAT);
  const envLon = Number(process.env.GIGI_WEATHER_LON);
  if (Number.isFinite(envLat) && Number.isFinite(envLon)) {
    return { area: 'set by this deployment', lat: envLat, lon: envLon };
  }

  const postcode = (household.postcode || '').trim();
  if (!postcode) return null;

  if (household.market === 'uk') {
    const outward = outwardCode(postcode);
    if (!outward) return null;
    const hit = await geocodeUk(outward);
    return hit ? { area: outward, lat: hit.lat, lon: hit.lon } : null;
  }

  const hit = await geocodeGeneric(postcode, household.market === 'se' ? 'SE' : 'GB');
  // Even on the fallback path, the label we keep and show is coarse.
  return hit ? { area: postcode.slice(0, 3).toUpperCase(), lat: hit.lat, lon: hit.lon } : null;
}

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    uv_index_max?: number[];
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
    weather_code?: number[];
  };
}

function hourAt(hourly: OpenMeteoResponse['hourly'], date: string, hour: number): HourConditions | null {
  const times = hourly?.time;
  if (!times) return null;
  const stamp = `${date}T${String(hour).padStart(2, '0')}:00`;
  const i = times.indexOf(stamp);
  if (i === -1) return null;
  const temp = hourly?.temperature_2m?.[i];
  if (typeof temp !== 'number') return null;
  return {
    hour,
    tempC: temp,
    // Apparent temperature is the honest number for "will they be cold"; fall
    // back to the dry-bulb reading rather than inventing a wind chill.
    feelsLikeC: hourly?.apparent_temperature?.[i] ?? temp,
    precipitationChance: hourly?.precipitation_probability?.[i] ?? 0,
    windKph: hourly?.wind_speed_10m?.[i] ?? 0,
    code: hourly?.weather_code?.[i] ?? 0,
  };
}

/** Shape one Open-Meteo response into the days GiGi reasons about. Exported for tests. */
export function parseForecast(
  raw: unknown,
  meta: { area: string; lat: number; lon: number; timezone: string },
): WeatherOutlook | null {
  const j = raw as OpenMeteoResponse | null;
  const daily = j?.daily;
  const dates = daily?.time;
  if (!dates || dates.length === 0) return null;

  const days: WeatherDay[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const max = daily?.temperature_2m_max?.[i];
    const min = daily?.temperature_2m_min?.[i];
    // A day missing its temperatures is a day we say nothing about, not a day
    // we fill in with zeroes — 0°C is a very different instruction to "unknown".
    if (typeof max !== 'number' || typeof min !== 'number') continue;
    const code = daily?.weather_code?.[i] ?? 0;
    days.push({
      date,
      code,
      description: describeCode(code),
      tempMaxC: max,
      tempMinC: min,
      precipitationChance: daily?.precipitation_probability_max?.[i] ?? 0,
      windKph: daily?.wind_speed_10m_max?.[i] ?? 0,
      uvIndex: daily?.uv_index_max?.[i] ?? null,
      schoolRun: hourAt(j?.hourly, date, SCHOOL_RUN_HOUR),
      homeTime: hourAt(j?.hourly, date, HOME_TIME_HOUR),
    });
  }
  if (days.length === 0) return null;

  return {
    area: meta.area,
    latitude: meta.lat,
    longitude: meta.lon,
    timezone: meta.timezone,
    fetchedAt: new Date().toISOString(),
    days,
  };
}

/**
 * The household's forecast, fetched at most once an hour.
 *
 * Returns null — silently, and on purpose — whenever the location or the
 * forecast cannot be established. A household with no postcode, a deployment
 * with no outbound network, a service having a bad afternoon: all of them mean
 * GiGi has nothing to say about the weather, which is a perfectly good answer.
 */
export async function getForecast(household: Household): Promise<WeatherOutlook | null> {
  const tz = household.timezone || 'Europe/London';
  const key = `${household.market}:${(household.postcode || '').toUpperCase().replace(/\s+/g, '')}:${tz}`;
  const hit = cache().get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.outlook;

  const place = await locate(household);
  if (!place) {
    cache().set(key, { at: Date.now(), outlook: null });
    return null;
  }

  const q = new URLSearchParams({
    // Rounded to ~1km. The forecast is identical at that resolution and it is
    // one less digit of somebody's address sitting in a third party's log.
    latitude: place.lat.toFixed(2),
    longitude: place.lon.toFixed(2),
    timezone: tz,
    forecast_days: String(FORECAST_DAYS),
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code',
  });
  const raw = await getJson(`https://api.open-meteo.com/v1/forecast?${q}`);
  const outlook = parseForecast(raw, { area: place.area, lat: place.lat, lon: place.lon, timezone: tz });
  cache().set(key, { at: Date.now(), outlook });
  return outlook;
}

/**
 * The last forecast fetched for this household, without going to the network.
 *
 * `buildDigest` is synchronous and deliberately pure — it is the deterministic
 * reference implementation of the digest contract, and an await in the middle
 * of it would make it untestable and make every caller async. So the async
 * fetch happens at the edge (`getForecast`) and the digest reads the cache.
 * A cold cache simply means no weather item this run.
 */
export function cachedForecast(household: Household): WeatherOutlook | null {
  const tz = household.timezone || 'Europe/London';
  const key = `${household.market}:${(household.postcode || '').toUpperCase().replace(/\s+/g, '')}:${tz}`;
  const hit = cache().get(key);
  if (!hit || Date.now() - hit.at >= CACHE_TTL_MS) return null;
  return hit.outlook;
}

/** Drop everything cached for a household — used when the postcode changes. */
export function clearForecastCache(): void {
  cache().clear();
}

// --- Interpretation -----------------------------------------------------------

/**
 * WMO weather codes in plain words.
 *
 * The service returns an integer; everything the user reads about the weather
 * is translated here, so there is exactly one place that decides what "73"
 * means and no screen can drift from another.
 */
export function describeCode(code: number): string {
  if (code === 0) return 'clear';
  if (code <= 2) return 'mostly sunny';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code === 66 || code === 67) return 'freezing rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain showers';
  if (code === 85 || code === 86) return 'snow showers';
  if (code >= 95) return 'thunderstorms';
  return 'unsettled';
}

function isSnow(code: number): boolean {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

function isWet(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

/**
 * The rules. What a child needs to leave the house in, for one day.
 *
 * Every threshold here is a judgement, so each one says what it is: the point
 * is that a parent reading "because it is 4°C at eight" can disagree with the
 * reading rather than with a black box. Nothing in this function is inferred
 * from anything but the numbers passed in — no season, no "it's usually", no
 * filling in a gap.
 */
export function clothingAdvice(day: WeatherDay): ClothingAdvice {
  const items: string[] = [];
  const reasons: string[] = [];
  let severity: AdviceSeverity = 'none';

  const morning = day.schoolRun;
  const afternoon = day.homeTime;
  // The morning is what they dress for; the day's minimum is the backstop for
  // when the hourly series didn't reach us.
  const morningTemp = morning ? morning.feelsLikeC : day.tempMinC;
  const morningRain = morning ? morning.precipitationChance : day.precipitationChance;
  const afternoonRain = afternoon ? afternoon.precipitationChance : day.precipitationChance;
  const wetCode = isWet(day.code) || (morning ? isWet(morning.code) : false);
  const snowy = isSnow(day.code) || (morning ? isSnow(morning.code) : false);

  // --- Wet -------------------------------------------------------------------
  // 50% is where "might rain" becomes "pack for rain": below it a coat is a
  // nuisance carried all day, above it a soaking is the likelier outcome.
  const rainChance = Math.max(morningRain, afternoonRain);
  if (snowy) {
    items.push('snow boots', 'waterproof gloves', 'warm hat');
    reasons.push(`snow forecast (${day.description})`);
    severity = 'act';
  } else if (rainChance >= 50 || wetCode) {
    items.push('waterproof coat');
    reasons.push(
      morning && morningRain >= 50
        ? `${morningRain}% chance of rain at 8am`
        : `${rainChance}% chance of rain`,
    );
    severity = 'act';
    // Puddles, not rain, are what soak shoes — a heavy forecast means wellies.
    if (rainChance >= 75) items.push('wellies');
    // A morning that is dry and an afternoon that is not is the case a glance
    // out of the window gets wrong, so it is called out by name.
    if (morningRain < 50 && afternoonRain >= 50) {
      reasons.push('dry now, wet by home time');
    }
  }

  // --- Cold ------------------------------------------------------------------
  // Below freezing, extremities are the problem, not the coat.
  if (morningTemp <= 2) {
    items.push('winter coat');
    // The snow branch above already asked for waterproof gloves and a warm hat.
    // Adding plain "hat" and "gloves" on top produced a kit list that told a
    // parent to send two hats — the dedupe is by exact string, so near-
    // duplicates have to be avoided here rather than filtered out later.
    if (!snowy) items.push('hat', 'gloves');
    items.push('scarf');
    reasons.push(`feels like ${Math.round(morningTemp)}°C at 8am`);
    severity = 'act';
  } else if (morningTemp <= 8) {
    items.push('warm coat');
    reasons.push(`feels like ${Math.round(morningTemp)}°C at 8am`);
    if (severity === 'none') severity = 'act';
  } else if (morningTemp <= 13) {
    items.push('a layer they can take off');
    reasons.push(`${Math.round(morningTemp)}°C at 8am, ${Math.round(day.tempMaxC)}°C later`);
    if (severity === 'none') severity = 'note';
  }

  // A cold morning that becomes a warm afternoon is the single most common
  // dressing mistake, and a coat abandoned in a playground is the result.
  if (morningTemp <= 10 && day.tempMaxC >= 17 && !items.includes('a layer they can take off')) {
    reasons.push(`warming to ${Math.round(day.tempMaxC)}°C by afternoon — layers, not one thick coat`);
    if (severity === 'none') severity = 'note';
  }

  // --- Hot and bright --------------------------------------------------------
  if (day.tempMaxC >= 24) {
    items.push('sun hat', 'water bottle');
    reasons.push(`up to ${Math.round(day.tempMaxC)}°C`);
    severity = 'act';
  }
  // UV 6 is where the UK guidance turns from "fine" to "protect", and UV is not
  // the same as heat — a bright cold April day burns.
  if ((day.uvIndex ?? 0) >= 6 && !items.includes('sun cream')) {
    items.push('sun cream');
    reasons.push(`UV index ${Math.round(day.uvIndex ?? 0)}`);
    if (severity === 'none') severity = 'note';
  }

  // --- Wind ------------------------------------------------------------------
  // Around 40 km/h a hood stops staying up and an umbrella stops being useful.
  if (day.windKph >= 40) {
    reasons.push(`wind ${Math.round(day.windKph)} km/h — a hood beats an umbrella`);
    if (severity === 'none') severity = 'note';
  }

  const unique = Array.from(new Set(items));
  const headline = unique.length > 0 ? clampTo10(`Send them in ${listWords(unique.slice(0, 2))}`) : 'Nothing extra needed today';
  const detail =
    reasons.length > 0
      ? `${capitalise(day.description)}, ${Math.round(day.tempMinC)}–${Math.round(day.tempMaxC)}°C. ${capitalise(reasons.join('; '))}.`
      : `${capitalise(day.description)}, ${Math.round(day.tempMinC)}–${Math.round(day.tempMaxC)}°C. Nothing the weather demands today.`;

  return { date: day.date, headline, detail, items: unique, severity };
}

/** Advice for a specific date, or null when the forecast doesn't reach it. */
export function adviceFor(outlook: WeatherOutlook | null, date: string): ClothingAdvice | null {
  const day = outlook?.days.find((d) => d.date === date);
  return day ? clothingAdvice(day) : null;
}

/** Every day in the outlook, already interpreted — what the UI renders. */
export function adviceWeek(outlook: WeatherOutlook | null): ClothingAdvice[] {
  return (outlook?.days ?? []).map(clothingAdvice);
}

function listWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// The digest contract caps a line at 10 words, and this module produces lines
// that go into it.
function clampTo10(line: string): string {
  const words = line.split(/\s+/);
  return words.length <= 10 ? line : words.slice(0, 10).join(' ');
}
