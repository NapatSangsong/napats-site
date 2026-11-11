import { latencySeriesStart, LATENCY_BUCKET_MS } from "./thinkpad-history";
import { buildView, EMPTY_ALERT_STATE, isOnline, timelineStart, type AlertState, type StatusView } from "./thinkpad-status";
import { getStore } from "./thinkpad-store.server";
import { getDeviceOnline } from "./tuya.server";

export const ALERT_STATE_KEY = "thinkpad:alert-state";
export const RUNS_WINDOW_MS = 14 * 86400_000;

export async function readAlertState(kv: KVNamespace): Promise<AlertState> {
	try {
		const raw = await kv.get(ALERT_STATE_KEY);
		return raw ? { ...EMPTY_ALERT_STATE, ...(JSON.parse(raw) as Partial<AlertState>) } : EMPTY_ALERT_STATE;
	} catch {
		return EMPTY_ALERT_STATE;
	}
}

/** House meter online? Never throws (null = unknown / not configured). */
export async function homeMeterOnline(env: Env): Promise<boolean | null> {
	if (!env.TUYA_DEVICE_ID) return null;
	try {
		return await getDeviceOnline(env, env.RATE_LIMIT_KV);
	} catch {
		return null;
	}
}

/** Everything the /thinkpad page shows, read in parallel. */
export async function loadStatusView(env: Env): Promise<StatusView> {
	const store = getStore(env);
	const now = Date.now();
	const [thinkpad, mac, history, alerts, runs, latency] = await Promise.all([
		store.latest("thinkpad"),
		store.latest("mac"),
		store.history("thinkpad", timelineStart(now)),
		readAlertState(env.RATE_LIMIT_KV),
		store.runs(now - RUNS_WINDOW_MS).catch(() => []),
		store.latency(latencySeriesStart(now), LATENCY_BUCKET_MS / 1000).catch(() => []),
	]);
	// only ask Tuya when it explains something: the ThinkPad is gone
	const homeMeter = thinkpad && !isOnline(thinkpad.received_at, now) ? await homeMeterOnline(env) : undefined;
	return buildView({ now, thinkpad, mac, history, alerts, runs, latency, homeMeterOnline: homeMeter, crdUrl: env.THINKPAD_CRD_URL });
}
