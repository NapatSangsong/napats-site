# Energy Dashboard (`/energy`)

A private, key-gated dashboard that turns the home's **Tuya smart meter** into a
live energy story: real-time load, historical analysis, a TOU/solar financial
model, a Tuya-style daily energy explorer, an animated house scene, and a
weather-driven **2 kWp rooftop-solar production forecast** (simulation — nothing
is installed or wired to the house yet; the home runs on grid power 100%).

Deployed at **https://ai.napats.dev/energy** (Cloudflare Workers).

---

## Access (gate)

The page is not linked anywhere and is protected by a cookie gate:

1. Visit `/energy?key=<ENERGY_PAGE_KEY>` → sets the `__Host-napats-energy`
   cookie (HttpOnly, Secure, SameSite=Lax) and redirects to `/energy`.
2. Any request without a valid cookie (and no key) gets a **404** (not a 401 —
   the page's existence stays hidden).

Gate logic: `app/lib/energy-gate.server.ts` · enforced in every loader via
`requireEnergyAuth()`.

---

## Data flow

```
Tuya Cloud  ──(cron */15)──>  syncEnergyReadings()  ──>  Supabase: energy_readings
   │                                                          │
   │  (live, on demand)                                       │ (history, on demand)
   ▼                                                          ▼
/api/energy/live  ──┐                          ┌──  /api/energy/history
                    ├──>  energy.tsx (client)  ─┤
/api/energy/weather ┘     calcAll() in browser  └──  /api/energy/solar
```

- **Cron** (`workers/app.ts` `scheduled()`, `wrangler.json` `triggers.crons = */15`)
  calls `syncEnergyReadings()` which pages Tuya `report-logs`, upserts into
  Supabase `energy_readings` (PK = `event_time` ms epoch → dedupe), and advances
  a KV cursor (`energy:sync:cursor` in `RATE_LIMIT_KV`, **remote** namespace).
- **History API** returns `points: [event_time_ms, raw_counter][]`; the browser
  runs the entire analysis (`app/lib/energy-calc.ts`, a 1:1 port of
  `dashboard.py v10`). `kWh = raw_counter × 0.01`.
- **Live API** returns scaled meter values (no secrets reach the client).

All time math is **Asia/Bangkok (UTC+7) fixed-offset** on ms epochs — never local
`Date` getters (the code runs on Workers/UTC, CI, and any browser; all must agree).

---

## Routes & key files

| Path | File | Purpose |
|------|------|---------|
| `/energy` | `app/routes/energy.tsx` | Page: loader gate + client orchestration (poll live 30s, history 5min, paused while tab hidden) |
| `/api/energy/live` | `app/routes/api/energy.live.ts` | Live Tuya snapshot (gated) |
| `/api/energy/history` | `app/routes/api/energy.history.ts` | Supabase history, paged (gated) |
| `/api/energy/weather` | `app/routes/api/energy.weather.ts` | Open-Meteo current weather (gated) |
| `/api/energy/solar` | `app/routes/api/energy.solar.ts` | 4-day simulated solar production forecast (gated) |

- `app/lib/energy-calc.ts` — pure isomorphic analysis/finance/forecast/savings.
- `app/lib/tuya.server.ts` — Tuya HMAC signing + report-logs pagination.
- `app/lib/energy-sync.server.ts` — cron sync (Tuya → Supabase upsert).
- `app/lib/energy-format.ts` — Python-faithful number/date formatters.
- `app/components/energy/*` — UI sections (LiveNow, HouseFlow, SolarForecast,
  DailyEnergyChart, ProfileBars, LoadCurve, Heatmap, ForecastChart,
  SavingsChart, ScenarioCards, Verdict, Inspector).
- `app/styles/energy.css` — scoped (`.energy-root`) copy of the v10 design.
- `app/lib/__tests__/energy-calc.test.ts` (+ fixtures) — vitest parity suite.
- `docs/migrations/006_energy_readings.sql` — Supabase table + RLS.

---

## House scene (`HouseFlow.tsx`)

A theme-native line-art scene driven by real data:

- **Grid → house** blue pulses; speed scales with the live wattage.
- **Windows** glow; brightness scales with load **and** the TOU peak window
  (Evening Peak brightest), with a smooth `@property --glow` tween.
- **Day / night** by Bangkok hour: sun + warm sky vs moon + twinkling stars.
- **TOU badge**: current tariff state (Evening Peak / On-Peak / Off-Peak), the
  ฿/kWh rate, and **units used so far today** in that TOU class (`a.dailyOn/off`).
- **Weather pill**: temp + condition + rain% (Open-Meteo).
- **Rooftop solar** panels are drawn **but not wired** (dashed ✕ disconnect mark
  — the home still uses grid). The panels **glow while producing** (daytime),
  intensity inversely proportional to cloud cover.

---

## Solar forecast (`SolarForecast.tsx` + `api/energy.solar.ts`)

**Simulation only — no panels installed, nothing fed to the house.**

Model (transparent, GHI-based):

```
kWh per hour = GHI(W/m²) / 1000 × kWp(2.0) × PR(0.75)
```

- GHI = Open-Meteo hourly `shortwave_radiation` for Bang Yai; `1000 W/m²` = STC;
  `PR` folds in inverter, thermal and soiling losses. A clear Bangkok day lands
  ~8 kWh — consistent with the dashboard's `SOLAR_KWH_D` assumption.
- UI: 4-day selector, hourly **produced vs actual-load** grouped bars (load =
  measured `a.wdProf`/`a.prof`), daily total, peak.
- **On-peak offset** = Σ `min(solar_h, load_h)` over on-peak hours (no export, so
  only concurrently-used solar counts) → ฿ saved at the TOU rate. Also reports
  self-use %, wasted kWh, evening-peak coverage, and a 2 kW sizing verdict.

---

## Environment

Cloudflare **secrets** (set via `wrangler secret put`, never in the repo):

- `ENERGY_PAGE_KEY` — gate key.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role JWT (pinned as `Authorization:
  Bearer` in `supabase.server.ts`; `energy_readings` has RLS on with no policies
  → service-role only).
- `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_DEVICE_ID` — Tuya cloud creds.

**Vars** (`wrangler.json`): `TUYA_ENDPOINT`. **KV**: `RATE_LIMIT_KV` (sync cursor).
See `.dev.vars.example` for local setup (`.dev.vars` is gitignored).

---

## Commands

```bash
npm test                         # vitest parity suite
npm run build                    # react-router build
npx wrangler deploy              # deploy (run from repo root)

# inspect the remote sync cursor (NOTE: --remote, else reads empty local KV)
npx wrangler kv key get "energy:sync:cursor" --binding=RATE_LIMIT_KV --remote
```

> Never let Tuya secrets reach the client bundle — verify with
> `grep -rl "iotbing\|TUYA" build/client/assets` after building.
