-- Grid-quality samples: one row per cron tick (~15 min) from the live meter.
-- Without this the meter's voltage/power/frequency is thrown away (only the
-- 15-min energy counter survives in energy_readings), so grid-quality trends
-- (sag/swell, frequency drift) are impossible to build.
create table if not exists grid_samples (
  ts bigint primary key,              -- ms epoch at sample time
  power_w numeric not null,
  voltage_v numeric not null,
  current_a numeric not null,
  power_factor numeric,
  freq_hz numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_grid_ts on grid_samples (ts desc);
alter table grid_samples enable row level security;
-- no policies: service-role only (same posture as energy_readings)

-- Daily rollups: one row per BKK day, upserted by the cron every tick
-- (yesterday + today). Powers long-horizon trends without dragging raw
-- readings through the 60-day history API cap.
create table if not exists energy_daily (
  day integer primary key,            -- BKK dayNum (days since epoch, UTC+7)
  date_bkk date not null,
  total_kwh numeric not null,
  on_kwh numeric not null,            -- TOU on-peak (Mon–Fri 09:00–21:59 BKK)
  off_kwh numeric not null,
  baseload_kwh_min numeric,           -- min hourly kWh that day
  hours integer not null,             -- distinct hours with data
  vmin numeric,                       -- from grid_samples (null until sampling starts)
  vmax numeric,
  freq_min numeric,
  freq_max numeric,
  samples integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table energy_daily enable row level security;
