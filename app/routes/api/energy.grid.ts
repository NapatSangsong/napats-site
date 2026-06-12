import type { Route } from "./+types/energy.grid";
import { requireEnergyAuth } from "~/lib/energy-gate.server";
import { createServiceClient } from "~/lib/supabase.server";

/**
 * Grid-quality data for the dashboard:
 *  - samples: raw 15-min snapshots (voltage/power/frequency) for the last 48 h
 *  - daily:   per-day rollups (energy + voltage min/max) for the last 21 days
 * Sampling only started when the cron began writing grid_samples — the UI
 * shows a "collecting" state until enough points exist.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await requireEnergyAuth(request, env);
	const supabase = createServiceClient(env);

	const since = Date.now() - 48 * 3600 * 1000;
	const [samplesRes, dailyRes] = await Promise.all([
		supabase
			.from("grid_samples")
			.select("ts,voltage_v,power_w,freq_hz")
			.gte("ts", since)
			.order("ts", { ascending: true })
			.limit(400),
		supabase
			.from("energy_daily")
			.select("day,date_bkk,total_kwh,on_kwh,off_kwh,baseload_kwh_min,hours,vmin,vmax,samples")
			.order("day", { ascending: false })
			.limit(21),
	]);

	if (samplesRes.error || dailyRes.error) {
		return Response.json(
			{ ok: false, error: samplesRes.error?.message ?? dailyRes.error?.message },
			{ status: 500, headers: { "Cache-Control": "no-store" } },
		);
	}

	return Response.json(
		{
			ok: true,
			samples: (samplesRes.data ?? []).map((s) => ({
				ts: Number(s.ts),
				v: Number(s.voltage_v),
				w: Number(s.power_w),
				f: Number(s.freq_hz),
			})),
			daily: (dailyRes.data ?? []).reverse().map((d) => ({
				day: Number(d.day),
				date: String(d.date_bkk),
				totalKwh: Number(d.total_kwh),
				onKwh: Number(d.on_kwh),
				offKwh: Number(d.off_kwh),
				baseload: d.baseload_kwh_min != null ? Number(d.baseload_kwh_min) : null,
				hours: Number(d.hours),
				vmin: d.vmin != null ? Number(d.vmin) : null,
				vmax: d.vmax != null ? Number(d.vmax) : null,
				samples: Number(d.samples ?? 0),
			})),
			fetchedAt: Date.now(),
		},
		{ headers: { "Cache-Control": "private, max-age=300" } },
	);
}
