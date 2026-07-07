/**
 * Cron companions to syncEnergyReadings (every 15 min):
 *
 *  - sampleGrid(): persist one live snapshot per tick into grid_samples.
 *    The meter reports voltage/power/frequency in realtime but only the
 *    energy counter survives into energy_readings — without sampling here,
 *    grid-quality trends (sag/swell, frequency drift) are impossible.
 *
 *  - rollupDaily(): recompute yesterday + today into energy_daily on every
 *    tick. Idempotent upserts — today's row stays fresh and yesterday gets
 *    continuously "finalized" without midnight-edge special-casing. The
 *    attribution rules mirror analyze() in energy-calc.ts exactly
 *    (diff > 0, gap ≤ 2 h, attribute to the LATER point's BKK hour).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CALIBRATION, ENERGY_CONST, dayNum, hourOf, isOnPeakHour, weekdayOf } from "./energy-calc";
import { createServiceClient } from "./supabase.server";
import { getLive } from "./tuya.server";

const DAY_MS = 86400_000;
const BKK_MS = 7 * 3600_000;

export async function sampleGrid(env: Env): Promise<void> {
	const live = await getLive(env, env.RATE_LIMIT_KV);
	const supabase = createServiceClient(env);
	const { error } = await supabase.from("grid_samples").insert({
		ts: live.ts,
		power_w: live.power_w,
		voltage_v: live.voltage_v,
		current_a: live.current_a,
		power_factor: live.power_factor,
		freq_hz: live.freq_hz,
	});
	if (error) throw new Error(`grid-sample insert failed: ${error.message}`);
}

async function rollupOne(supabase: SupabaseClient, d: number): Promise<boolean> {
	const start = d * DAY_MS - BKK_MS; // ms epoch of BKK midnight for day d
	const end = start + DAY_MS;

	const { data, error } = await supabase
		.from("energy_readings")
		.select("event_time,value")
		.gte("event_time", start - ENERGY_CONST.MAX_GAP_MS) // prior context for the first diff
		.lt("event_time", end)
		.order("event_time", { ascending: true });
	if (error) throw new Error(`rollup: read readings failed: ${error.message}`);
	if (!data || data.length < 2) return false;

	const hourly = new Map<number, number>();
	for (let i = 1; i < data.length; i++) {
		const tPrev = Number(data[i - 1].event_time);
		const t = Number(data[i].event_time);
		let dk = (Number(data[i].value) - Number(data[i - 1].value)) * ENERGY_CONST.SCALE;
		if (dk <= 0 || t - tPrev > ENERGY_CONST.MAX_GAP_MS) continue;
		// Skip device-rebase jumps (meter recalibration), not real consumption.
		if (dk > CALIBRATION.rebaseDeltaUnits * ENERGY_CONST.SCALE) continue;
		// Meter calibration: per-segment factor (mirrors calibratePoints)
		dk *= t < CALIBRATION.boundaryMs ? CALIBRATION.factor : CALIBRATION.factorAfter;
		if (dayNum(t) !== d) continue;
		const h = hourOf(t);
		hourly.set(h, (hourly.get(h) ?? 0) + dk);
	}
	if (hourly.size === 0) return false;

	const wd = weekdayOf(d);
	let on = 0;
	let off = 0;
	let total = 0;
	let min = Infinity;
	for (const [h, v] of hourly) {
		total += v;
		if (isOnPeakHour(wd, h)) on += v;
		else off += v;
		if (v < min) min = v;
	}

	// grid samples for the day (≤ 96 rows at one per 15-min tick)
	const { data: gs } = await supabase
		.from("grid_samples")
		.select("voltage_v,freq_hz")
		.gte("ts", start)
		.lt("ts", end)
		.limit(500);
	let vmin: number | null = null;
	let vmax: number | null = null;
	let fmin: number | null = null;
	let fmax: number | null = null;
	for (const s of gs ?? []) {
		const v = Number(s.voltage_v);
		const f = Number(s.freq_hz);
		if (Number.isFinite(v) && v > 0) {
			vmin = vmin == null ? v : Math.min(vmin, v);
			vmax = vmax == null ? v : Math.max(vmax, v);
		}
		if (Number.isFinite(f) && f > 0) {
			fmin = fmin == null ? f : Math.min(fmin, f);
			fmax = fmax == null ? f : Math.max(fmax, f);
		}
	}

	const { error: upError } = await supabase.from("energy_daily").upsert(
		{
			day: d,
			date_bkk: new Date(d * DAY_MS).toISOString().slice(0, 10),
			total_kwh: total,
			on_kwh: on,
			off_kwh: off,
			baseload_kwh_min: Number.isFinite(min) ? min : null,
			hours: hourly.size,
			vmin,
			vmax,
			freq_min: fmin,
			freq_max: fmax,
			samples: gs?.length ?? 0,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "day" },
	);
	if (upError) throw new Error(`rollup: upsert day ${d} failed: ${upError.message}`);
	return true;
}

export async function rollupDaily(env: Env): Promise<{ days: number }> {
	const supabase = createServiceClient(env);
	const today = dayNum(Date.now());
	let days = 0;
	for (const d of [today - 1, today]) {
		if (await rollupOne(supabase, d)) days++;
	}
	return { days };
}
