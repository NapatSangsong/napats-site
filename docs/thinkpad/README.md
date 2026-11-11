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

## Alerts (LINE, via `pushLine` from energy)

Checked every 5 min. Each incident pushes once when it starts and once when it clears
(state in KV `thinkpad:alert-state`):

- no ThinkPad heartbeat for > 10 min
- VPN adapter down **or** the `KBS QAS API` check failing on every heartbeat for ≥ 10 min
  (not evaluated while the ThinkPad is offline)

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

## Rotating a token

1. ThinkPad: `Set-Token.ps1 -Generate` (Mac: `--init-token`): the new token replaces the old one.
2. `npx wrangler secret put THINKPAD_INGEST_TOKEN_SHA256` (or `MAC_…`) with the new hash.
   Between steps 1 and 2 reports get 401, so do them back to back. Nothing else changes.

If the page is gated again, rotating `THINKPAD_PAGE_KEY` invalidates every old cookie.

## Local dev

`.dev.vars` (gitignored) with `THINKPAD_STORE=memory` and the two hashes, then
`pnpm dev` and POST a dry-run payload with `curl -H "Authorization: Bearer <token>"`.
