# Weather — what the children need to leave the house in

GiGi does not show a forecast. A forecast is information, and the digest
contract has no room for information: every line in it is an action, ten words
or fewer. So the weather enters GiGi as a **kit list** — the coat that has to go
on, the wellies that have to be found — and the forecast behind it is shown as
evidence, the same way a bill shows the sentence its amount was read from.

Implementation: `src/lib/weather.ts`. UI: `src/components/WeatherStrip.tsx`.
API: `GET /api/weather`.

## The three questions

### 1. Where — postal district, never an address

A full UK postcode locates a household to roughly a dozen doors. It is a strong
identifier, and it is not one the weather needs: weather does not vary within a
postal district.

So the only thing that leaves the server is the **outward code** — `SW1A`, not
`SW1A 1AA`. `outwardCode()` parses it out and returns `null` for anything it
does not recognise, which is what stops a Swedish or malformed postcode being
sent somewhere it will not be understood.

Two further properties fall out of this:

* The household's **browser never contacts the weather service**. The server
  fetches, so no user IP address reaches a third party either.
* The cache is keyed by **postal district, not household id**. Two households in
  the same district share one lookup, and nothing in the cache key identifies a
  person. It also means a changed postcode is simply a different key — there is
  no invalidation to get wrong.

Coordinates are rounded to two decimals (~1 km) before the forecast call. The
forecast is identical at that resolution and it is one less digit of somebody's
address sitting in a third party's log.

### 2. What — Open-Meteo and postcodes.io

Both are free and **unauthenticated**, which is the reason they were chosen: an
API key means an account, an account means a contract, and a contract means
another name on the subprocessor list users read on the Data & Trust screen.
Open-Meteo is EU-hosted, which is the same constraint that pins inference to an
EU region — "EU data only" has to hold for every hop, not just the model call.

Open-Meteo is listed in `src/lib/subprocessors.ts` and shown to users, even
though all it receives is a coordinate pair. The standard is "every hop out of
our infrastructure is named", not "every hop we think matters". Each lookup also
writes a `weather_checked` entry to the household's trust log.

### 3. When — eight in the morning, not the daily maximum

This is the part that makes the advice correct rather than merely present.

A day that peaks at 18°C at three in the afternoon can be 4°C and raining at
eight, and it is the eight o'clock figure that decides whether a coat goes on.
So the **hourly** series is read at 08:00 (the school run) and 16:00 (the walk
home), and the advice is built from those; the daily figures are context.

The thresholds live in `clothingAdvice()` and each one states its reason in the
detail line — "feels like 4°C at 8am", "75% chance of rain at 8am". A parent who
can see the reading can disagree with the rule. One shown only the conclusion
has to either trust it or ignore it.

Cases the rules exist to catch:

| Situation | Why it needs saying |
|---|---|
| Dry at 8am, wet by 4pm | A glance out of the window gets this wrong |
| 6°C morning, 19°C afternoon | The coat ends up abandoned in a playground — layers, not one thick coat |
| Bright, cold, UV 6+ | UV is not heat; an April day burns |
| Snow | Boots and extremities, not just a warmer coat |
| Wind ≥ 40 km/h | A hood beats an umbrella |

## Null over guessing

The same rule extraction follows. If the postcode is missing or unrecognised, or
either service does not answer, every caller gets `null` and GiGi says nothing
about the weather. It never shows a stale day or an invented one. A missing
forecast is a perfectly good answer; a wrong one is not.

`GET /api/weather` expresses this as `{ available: false, reason }` rather than
an error, and `WeatherStrip` renders nothing at all in that case — an empty
strip beats a box apologising for itself on every screen.

## Why `buildDigest` stays synchronous

`buildDigest` is the deterministic reference implementation of the digest
contract (see `CLAUDE.md`, Prompt 2). An `await` in the middle of it would make
it untestable and make every one of its callers async.

So the fetch happens at the edge and the digest reads a cache:

* `getForecast(household)` — async, hits the network at most once an hour,
  called by `/api/digest` and `/api/digest/generate` **before** regenerating.
* `cachedForecast(household)` — synchronous, what `regenerateDigest` reads.

A cold cache means no weather item that run. That is the same silence a
household with no postcode gets, so nothing special has to happen for it.

## Where it shows up

* **Digest** — at most **one** weather item, ever, and only when the day
  actually demands something (`severity: 'act'`), only today or tomorrow, and
  only when the household has children. Two weather lines in a four-item digest
  is the digest failing. When the calendar has a school trip or a sports day
  that morning, the line says so.
* **Today** (`/app/digest`) — the compact strip: today's kit, with the 8am
  reading printed underneath it.
* **Kids & Travel** (`/app/kids`) — the same strip with the rest of the week.

## Configuration

None required. `GIGI_WEATHER_LAT` / `GIGI_WEATHER_LON` pin every household on
the deployment to one location and exist only for a demo household with no real
postcode, or a deployment that cannot reach the geocoder. See `.env.example`.
