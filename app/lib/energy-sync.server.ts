/**
 * Cron sync: pull forward_energy_total report logs from Tuya into Supabase.
 * Tuya cloud only retains ~7 days of logs, so the cron (every 15 min) keeps
 * a permanent copy in energy_readings. Dedupe happens at the DB level via the
 * event_time primary key (upsert with ignoreDuplicates).
 *
 * Progress is tracked with a KV cursor so the window always advances even
 * through empty stretches (e.g. before the device's first report). Without
 * it, an empty first window would be re-fetched forever.
 */
import { createServiceClient } from "./supabase.server";
import { fetchReportLogs } from "./tuya.server";

/** Re-fetch overlap so late-arriving points around the cursor aren't missed */
const OVERLAP_MS = 3600 * 1000;
/** First run: Tuya free tier retains 7 days */
const BACKFILL_MS = 7 * 86400 * 1000;
/**
 * Cap the window per run to stay well under the Workers subrequest limit
 * (12 chunks of 4h + pagination + token + Supabase calls). A cold backfill
 * completes over the first few cron ticks as the cursor advances.
 */
const MAX_WINDOW_MS = 48 * 3600 * 1000;

const CURSOR_KEY = "energy:sync:cursor";

export interface SyncResult {
	start: number;
	end: number;
	fetched: number;
}

export async function syncEnergyReadings(env: Env): Promise<SyncResult> {
	const supabase = createServiceClient(env);
	const now = Date.now();

	let cursor = Number(await env.RATE_LIMIT_KV.get(CURSOR_KEY)) || null;
	if (!cursor) {
		const { data, error } = await supabase
			.from("energy_readings")
			.select("event_time")
			.order("event_time", { ascending: false })
			.limit(1);
		if (error) throw new Error(`energy-sync: read max event_time failed: ${error.message}`);
		const last = data?.[0]?.event_time != null ? Number(data[0].event_time) : null;
		cursor = last != null ? last - OVERLAP_MS : now - BACKFILL_MS;
	}

	const start = cursor;
	const end = Math.min(start + MAX_WINDOW_MS, now);
	if (start >= end) return { start, end, fetched: 0 };

	const logs = await fetchReportLogs(env, env.RATE_LIMIT_KV, start, end);
	const rows = logs.map((l) => ({ event_time: l.event_time, value: Number(l.value) }));

	for (let i = 0; i < rows.length; i += 500) {
		const { error: upsertError } = await supabase
			.from("energy_readings")
			.upsert(rows.slice(i, i + 500), { onConflict: "event_time", ignoreDuplicates: true });
		if (upsertError) throw new Error(`energy-sync: upsert failed: ${upsertError.message}`);
	}

	// advance even when the window was empty; keep a 1h overlap for safety
	await env.RATE_LIMIT_KV.put(CURSOR_KEY, String(Math.max(start, end - OVERLAP_MS)));
	return { start, end, fetched: rows.length };
}
