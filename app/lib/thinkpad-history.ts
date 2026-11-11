/**
 * Pure history math for /thinkpad (no I/O, unit-tested): VPN/online runs,
 * 7-day stats, VPN session-length prediction and latency series.
 * computeRuns mirrors the SQL function thinkpad_runs (migration 011) so the
 * dev memory store and the tests use the same rules as production.
 */
import type { HistoryPoint } from "./thinkpad-store.server";

/** same as ONLINE_MS in thinkpad-status.ts and the 3-minute gap in thinkpad_runs (kept here to avoid an import cycle) */
const ONLINE_MS = 3 * 60_000;

export type RunEnd = "change" | "offline" | "last";

export interface Run {
	vpn_up: boolean;
	start: number;
	/** time of the last heartbeat in the run */
	end: number;
	beats: number;
	ended_by: RunEnd;
}

const BEAT_MS = 60_000; // one heartbeat covers about a minute
const runMs = (r: Run) => r.end - r.start + BEAT_MS;

export function computeRuns(points: HistoryPoint[]): Run[] {
	const runs: Run[] = [];
	let cur: Run | null = null;
	for (const p of points) {
		const up = p.vpn_up === true;
		if (cur && cur.vpn_up === up && p.t - cur.end <= ONLINE_MS) {
			cur.end = p.t;
			cur.beats++;
			continue;
		}
		if (cur) {
			cur.ended_by = p.t - cur.end > ONLINE_MS ? "offline" : "change";
			runs.push(cur);
		}
		cur = { vpn_up: up, start: p.t, end: p.t, beats: 1, ended_by: "last" };
	}
	if (cur) runs.push(cur);
	return runs;
}

// ---------- 7-day stats ----------

const DAY_MS = 86400_000;
const BKK_MS = 7 * 3600_000;
const bkkDayStart = (t: number) => Math.floor((t + BKK_MS) / DAY_MS) * DAY_MS - BKK_MS;

export interface DayStat {
	/** BKK midnight, ms epoch */
	day: number;
	/** share of the observed part of the day with VPN up (null = no data that day) */
	vpn_pct: number | null;
	online_pct: number | null;
}

export interface Stats {
	/** start of the period the numbers cover (first heartbeat, or now − days) */
	since: number;
	online_pct: number;
	vpn_pct: number;
	vpn_drops: number;
	offline_events: number;
	longest_offline_ms: number;
	days: DayStat[];
	/** VPN down → back up while the ThinkPad stayed online (how long reconnecting took) */
	reconnect_avg_ms: number | null;
	reconnect_last_ms: number | null;
	/** VPN drops per Bangkok hour of day (0–23) */
	drops_by_hour: number[];
}

/** overlap of [a0,a1) and [b0,b1) */
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function stats(runs: Run[], now: number, days = 7): Stats | null {
	if (runs.length === 0) return null;
	const windowStart = now - days * DAY_MS;
	const since = Math.max(windowStart, runs[0].start);
	const span = Math.max(1, now - since);
	let online = 0;
	let vpn = 0;
	let drops = 0;
	let offlineEvents = 0;
	let longest = 0;
	runs.forEach((r, i) => {
		const ms = overlap(r.start, r.start + runMs(r), since, now);
		online += ms;
		if (r.vpn_up) vpn += ms;
		if (r.end < since) return;
		if (r.vpn_up && r.ended_by === "change") drops++;
		const nextStart = i + 1 < runs.length ? runs[i + 1].start : null;
		if (r.ended_by === "offline" && nextStart != null) {
			offlineEvents++;
			longest = Math.max(longest, nextStart - r.end);
		}
	});
	const reconnects: number[] = [];
	const byHour = new Array<number>(24).fill(0);
	runs.forEach((r, i) => {
		if (r.end < since) return;
		if (r.vpn_up && r.ended_by === "change") byHour[new Date(r.end + BKK_MS).getUTCHours()]++;
		const prev = runs[i - 1];
		const next = runs[i + 1];
		if (!r.vpn_up && r.ended_by === "change" && prev?.vpn_up && prev.ended_by === "change" && next?.vpn_up) {
			reconnects.push(next.start - prev.end);
		}
	});
	const last = runs[runs.length - 1];
	if (now - last.end > ONLINE_MS) {
		offlineEvents++;
		longest = Math.max(longest, now - last.end);
	}

	const dayStats: DayStat[] = [];
	const today = bkkDayStart(now);
	for (let k = days - 1; k >= 0; k--) {
		const d0 = today - k * DAY_MS;
		const lo = Math.max(d0, since);
		const hi = Math.min(d0 + DAY_MS, now);
		if (hi <= lo) {
			dayStats.push({ day: d0, vpn_pct: null, online_pct: null });
			continue;
		}
		let on = 0;
		let up = 0;
		for (const r of runs) {
			const ms = overlap(r.start, r.start + runMs(r), lo, hi);
			on += ms;
			if (r.vpn_up) up += ms;
		}
		dayStats.push({ day: d0, vpn_pct: Math.min(100, (up / (hi - lo)) * 100), online_pct: Math.min(100, (on / (hi - lo)) * 100) });
	}

	return {
		since,
		online_pct: Math.min(100, (online / span) * 100),
		vpn_pct: Math.min(100, (vpn / span) * 100),
		vpn_drops: drops,
		offline_events: offlineEvents,
		longest_offline_ms: longest,
		days: dayStats,
		reconnect_avg_ms: reconnects.length ? reconnects.reduce((a, b) => a + b, 0) / reconnects.length : null,
		reconnect_last_ms: reconnects.length ? reconnects[reconnects.length - 1] : null,
		drops_by_hour: byHour,
	};
}

