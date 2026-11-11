-- Read-side helpers for /thinkpad, so the worker doesn't drag 20k heartbeats
-- through PostgREST (max 1000 rows per call) to compute history.
--
-- thinkpad_runs: gaps-and-islands over the ThinkPad heartbeats. One row per
-- unbroken run of the same VPN state; a run also breaks on a gap > 3 min
-- (machine offline). ended_by = 'change' (next beat flips VPN state within
-- 3 min), 'offline' (gap), 'last' (no later beat — the caller decides whether
-- that is ongoing or offline using the current time).
create or replace function thinkpad_runs(p_since timestamptz)
returns table (vpn_up boolean, started_at timestamptz, ended_at timestamptz, beats integer, ended_by text)
language sql stable security invoker
set search_path = public
as $$
  with b as (
    select received_at,
           coalesce(device_status.vpn_up, false) as up,
           lag(received_at) over w as prev_t,
           lag(coalesce(device_status.vpn_up, false)) over w as prev_up
    from device_status
    where source = 'thinkpad' and received_at >= p_since
    window w as (order by received_at)
  ), g as (
    select *, sum(case when prev_t is null or up is distinct from prev_up
                            or received_at - prev_t > interval '3 minutes' then 1 else 0 end)
              over (order by received_at) as grp
    from b
  ), r as (
    select grp, bool_and(up) as vpn_up, min(received_at) as started_at, max(received_at) as ended_at,
           count(*)::integer as beats
    from g group by grp
  )
  select r.vpn_up, r.started_at, r.ended_at, r.beats,
         case when n.started_at is null then 'last'
              when n.started_at - r.ended_at > interval '3 minutes' then 'offline'
              else 'change' end
  from r left join r n on n.grp = r.grp + 1
  order by r.started_at;
$$;

-- thinkpad_latency: per-check latency/failures in fixed buckets (labels only).
create or replace function thinkpad_latency(p_since timestamptz, p_bucket_s integer default 900)
returns table (bucket timestamptz, label text, avg_ms integer, fails integer, samples integer)
language sql stable security invoker
set search_path = public
as $$
  select to_timestamp(floor(extract(epoch from d.received_at) / p_bucket_s) * p_bucket_s) as bucket,
         c->>'label' as label,
         avg((c->>'latency_ms')::numeric)::integer as avg_ms,
         (count(*) filter (where (c->>'ok')::boolean is not true))::integer as fails,
         count(*)::integer as samples
  from device_status d
  cross join lateral jsonb_array_elements(d.payload->'checks') c
  where d.source = 'thinkpad' and d.received_at >= p_since
  group by 1, 2
  order by 1, 2;
$$;

-- service role only (the table has RLS with no policies anyway)
revoke all on function thinkpad_runs(timestamptz) from public, anon, authenticated;
revoke all on function thinkpad_latency(timestamptz, integer) from public, anon, authenticated;
grant execute on function thinkpad_runs(timestamptz) to service_role;
grant execute on function thinkpad_latency(timestamptz, integer) to service_role;
