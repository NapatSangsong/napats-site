/**
 * Data layer for /energy/report — reads Supabase server-side so the page needs
 * no client API gate and never ships raw readings to the browser:
 *
 *  - fetchDailyAll(): every energy_daily row (calibration-corrected, TOU-split
 *    by the cron rollup). ~365 rows/year — cheap, uncapped, powers the month
 *    switcher / compare / cycle totals.
 *  - fetchCycleHourly(): raw energy_readings for ONE cycle bucketed to
 *    (day, hour) — ≤ 31×24 numbers for the drill-down. Delta attribution
 *    mirrors rollupOne() in energy-rollup.server.ts exactly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
	CALIBRATION,
	ENERGY_CONST,
	type BillingCycle,
	billingCycleForYm,
	billingCycleOf,
	cycleOutlook,
	dayNum,
	hourOf,
} from "./energy-calc";
import { createServiceClient } from "./supabase.server";
import type { ReportDailyRow, ReportHourlyDay, ReportPayload } from "~/components/energy-report/types";

const DAY_MS = 86400_000;
const BKK_MS = 7 * 3600_000;
const PAGE = 1000; // PostgREST response cap — page with .range()

export async function fetchDailyAll(supabase: SupabaseClient): Promise<ReportDailyRow[]> {
	const rows: ReportDailyRow[] = [];
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await supabase
			.from("energy_daily")
			.select("day,date_bkk,total_kwh,on_kwh,off_kwh,hours,baseload_kwh_min")
			.order("day", { ascending: true })
			.range(offset, offset + PAGE - 1);
		if (error) throw new Error(`report: read energy_daily failed: ${error.message}`);
		for (const d of data ?? []) {
			rows.push({
				day: Number(d.day),
				date: String(d.date_bkk),
				totalKwh: Number(d.total_kwh),
				onKwh: Number(d.on_kwh),
				offKwh: Number(d.off_kwh),
				hours: Number(d.hours),
				baseload: d.baseload_kwh_min != null ? Number(d.baseload_kwh_min) : null,
			});
		}
		if (!data || data.length < PAGE) break;
	}
	return rows;
}

export async function fetchCycleHourly(
	supabase: SupabaseClient,
	cycle: BillingCycle,
): Promise<ReportHourlyDay[]> {
	const startMs = cycle.startDay * DAY_MS - BKK_MS; // BKK midnight of cycle start
	const endMs = (cycle.endDay + 1) * DAY_MS - BKK_MS;

	const raw: [number, number][] = [];
	for (let offset = 0; ; offset += PAGE) {
		const { data, error } = await supabase
			.from("energy_readings")
			.select("event_time,value")
			.gte("event_time", startMs - ENERGY_CONST.MAX_GAP_MS) // prior context for the first diff
			.lt("event_time", endMs)
			.order("event_time", { ascending: true })
			.range(offset, offset + PAGE - 1);
		if (error) throw new Error(`report: read energy_readings failed: ${error.message}`);
		for (const r of data ?? []) raw.push([Number(r.event_time), Number(r.value)]);
		if (!data || data.length < PAGE) break;
	}

	// Same attribution rules as rollupOne(): diff > 0, gap ≤ 2h, skip device
	// rebase, calibrate pre-boundary, attribute to the LATER point's BKK hour.
	const byDay = new Map<number, number[]>();
	for (let i = 1; i < raw.length; i++) {
		const [tPrev] = raw[i - 1];
		const [t, v] = raw[i];
		let dk = (v - raw[i - 1][1]) * ENERGY_CONST.SCALE;
		if (dk <= 0 || t - tPrev > ENERGY_CONST.MAX_GAP_MS) continue;
		if (dk > CALIBRATION.rebaseDeltaUnits * ENERGY_CONST.SCALE) continue;
		dk *= t < CALIBRATION.boundaryMs ? CALIBRATION.factor : CALIBRATION.factorAfter;
		const d = dayNum(t);
		if (d < cycle.startDay || d > cycle.endDay) continue;
		let hours = byDay.get(d);
		if (!hours) {
			hours = new Array<number>(24).fill(0);
			byDay.set(d, hours);
		}
		hours[hourOf(t)] += dk;
	}
	return [...byDay.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([day, kwh]) => ({ day, kwh }));
}

/** "YYYY-MM" → that month's cycle; anything else → the cycle containing now */
export function resolveCycle(ymParam: string | null, nowMs: number): BillingCycle {
	const m = ymParam?.match(/^(\d{4})-(\d{2})$/);
	if (m) {
		const y = Number(m[1]);
		const mo = Number(m[2]);
		if (y >= 2020 && y <= 2100 && mo >= 1 && mo <= 12) return billingCycleForYm(y, mo);
	}
	return billingCycleOf(nowMs);
}

/** Assemble the full report payload — shared by the page loader and the API */
export async function loadReport(
	env: { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string },
	ymParam: string | null,
	nowMs: number,
): Promise<{ payload: ReportPayload; isPastCycle: boolean }> {
	const cycle = resolveCycle(ymParam, nowMs);
	const supabase = createServiceClient(env);
	const [daily, hourly] = await Promise.all([
		fetchDailyAll(supabase),
		fetchCycleHourly(supabase, cycle),
	]);
	return {
		payload: {
			ok: true,
			cycle,
			daily,
			hourly,
			outlook: cycleOutlook(daily, cycle),
			fetchedAt: nowMs,
		},
		isPastCycle: cycle.endDay < dayNum(nowMs),
	};
}