// ---------- VPN session length prediction ----------

export const MIN_SESSION_MS = 30 * 60_000;
export const SESSION_SPREAD_MAX = 0.15; // (max − min) / median

export interface Prediction {
	/** completed sessions used (VPN went down while the ThinkPad stayed online) */
	n: number;
	typical_ms: number | null;
	/** sessions are similar enough to look like a fixed session limit */
	consistent: boolean;
	/** start + typical of the current VPN run, when consistent and connected now */
	predicted_end: number | null;
	current_start: number | null;
}

export function predictVpnEnd(runs: Run[], now: number): Prediction {
	const lengths = runs
		.filter((r) => r.vpn_up && r.ended_by === "change" && runMs(r) >= MIN_SESSION_MS)
		.map(runMs)
		.sort((a, b) => a - b);
	const n = lengths.length;
	const last = runs[runs.length - 1];
	const current = last && last.vpn_up && now - last.end <= ONLINE_MS ? last.start : null;
	if (n < 2) return { n, typical_ms: n ? lengths[0] : null, consistent: false, predicted_end: null, current_start: current };
	const median = n % 2 ? lengths[(n - 1) / 2] : (lengths[n / 2 - 1] + lengths[n / 2]) / 2;
	const consistent = (lengths[n - 1] - lengths[0]) / median <= SESSION_SPREAD_MAX;
	return {
		n,
		typical_ms: median,
		consistent,
		predicted_end: consistent && current != null ? current + median : null,
		current_start: current,
	};
}

// ---------- latency series ----------

export interface LatencyRow {
	bucket: number;
	label: string;
	avg_ms: number | null;
	fails: number;
	samples: number;
}

export const LATENCY_BUCKET_MS = 15 * 60_000;
export const LATENCY_BUCKETS = DAY_MS / LATENCY_BUCKET_MS; // 96

export interface LatencySeries {
	start: number;
	bucketMs: number;
	series: Record<string, { avg: Array<number | null>; fails: number[] }>;
}

export function latencySeriesStart(now: number): number {
	return Math.ceil(now / LATENCY_BUCKET_MS) * LATENCY_BUCKET_MS - DAY_MS;
}

export function latencySeries(rows: LatencyRow[], now: number): LatencySeries {
	const start = latencySeriesStart(now);
	const series: LatencySeries["series"] = {};
	for (const r of rows) {
		const i = Math.floor((r.bucket - start) / LATENCY_BUCKET_MS);
		if (i < 0 || i >= LATENCY_BUCKETS) continue;
		const s = (series[r.label] ??= {
			avg: new Array<number | null>(LATENCY_BUCKETS).fill(null),
			fails: new Array<number>(LATENCY_BUCKETS).fill(0),
		});
		s.avg[i] = r.avg_ms;
		s.fails[i] = r.fails;
	}
	return { start, bucketMs: LATENCY_BUCKET_MS, series };
}
