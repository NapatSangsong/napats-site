# BlueRing Energy API (rooftop PV)

Private, undocumented API behind the BlueRing app (`th.co.bluering.user` v1.0.6, a React
Native/Expo iOS build that also runs on Apple Silicon). Candidate endpoints came from the
app's Hermes bytecode string table. Everything below was **confirmed against the live API
on 2026-11-12** with a normal (non-admin) account.

## Data flow

```
4 × MI-1000 micro-inverters ──Modbus──► BlueRing gateway (Wi-Fi)
                                           │ 15-min buckets, uploaded ~5 min after each slot
                                           ▼
                 https://bluering.workundercloud.com/api   (NestJS behind openresty)
                                           │ REST/JSON, Authorization: Bearer <token>
                          ┌────────────────┴────────────────┐
                    BlueRing app                    napats-site Worker
                                              (app/lib/bluering.server.ts)
```

Firebase (project `bluering-d8a9f`) only handles push notifications. There is no WebSocket
or MQTT. The app's "live" W numbers are the newest 15-minute bucket.

## Auth

| Step | Call | Body |
|---|---|---|
| 1 | `POST /auth/send-otp` | `{ mobileNumber }`, 10 digits with a leading 0 → `{ mobileNumber, otpRef }` |
| 2 | `POST /auth/login` | `{ mobileNumber, otpRef, otpCode }` → `{ userId, token, expiresAt }` |

The token is a JWT valid for **30 days**. There is no refresh token, so you redo the OTP login.
The throttle is strict: about 3 requests per minute per IP (`ThrottlerException`, 429).

## Endpoints a user account can read

| Path | Returns |
|---|---|
| `GET /users/me` | `{ id, mobileNumber, … }` |
| `GET /users/{uid}/plants` | `[{ id, name, eaType: "mea", meterType: "tou", meterReadingDate, grid: { purchasePrice, purchaseOffPeakPrice, salePrice }, gatewayId, gateway: { id, serialNumber, dailySolar, dailyGrid, dailyConsumption, inverters: [{ model, serialNumber, pvCount }] } }]` |
| `GET /gateways/{gid}/performances?period=minutes` | 15-min rows: `pvActivePower`, `gridActivePower` (kW), `gridVoltage`, `gridCurrent`, `dailyEnergyGeneration` / `dailyEnergyPurchased` / `dailyEnergySold` (kWh so far today) |
| `GET /gateways/{gid}/performances?period=days\|monthly` | `pvEnergyGeneration`, `gridEnergyPurchased`, `gridEnergySold` (kWh) |
| `GET /gateways/{gid}/energies?type=minute` | 15-min rows: `solar`, `grid`, `consumption` as **average kW**, plus `deviceTime` |
| `GET /gateways/{gid}/energies?type=daily\|monthly` | `solar`, `gridPurchased`, `gridSold`, `consumption` (kWh), plus `date` |
| `GET /gateways/{gid}/energies/count?type=daily` | a number (days since install) |
| `GET /modbus/gateways/{serialNumber}` | live Modbus register read (SN, firmware, status) and the gateway's public IP. Not used. |
| `GET /settings/carbon_emission_rate` | `{ value: 0.5 }` kg CO₂/kWh |

Query rules:
- `startDate` is Bangkok midnight written as UTC ISO: `2026-11-12` → `2026-11-11T17:00:00.000Z`. A bare `YYYY-MM-DD` is read as UTC midnight, which is a day off.
- Pages default to **10 rows**. Pass `limit=200&offset=N`.
- Admin-only (403): `/plants`, `/plants/{id}`, `/gateways/{id}`. Missing (404): `/bill`, `/contracts`, `/notifications…`.

## In this repo

| Piece | File |
|---|---|
| OTP login, probe, live reading (Mac; token in Keychain `napats-bluering`) | `tools/bluering/bluering.mjs` |
| Worker client (plant discovery cached 6 h, snapshot cached 60 s in KV) | `app/lib/bluering.server.ts` |
| API route | `GET /api/energy/bluering`, `?series=minute\|daily\|monthly&date=YYYY-MM-DD` |

The route returns only curated fields: no serials, lead number or gateway IP.

```bash
node tools/bluering/bluering.mjs login     # every 30 days
node tools/bluering/bluering.mjs live
security find-generic-password -s napats-bluering -a token -w | npx wrangler secret put BLUERING_TOKEN
```
