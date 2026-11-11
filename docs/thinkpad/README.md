# ThinkPad / VPN status (`/thinkpad`)

Private page showing whether the home ThinkPad (the corporate-VPN jump box) is
on, whether its Cisco VPN adapter is up, whether the internal systems answer
from it, and (optionally) whether the Mac's tunnels through it work. LINE push
when the ThinkPad disappears or the VPN / key check stays down.

Not in the nav and `noindex`, but **public**: `THINKPAD_PUBLIC = true` in
`app/lib/thinkpad-auth.server.ts` (owner decision, 2026-11-11). The page only
shows labels, never host names or IPs. Set it to `false` to put the page and
`/api/thinkpad/status` behind the `/energy`-style key gate again (cookie =
SHA-256 of `THINKPAD_PAGE_KEY`, wrong or missing key → 404). Ingest always
needs a reporter token.

## Pieces

| Piece | Where |
|---|---|
| Table `device_status` | `docs/migrations/010_device_status.sql` |
| SQL `thinkpad_runs` / `thinkpad_latency` (service role only) | `docs/migrations/011_device_status_functions.sql` |
| History math (runs, 7-day stats, VPN session prediction, latency) | `app/lib/thinkpad-history.ts` |
| Ingest `POST /api/thinkpad/report` | `app/routes/api/thinkpad.report.ts` |
| Page + poll `GET /api/thinkpad/status` | `app/routes/thinkpad.tsx`, `app/routes/api/thinkpad.status.ts` |
| Payload schema (zod, strict) | `app/lib/thinkpad-schema.ts` |
| Status math / alert state machine | `app/lib/thinkpad-status.ts`, `app/lib/thinkpad-alerts.ts` |
| Cron (every 5 min) | `workers/app.ts` → `app/lib/thinkpad-alerts.server.ts` |
| ThinkPad reporter (PowerShell + Task Scheduler) | `tools/thinkpad-reporter/` |
| Mac reporter (Node + launchd) | `tools/mac-reporter/` |
| Tests | `app/lib/__tests__/thinkpad.test.ts` |

## Rules the design keeps

- **No internal host names / IPs in the repo, the DB, the page or Worker logs.**
  Hosts live only in the reporters' local config files. The payload carries
  labels; the schema rejects unknown keys and labels containing `.`, `:` or `/`.
- **Reporters are read-only.** They never touch the VPN (no `vpncli`, no adapter
  enable/disable, no route/DNS change) and never open or kill a tunnel.
- **Tokens:** the worker stores only `hex(SHA-256(token))` per source; the token
  decides the source. ThinkPad token = DPAPI file (current user, ACL user-only);
  Mac token = Keychain.

## Status rules

- ThinkPad online = a heartbeat received within 3 min (server clock).
- "VPN connected since" = start of the unbroken run of VPN-up heartbeats
  (gap > 3 min breaks it); `+` when the run reaches the 24 h window edge.
- 24 h bar: 288 × 5-min slots — online+VPN / VPN partly / online without VPN / no heartbeat.
- Mac: no report for > 3 min shows "Mac ไม่ได้รายงาน" (grey), not an error.
- 7-day stats: % online, % VPN up, VPN drops, offline events, longest outage, per-day bars
  (from `thinkpad_runs`, which breaks runs on a VPN change or a gap > 3 min).
- Latency sparkline per check: 24 h of 15-min averages, red ticks = failures (`thinkpad_latency`).
- "VPN likely to drop at": needs ≥ 2 sessions ≥ 30 min that ended with the VPN dropping
  while the ThinkPad stayed online, and those must be within 15 % of each other (a fixed
  session limit). Prediction = current session start + median length.
- ThinkPad offline: the page asks Tuya whether the house meter is online.
  Meter offline too → power cut or home internet down. Meter online → the problem is the ThinkPad.
- Windows Update: restart pending (registry) + active hours, Wi-Fi signal/rate (no SSID).

## Alerts (LINE, via `pushLine` from energy)

Checked every 5 min. Each incident pushes once when it starts and once when it clears
(state in KV `thinkpad:alert-state`):

- no ThinkPad heartbeat for > 10 min, with the house-meter hint (power cut / home internet vs ThinkPad)
- VPN adapter down **or** the `KBS QAS API` check failing on every heartbeat for ≥ 10 min
  (not evaluated while the ThinkPad is offline). Mentions home internet when the optional
  `Internet` check fails too
