/**
 * ThinkPad LINE alerts + retention, run from the every-5-min cron (workers/app.ts).
 * Incident state lives in KV so each incident is pushed once on start and
 * once on recovery; it is saved only after every push succeeded, so a failed
 * LINE call is retried on the next tick instead of being lost.
 */
import { pushLine } from "./energy-alerts.server";
import { evaluateAlerts } from "./thinkpad-alerts";
import { EMPTY_ALERT_STATE, type AlertState } from "./thinkpad-status";
import { getStore } from "./thinkpad-store.server";

export const ALERT_STATE_KEY = "thinkpad:alert-state";
const RECENT_MS = 60 * 60_000;
const RETENTION_MS = 14 * 86400_000;

export async function readAlertState(kv: KVNamespace): Promise<AlertState> {
	try {
		const raw = await kv.get(ALERT_STATE_KEY);
		return raw ? { ...EMPTY_ALERT_STATE, ...(JSON.parse(raw) as Partial<AlertState>) } : EMPTY_ALERT_STATE;
	} catch {
		return EMPTY_ALERT_STATE;
	}
}

export async function runThinkpadAlerts(env: Env): Promise<{ messages: number }> {
	const store = getStore(env);
	const now = Date.now();
	const [latest, recent, prev] = await Promise.all([
		store.latest("thinkpad"),
		store.history("thinkpad", now - RECENT_MS),
		readAlertState(env.RATE_LIMIT_KV),
	]);
	const { state, messages } = evaluateAlerts(now, latest?.received_at ?? null, recent, prev);
	for (const m of messages) await pushLine(env, m);
	if (JSON.stringify(state) !== JSON.stringify(prev)) {
		await env.RATE_LIMIT_KV.put(ALERT_STATE_KEY, JSON.stringify(state));
	}

	// retention: once an hour
	const purgeKey = `thinkpad:purge:${Math.floor(now / 3600_000)}`;
	if (!(await env.RATE_LIMIT_KV.get(purgeKey))) {
		await store.purge(now - RETENTION_MS);
		await env.RATE_LIMIT_KV.put(purgeKey, "1", { expirationTtl: 2 * 3600 });
	}
	return { messages: messages.length };
}
