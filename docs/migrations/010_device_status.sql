-- Device heartbeats for the private /thinkpad status page.
-- One row per reporter run (~1/min per source). The reporter sends labels
-- only (no host names / IPs — the ingest schema rejects them); vpn_up and
-- kbs_ok are copied out of the payload at ingest so the 24 h history and the
-- alert cron can read two booleans instead of dragging every payload.
-- Rows older than ~14 days are purged by the cron (thinkpad-alerts.server.ts).
create table if not exists device_status (
  id bigint generated always as identity primary key,
  source text not null check (source in ('thinkpad', 'mac')),
  received_at timestamptz not null default now(), -- server clock: online/offline is judged on this
  reported_at timestamptz,                        -- reporter clock (informational)
  vpn_up boolean,                                 -- thinkpad only
  kbs_ok boolean,                                 -- thinkpad only: the "KBS QAS API" check
  payload jsonb not null
);
create index if not exists idx_device_status_source_received
  on device_status (source, received_at desc);
alter table device_status enable row level security;
-- no policies: service-role only (same posture as energy_readings)