- Windows Update restart pending (once until it clears), with the window Windows may restart in
- ThinkPad restarted (boot time moved), with whether the VPN is back
- VPN session ~30 min before its usual length runs out (once per session; see prediction rules)
- weekday digest at 08:00 Bangkok: ready or not, VPN since, failing checks, pending restart,
  predicted drop, 7-day numbers

Rows older than 14 days are deleted hourly by the same cron.

## Secrets / vars

| Name | What |
|---|---|
| `THINKPAD_PAGE_KEY` | page key, only used when `THINKPAD_PUBLIC = false` |
| `THINKPAD_INGEST_TOKEN_SHA256` | SHA-256 hex of the ThinkPad token (printed by `Set-Token.ps1`) |
| `MAC_INGEST_TOKEN_SHA256` | SHA-256 hex of the Mac token (printed by `--init-token`) |
| `THINKPAD_STORE=memory` | `.dev.vars` only — in-process store for `pnpm dev` without Supabase |

```bash
npx wrangler secret put THINKPAD_INGEST_TOKEN_SHA256
npx wrangler secret put MAC_INGEST_TOKEN_SHA256
```

## ThinkPad reporter

Runs as the logged-on user, no admin. Files end up in `%LOCALAPPDATA%\napats-status\`.

1. Copy `tools/thinkpad-reporter/*` to the ThinkPad (any folder).
2. Create `%LOCALAPPDATA%\napats-status\config.json` from `config.example.json`
   with the real hosts. Label `KBS QAS API` is the one the alert watches.
3. `powershell -ExecutionPolicy Bypass -File Set-Token.ps1 -Generate` → put the printed hash in
   `THINKPAD_INGEST_TOKEN_SHA256`.
4. Try it: `powershell -ExecutionPolicy Bypass -File Send-Status.ps1 -DryRun` (prints the payload, sends nothing).
5. `powershell -ExecutionPolicy Bypass -File Install-Task.ps1` → task `napats-status-reporter`,
   every minute, `IgnoreNew`, 1-minute limit, started via `conhost --headless` (no window).
   Log: `%LOCALAPPDATA%\napats-status\reporter.log`.

Uninstall: `Uninstall-Task.ps1` (add `-RemoveFiles` to delete config, token and log).
Pause for testing: `Disable-ScheduledTask napats-status-reporter` / `Enable-ScheduledTask napats-status-reporter`.

The task only runs while the user is logged on. After a reboot the page shows
offline until someone logs in. The ThinkPad has no battery, so a power cut shows up as offline.

## Mac reporter (optional)

1. `~/Library/Application Support/napats-status/mac-config.json` from `mac-config.example.json`.
2. `node tools/mac-reporter/mac-reporter.mjs --init-token` → `MAC_INGEST_TOKEN_SHA256`.
3. `node tools/mac-reporter/mac-reporter.mjs --dry-run`
4. `tools/mac-reporter/install.sh` → launchd agent `com.napats.status-reporter` (every 60 s,
   log `~/Library/Logs/napats-status-reporter.log`). Remove: `uninstall.sh [--remove-files]`.

While the Mac sleeps launchd doesn't run it, and the page shows "Mac ไม่ได้รายงาน".

**Tunnel auto-heal** (owner approved 2026-11-11). With `"auto_heal": true` and a `"tunnels"`
list in `mac-config.json` (see the example), each run:
- opens `ssh -f -N <forward> <alias>` for a configured port that has no listener (Tailscale alias first, LAN second);
- restarts the SOCKS tunnel when it is an ssh to the ThinkPad but every SOCKS check fails at
  the connection level two runs in a row while plain ssh works (SIGTERM, then SIGKILL);
- never touches a port held by another process; one attempt per port per 4 min.
The last action per port is shown on the page. Set `"auto_heal": false` to turn it off.
The VPN on the ThinkPad is never touched (reconnecting needs the user's sign-in).
The plist has `AbandonProcessGroup` so tunnels outlive each run.

## Rotating a token

1. ThinkPad: `Set-Token.ps1 -Generate` (Mac: `--init-token`): the new token replaces the old one.
2. `npx wrangler secret put THINKPAD_INGEST_TOKEN_SHA256` (or `MAC_…`) with the new hash.
   Between steps 1 and 2 reports get 401, so do them back to back. Nothing else changes.

If the page is gated again, rotating `THINKPAD_PAGE_KEY` invalidates every old cookie.

## Local dev

`.dev.vars` (gitignored) with `THINKPAD_STORE=memory` and the two hashes, then
`pnpm dev` and POST a dry-run payload with `curl -H "Authorization: Bearer <token>"`.
