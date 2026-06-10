-- Energy dashboard: permanent store for Tuya forward_energy_total report logs.
-- Tuya cloud retains only ~7 days; a Worker cron (*/15 min) upserts into this
-- table. Dedupe is enforced by the event_time primary key.
create table if not exists energy_readings (
  event_time bigint primary key,        -- ms epoch from Tuya
  value      numeric not null,          -- raw counter (kWh = value * 0.01)
  created_at timestamptz not null default now()
);
create index if not exists idx_energy_time on energy_readings (event_time desc);
alter table energy_readings enable row level security;
-- no policies: readable/writable only by the service role (server-side)
